import { Router } from "express";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { Agent, type AgentHistoryMessage } from "agent";
import { conversationsTable, db, messagesTable, repositoriesTable } from "db";
import { HttpError } from "../lib/errors.ts";
import { isUuid, requireString } from "../lib/http.ts";
import { requireAuth } from "../middleware/auth.ts";

export const chatRouter = Router();

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
  const toolNames = new Map<string, string>();
  for (const message of agentMessages) {
    if (message.role === "assistant") {
      for (const call of message.toolCalls ?? []) {
        toolNames.set(call.id, call.function.name);
      }
    }
  }

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
          metadata: { repo: conversation.repository.fullName },
          createdAt: new Date(createdAt + index + 1),
        };
      }

      return {
        conversationId,
        role: "tool" as const,
        content: typeof message.content === "string" ? message.content : null,
        toolCallId: message.toolCallId,
        toolName: toolNames.get(message.toolCallId) ?? "unknown",
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
