import { Agent } from "./agent.ts";

export { Agent } from "./agent.ts";
export { ConversationWorkspaceRecoveryError } from "./agent.ts";
export { deleteConversationWorkspace } from "./agent.ts";
export type {
  AgentHistoryMessage,
  AgentOptions,
  AgentResult,
  AgentRunOptions,
} from "./agent.ts";
export { createTools } from "./tools.ts";
export type { Tool } from "./tools.ts";
export {
  GitHubApp,
  listInstallationRepositories,
  parseRepoUrl,
} from "./github.ts";
export type {
  GitHubAppOptions,
  GitHubIssue,
  GitHubIssueSummary,
  GitHubCheckSummary,
  GitHubPullRequest,
  GitHubPullRequestDetails,
  GitHubRepo,
  GitHubRepository,
} from "./github.ts";

if (import.meta.main) {
  const query = process.argv.slice(2).join(" ").trim();

  if (!query) {
    console.error('Usage: bun index.ts "<query>"');
    process.exit(1);
  }

  const agent = new Agent();
  const result = await agent.run(query);
  console.log(result.answer);
}
