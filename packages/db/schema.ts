import {
  bigint,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const messageRoleEnum = pgEnum("message_role", [
  "system",
  "user",
  "assistant",
  "tool",
]);

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  passwordHash: text("password_hash"),
  image: text("image"),
  githubUserId: bigint("github_user_id", { mode: "number" }).unique(),
  githubLogin: varchar("github_login", { length: 255 }),
  githubInstallationId: bigint("github_installation_id", {
    mode: "number",
  }).unique(),
  googleId: varchar("google_id", { length: 255 }).unique(),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleIdToken: text("google_id_token"),
  googleTokenExpiresAt: timestamp("google_token_expires_at", {
    withTimezone: true,
  }),
  googleScope: text("google_scope"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const sessionsTable = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const repositoriesTable = pgTable(
  "repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    githubRepoId: bigint("github_repo_id", { mode: "number" }).unique(),
    owner: varchar("owner", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 511 }).notNull(),
    defaultBranch: varchar("default_branch", { length: 255 })
      .notNull()
      .default("main"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("repositories_user_id_full_name_idx").on(
      table.userId,
      table.fullName,
    ),
    index("repositories_user_id_idx").on(table.userId),
  ],
);

export const conversationsTable = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositoriesTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 })
      .notNull()
      .default("New conversation"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("conversations_user_id_idx").on(table.userId),
    index("conversations_repository_id_idx").on(table.repositoryId),
    index("conversations_user_id_updated_at_idx").on(
      table.userId,
      table.updatedAt,
    ),
  ],
);

export const conversationSandboxesTable = pgTable("conversation_sandboxes", {
  conversationId: uuid("conversation_id")
    .primaryKey()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  sandboxId: text("sandbox_id"),
  snapshotId: text("snapshot_id"),
  workspaceReady: boolean("workspace_ready").notNull().default(false),
  lockToken: uuid("lock_token"),
  lockExpiresAt: timestamp("lock_expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const messagesTable = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content"),
    toolCalls: jsonb("tool_calls").$type<unknown[]>(),
    toolCallId: varchar("tool_call_id", { length: 255 }),
    toolName: varchar("tool_name", { length: 255 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("messages_conversation_id_created_at_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type Session = typeof sessionsTable.$inferSelect;
export type NewSession = typeof sessionsTable.$inferInsert;
export type Repository = typeof repositoriesTable.$inferSelect;
export type NewRepository = typeof repositoriesTable.$inferInsert;
export type Conversation = typeof conversationsTable.$inferSelect;
export type NewConversation = typeof conversationsTable.$inferInsert;
export type ConversationSandbox =
  typeof conversationSandboxesTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
export type NewMessage = typeof messagesTable.$inferInsert;
