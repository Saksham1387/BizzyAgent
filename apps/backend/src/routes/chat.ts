import { Router } from "express";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { Agent, type AgentHistoryMessage } from "agent";
import { conversationsTable, db, messagesTable, repositoriesTable } from "db";
import { HttpError } from "../lib/errors.ts";
import { isUuid, requireString } from "../lib/http.ts";
import { requireAuth } from "../middleware/auth.ts";

export const chatRouter = Router();

type CreatedArtifact = {
  kind: "issue" | "pull_request";
  number: number;
  title: string;
  url: string;
  repository: string;
};

chatRouter.post("/", requireAuth, async (req, res) => {
  const conversationId = requireString(
    req.body?.conversationId,
    "conversationId",
    { max: 64 },
  );
  const content = requireString(req.body?.message, "message", { max: 20_000 });

  if (!isUuid(conversationId)) {
    throw new HttpError(400, "conversationId must be a valid UUID");
  }

  const user = req.user!;

  if (!user.githubInstallationId) {
    throw new HttpError(409, "Connect GitHub before using chat");
  }

  const [conversation] = await db
    .select({
      conversation: conversationsTable,
      repository: repositoriesTable,
    })
    .from(conversationsTable)
    .innerJoin(
      repositoriesTable,
      eq(conversationsTable.repositoryId, repositoriesTable.id),
    )
    .where(
      and(
        eq(conversationsTable.id, conversationId),
        eq(conversationsTable.userId, user.id),
        eq(repositoriesTable.userId, user.id),
      ),
    )
    .limit(1);

  if (!conversation) {
    throw new HttpError(404, "Conversation not found");
  }

  const historyRows = await db
    .select({
      role: messagesTable.role,
      content: messagesTable.content,
    })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        inArray(messagesTable.role, ["user", "assistant"]),
        isNotNull(messagesTable.content),
      ),
    )
    .orderBy(desc(messagesTable.createdAt))
    .limit(50);

  const history: AgentHistoryMessage[] = [];

  for (const message of historyRows.reverse()) {
    if (
      message.content &&
      (message.role === "user" || message.role === "assistant")
    ) {
      history.push({ role: message.role, content: message.content });
    }
  }

  const agent = new Agent({
    repoUrl: `https://github.com/${conversation.repository.fullName}.git`,
    github: { installationId: user.githubInstallationId },
  });

  let result;

  try {
    result = await agent.run(content, { history });
  } catch (error) {
    console.error("Chat agent failed", error);
    throw new HttpError(502, "Agent failed to process the message");
  }

  const nextTitle =
    conversation.conversation.title === "New conversation"
      ? content.replace(/\s+/g, " ").slice(0, 80)
      : null;

  const agentMessages = result.messages
    .slice(history.length + 2)
    .filter(
      (message) => message.role === "assistant" || message.role === "tool",
    );
  if (
    !agentMessages.some(
      (message) =>
        message.role === "assistant" && message.content === result.answer,
    )
  ) {
    agentMessages.push({ role: "assistant", content: result.answer });
  }
  const toolCallsById = new Map<string, { name: string; arguments: string }>();
  for (const message of agentMessages) {
    if (message.role === "assistant") {
      for (const call of message.toolCalls ?? []) {
        toolCallsById.set(call.id, {
          name: call.function.name,
          arguments: call.function.arguments,
        });
      }
    }
  }

  const artifacts: CreatedArtifact[] = [];
  for (const message of agentMessages) {
    if (
      message.role !== "tool" ||
      typeof message.content !== "string" ||
      !message.content
    ) {
      continue;
    }
    const call = toolCallsById.get(message.toolCallId);
    if (
      !call ||
      (call.name !== "github_create_issue" &&
        call.name !== "github_create_pull_request")
    ) {
      continue;
    }

    let output: unknown;
    let input: unknown;
    try {
      output = JSON.parse(message.content);
      input = JSON.parse(call.arguments);
    } catch {
      continue;
    }

    if (typeof output !== "object" || output === null) continue;
    const created = output as { number?: unknown; url?: unknown };
    if (
      typeof created.number !== "number" ||
      !Number.isSafeInteger(created.number) ||
      created.number < 1 ||
      typeof created.url !== "string" ||
      !/^https:\/\/github\.com\//.test(created.url)
    ) {
      continue;
    }

    const issueInput =
      typeof input === "object" && input !== null
        ? (input as { title?: unknown })
        : {};
    artifacts.push({
      kind: call.name === "github_create_issue" ? "issue" : "pull_request",
      number: created.number,
      title:
        typeof issueInput.title === "string" && issueInput.title.trim()
          ? issueInput.title.trim()
          : call.name === "github_create_issue"
            ? "New issue"
            : "New pull request",
      url: created.url,
      repository: conversation.repository.fullName,
    });
  }

  let finalAssistantIndex = -1;
  agentMessages.forEach((message, index) => {
    if (message.role === "assistant") finalAssistantIndex = index;
  });

  const [userMessage, agentMessageRows] = await db.transaction(async (tx) => {
    const createdAt = Date.now();
    const [createdUserMessage] = await tx
      .insert(messagesTable)
      .values({
        conversationId,
        role: "user",
        content,
        createdAt: new Date(createdAt),
      })
      .returning();

    if (!createdUserMessage) {
      throw new Error("Failed to persist user message");
    }

    const values = agentMessages.map((message, index) => {
      if (message.role === "assistant") {
        return {
          conversationId,
          role: "assistant" as const,
          content: typeof message.content === "string" ? message.content : null,
          toolCalls: message.toolCalls ?? null,
          metadata: {
            repo: conversation.repository.fullName,
            ...(index === finalAssistantIndex ? { artifacts } : {}),
          },
          createdAt: new Date(createdAt + index + 1),
        };
      }

      return {
        conversationId,
        role: "tool" as const,
        content: typeof message.content === "string" ? message.content : null,
        toolCallId: message.toolCallId,
        toolName: toolCallsById.get(message.toolCallId)?.name ?? "unknown",
        createdAt: new Date(createdAt + index + 1),
      };
    });
    const createdAgentMessages = values.length
      ? await tx.insert(messagesTable).values(values).returning()
      : [];

    await tx
      .update(conversationsTable)
      .set({
        ...(nextTitle ? { title: nextTitle } : {}),
        updatedAt: new Date(),
      })
      .where(eq(conversationsTable.id, conversationId));

    return [createdUserMessage, createdAgentMessages] as const;
  });

  const orderedAgentMessages = [...agentMessageRows].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );
  const assistantMessage = [...orderedAgentMessages]
    .reverse()
    .find((message) => message.role === "assistant");

  if (!assistantMessage) {
    throw new Error("Failed to persist assistant response");
  }

  res.json({
    response: result.answer,
    userMessage,
    assistantMessage,
    activityMessages: orderedAgentMessages,
  });
});
