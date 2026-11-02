export type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  githubUserId: number | null;
  githubLogin: string | null;
  githubInstallationId: number | null;
  googleId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Repository = {
  id: string;
  userId: string;
  githubRepoId: number | null;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
};

export type Conversation = {
  id: string;
  userId: string;
  repositoryId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationWithRepository = Conversation & {
  repository: Repository;
};

export type MessageRole = "system" | "user" | "assistant" | "tool";

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string | null;
  toolCalls?: unknown[] | null;
  toolCallId?: string | null;
  toolName?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type ConversationDetail = {
  conversation: Conversation;
  repository: Repository;
  messages: Message[];
};

export type GitHubStatus = {
  connected: boolean;
  githubInstallationId: number | null;
  githubLogin: string | null;
};

export type GitHubRepository = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  cloneUrl: string;
  url: string;
};

export type GitHubPullRequestDetails = {
  number: number;
  title: string;
  state: string;
  body: string | null;
  url: string;
  head: string;
  base: string;
  headSha: string;
  draft: boolean;
};

export type GitHubCheckSummary = {
  name: string;
  status: string;
  conclusion: string | null;
  detailsUrl: string | null;
};

export type ChatResponse = {
  response: string;
  userMessage: Message;
  assistantMessage: Message;
  activityMessages: Message[];
};
