<p align="center">
  <img src="apps/fe/public/bizzy-logo.png" alt="Bizzy logo" width="144" />
</p>

<h1 align="center">Bizzy</h1>

<p align="center">A cloud coding agent for GitHub repositories.</p>

Bizzy lets you work with a coding agent through a web chat. Choose a repository, describe a task, and the agent works in an isolated Linux sandbox. It can inspect repository issues and pull requests, change code, run shell commands, and open a pull request with its changes.

## What Bizzy can do

- Clone the selected repository into an isolated E2B sandbox and inspect or edit its files.
- Run Bash commands in the sandbox, including repository-provided checks such as tests, lint, and type checking.
- Delegate a self-contained task to one subagent. Subagents get Bash access to the same sandbox and cannot delegate further.
- List repository issues, filtered by state and labels, and create issues.
- Update an issue's title, body, or open/closed state.
- Inspect pull request details and read check runs and commit statuses for its latest commit.
- Commit sandbox changes to a new branch, push it, and create a pull request.
- Save tool calls and tool results with conversation messages so they can be reviewed in the chat.
- Render successfully created issues and pull requests as linked artifacts in the conversation.

## Current limits

- Each conversation is tied to one repository available to the installed GitHub App. Bizzy cannot access repositories outside that installation's permissions.
- Each agent run starts a fresh sandbox and makes a shallow clone of the repository's configured URL. Local files and unpushed changes do not carry over to the next run. Push changes in a pull request if you want them to persist.
- The agent does not currently fetch an existing PR branch into its sandbox. Its PR inspection tool returns metadata and check results; there is no dedicated tool for retrieving changed files or diffs.
- Issue updates are limited to title, body, and open/closed state. There are no tools for issue comments, labels, assignees, or milestones.
- PR operations are limited to creating a PR and inspecting its details/checks. Bizzy cannot merge or close PRs, request reviews, comment on PRs, or rerun/cancel checks.
- There is no built-in browser interaction or visual testing tool. The agent can run project commands in Bash when the repository provides the needed setup.
- An agent run is limited to 10 model iterations by default, a 10-minute sandbox by default, and 120 seconds per shell command. These defaults are configurable in the agent code.

GitHub access uses short-lived installation tokens on the server. The GitHub App must be installed on the selected repository and granted the permissions needed for the requested operation. Bizzy does not send those tokens to the model.

## Run locally

Requirements: Bun 1.3.5 or newer, Node.js 24 or newer, a configured database, an OpenRouter API key, and a GitHub App installation with repository access.

Install workspace dependencies and start the apps:

```sh
bun install
bun run dev
```

The frontend runs on port `3000` by default and proxies API requests to the backend on port `3001`. Set `BACKEND_URL` if the backend runs elsewhere. The backend needs `DATABASE_URL`, `OPENROUTER_API_KEY`, and GitHub App credentials (`GITHUB_APP_ID` plus `GITHUB_PRIVATE_KEY` or `GITHUB_PRIVATE_KEY_PATH`). Keep private keys and API keys out of source control.

The root scripts also provide:

```sh
bun run build
bun run lint
bun run check-types
```

## Workspace layout

- `apps/fe` — Next.js web app for authentication, repository selection, chat, and tool activity.
- `apps/backend` — authenticated API, persistence, GitHub routes, and chat orchestration.
- `apps/agent` — sandboxed coding agent, tool definitions, and GitHub App client.
- `packages/db` — database schema, migrations, and database client.
- `packages/ui` — shared UI package.

## Configuration reference

Common environment variables include:

| Variable                                          | Purpose                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`                                    | Database connection string.                                                  |
| `OPENROUTER_API_KEY`                              | API key used by the agent model.                                             |
| `OPENROUTER_MODEL`                                | Optional model override.                                                     |
| `GITHUB_APP_ID`                                   | GitHub App identifier.                                                       |
| `GITHUB_PRIVATE_KEY` or `GITHUB_PRIVATE_KEY_PATH` | GitHub App private key.                                                      |
| `GITHUB_INSTALLATION_ID`                          | Optional installation ID for standalone agent use.                           |
| `BACKEND_URL`                                     | Backend URL used by the frontend proxy; defaults to `http://localhost:3001`. |
| `PORT`                                            | Backend port; defaults to `3001`.                                            |
