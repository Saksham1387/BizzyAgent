import { Router } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  conversationsTable,
  db,
  messagesTable,
  repositoriesTable,
  type Repository,
} from "db";
import { HttpError } from "../lib/errors.ts";
import { isUuid, optionalString, requireString } from "../lib/http.ts";
import { requireAuth } from "../middleware/auth.ts";

export const conversationsRouter = Router();

function normalizeRepoPart(value: string, field: string) {
  if (!/^[A-Za-z0-9_.-]+$/.test(value)) {
    throw new HttpError(400, `${field} is not a valid GitHub name`);
  }

  return value;
}

function parseRepoUrl(value: string) {
  const clean = value
    .trim()
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");

  try {
    const url = new URL(clean);

    if (url.hostname !== "github.com") {
      throw new Error("Unsupported host");
    }

    const [owner, name] = url.pathname.split("/").filter(Boolean);

    if (!owner || !name) {
      throw new Error("Missing owner or repository");
    }

    return {
      owner: normalizeRepoPart(owner, "owner"),
      name: normalizeRepoPart(name, "repository"),
    };
  } catch {
    const match = clean.match(/^([^/\s]+)\/([^/\s]+)$/);

    if (!match) {
      throw new HttpError(400, "repoUrl must be a GitHub repository");
    }

    return {
      owner: normalizeRepoPart(match[1]!, "owner"),
      name: normalizeRepoPart(match[2]!, "repository"),
    };
  }
}

async function findOrCreateRepository(
  userId: string,
  input: {
    owner: string;
    name: string;
    defaultBranch: string;
  },
): Promise<Repository> {
  const owner = normalizeRepoPart(input.owner, "owner");
  const name = normalizeRepoPart(input.name, "repository");
  const fullName = `${owner}/${name}`;

  const [created] = await db
    .insert(repositoriesTable)
    .values({
      userId,
      owner,
      name,
      fullName,
      defaultBranch: input.defaultBranch,
    })
    .onConflictDoNothing({
      target: [repositoriesTable.userId, repositoriesTable.fullName],
    })
    .returning();

  if (created) {
    return created;
  }

  const [existing] = await db
    .select()
    .from(repositoriesTable)
    .where(
      and(
        eq(repositoriesTable.userId, userId),
        eq(repositoriesTable.fullName, fullName),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("Failed to resolve repository");
  }

  return existing;
}

conversationsRouter.get("/", requireAuth, async (req, res) => {
  const rows = await db
    .select({
      conversation: conversationsTable,
      repository: repositoriesTable,
    })
    .from(conversationsTable)
    .innerJoin(
      repositoriesTable,
      eq(conversationsTable.repositoryId, repositoriesTable.id),
    )
    .where(eq(conversationsTable.userId, req.user!.id))
    .orderBy(desc(conversationsTable.updatedAt));

  res.json({
    conversations: rows.map(({ conversation, repository }) => ({
      ...conversation,
      repository,
    })),
  });
});

conversationsRouter.get("/:id", requireAuth, async (req, res) => {
  const rawConversationId = req.params.id;
  const conversationId = Array.isArray(rawConversationId)
    ? rawConversationId[0]
    : rawConversationId;

  if (!conversationId || !isUuid(conversationId)) {
    throw new HttpError(400, "Conversation id must be a valid UUID");
  }

  const [row] = await db
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
        eq(conversationsTable.userId, req.user!.id),
        eq(repositoriesTable.userId, req.user!.id),
      ),
    )
    .limit(1);

  if (!row) {
    throw new HttpError(404, "Conversation not found");
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(asc(messagesTable.createdAt));

  res.json({
    conversation: row.conversation,
    repository: row.repository,
    messages,
  });
});

conversationsRouter.post("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const body = req.body ?? {};
  const title =
    optionalString(body.title, "title", { max: 255 }) ?? "New conversation";

  let repository: Repository;

  if (body.repositoryId !== undefined) {
    const repositoryId = requireString(body.repositoryId, "repositoryId", {
      max: 64,
    });

    if (!isUuid(repositoryId)) {
      throw new HttpError(400, "repositoryId must be a valid UUID");
    }

    const [existing] = await db
      .select()
      .from(repositoriesTable)
      .where(
        and(
          eq(repositoriesTable.id, repositoryId),
          eq(repositoriesTable.userId, userId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new HttpError(404, "Repository not found");
    }

    repository = existing;
  } else {
    const repoUrl = optionalString(body.repoUrl, "repoUrl", { max: 2048 });
    const owner = optionalString(body.owner, "owner", { max: 255 });
    const name = optionalString(body.name, "name", { max: 255 });
    const defaultBranch =
      optionalString(body.defaultBranch, "defaultBranch", { max: 255 }) ??
      "main";

    const parsed = repoUrl
      ? parseRepoUrl(repoUrl)
      : {
          owner: owner ? normalizeRepoPart(owner, "owner") : "",
          name: name ? normalizeRepoPart(name, "repository") : "",
        };

    if (!parsed.owner || !parsed.name) {
      throw new HttpError(400, "repoUrl or owner and name are required");
    }

    repository = await findOrCreateRepository(userId, {
      owner: parsed.owner,
      name: parsed.name,
      defaultBranch,
    });
  }

  const [conversation] = await db
    .insert(conversationsTable)
    .values({
      userId,
      repositoryId: repository.id,
      title,
    })
    .returning();

  if (!conversation) {
    throw new Error("Failed to create conversation");
  }

  res.status(201).json({ conversation, repository });
});

conversationsRouter.delete("/:id", requireAuth, async (req, res) => {
  const rawConversationId = req.params.id;
  const conversationId = Array.isArray(rawConversationId)
    ? rawConversationId[0]
    : rawConversationId;

  if (!conversationId || !isUuid(conversationId)) {
    throw new HttpError(400, "Conversation id must be a valid UUID");
  }

  const [deleted] = await db
    .delete(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, conversationId),
        eq(conversationsTable.userId, req.user!.id),
      ),
    )
    .returning({ id: conversationsTable.id });

  if (!deleted) {
    throw new HttpError(404, "Conversation not found");
  }

  res.status(204).end();
});
