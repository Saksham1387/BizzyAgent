import { OpenRouter } from "@openrouter/sdk";
import type {
  ChatMessages,
  ChatResult,
  ChatToolCall,
} from "@openrouter/sdk/models";
import { CommandExitError, Sandbox, SandboxNotFoundError } from "e2b";
import { GitHubApp, parseRepoUrl, type GitHubAppOptions } from "./github.ts";
import { createTools, type Tool } from "./tools.ts";

const DEFAULT_REPO = "https://github.com/Saksham1387/my-website";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";
const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_SANDBOX_TIMEOUT_MS = 10 * 60_000;

export type AgentOptions = {
  apiKey?: string;
  model?: string;
  repoUrl?: string;
  maxIterations?: number;
  sandboxTimeoutMs?: number;
  github?: Partial<Omit<GitHubAppOptions, "owner" | "repo">>;
};

export type AgentHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentRunOptions = {
  maxIterations?: number;
  systemPrompt?: string;
  history?: AgentHistoryMessage[];
  sandboxId?: string | null;
  snapshotId?: string | null;
  workspaceReady?: boolean;
  snapshotName?: string;
  onSandboxId?: (sandboxId: string) => Promise<void>;
  onWorkspaceReady?: (workspaceReady: boolean) => Promise<void>;
  onSnapshotId?: (snapshotId: string) => Promise<void>;
};

export type AgentResult = {
  answer: string;
  messages: ChatMessages[];
  sandboxId: string;
  snapshotId: string | null;
};

export class ConversationWorkspaceRecoveryError extends Error {
  constructor() {
    super(
      "This conversation's sandbox expired before a recovery snapshot was saved. Its workspace cannot be restored; start a new conversation to continue.",
    );
    this.name = "ConversationWorkspaceRecoveryError";
  }
}

export async function deleteConversationWorkspace(
  sandboxId: string | null,
  snapshotId: string | null,
) {
  const cleanup = await Promise.allSettled([
    ...(sandboxId ? [Sandbox.kill(sandboxId)] : []),
    ...(snapshotId ? [Sandbox.deleteSnapshot(snapshotId)] : []),
  ]);

  for (const result of cleanup) {
    if (result.status === "rejected") {
      console.error("Failed to clean up conversation workspace", result.reason);
    }
  }
}

export class Agent {
  private readonly openrouter: OpenRouter;
  private readonly model: string;
  private readonly repoUrl: string;
  private readonly repoOwner: string;
  private readonly repoName: string;
  private readonly sandboxPath: string;
  private readonly maxIterations: number;
  private readonly sandboxTimeoutMs: number;
  private readonly github: GitHubApp;
  private readonly mainTools: Tool[];
  private readonly subagentTools: Tool[];

  constructor(options: AgentOptions = {}) {
    this.openrouter = new OpenRouter({
      apiKey: options.apiKey ?? process.env.OPENROUTER_API_KEY,
    });
    this.model = options.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
    this.repoUrl = options.repoUrl ?? process.env.REPO_URL ?? DEFAULT_REPO;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.sandboxTimeoutMs =
      options.sandboxTimeoutMs ?? DEFAULT_SANDBOX_TIMEOUT_MS;

    const { owner, repo } = parseRepoUrl(this.repoUrl);
    this.repoOwner = owner;
    this.repoName = repo;
    this.sandboxPath = `/home/user/${repo}`;
    this.github = new GitHubApp({
      owner,
      repo,
      ...options.github,
    });

    const tools = createTools(this.sandboxPath);
    this.mainTools = tools.mainTools;
    this.subagentTools = tools.subagentTools;
  }

  async run(
    query: string,
    options: AgentRunOptions = {},
  ): Promise<AgentResult> {
    let sandbox: Sandbox;
    let shouldClone = false;

    if (options.sandboxId) {
      try {
        sandbox = await Sandbox.connect(options.sandboxId, {
          timeoutMs: this.sandboxTimeoutMs,
        });
        shouldClone = !(options.workspaceReady || options.snapshotId);
      } catch (error) {
        if (!(error instanceof SandboxNotFoundError)) throw error;
        console.warn(
          `Sandbox ${options.sandboxId} expired; restoring its saved workspace`,
        );

        if (options.snapshotId) {
          sandbox = await Sandbox.create(options.snapshotId, {
            timeoutMs: this.sandboxTimeoutMs,
          });
        } else if (options.workspaceReady) {
          throw new ConversationWorkspaceRecoveryError();
        } else {
          sandbox = await Sandbox.create({
            timeoutMs: this.sandboxTimeoutMs,
          });
          shouldClone = true;
        }
      }
    } else if (options.snapshotId) {
      sandbox = await Sandbox.create(options.snapshotId, {
        timeoutMs: this.sandboxTimeoutMs,
      });
    } else if (options.workspaceReady) {
      throw new ConversationWorkspaceRecoveryError();
    } else {
      sandbox = await Sandbox.create({ timeoutMs: this.sandboxTimeoutMs });
      shouldClone = true;
    }

    let workspaceReady = !shouldClone;
    const persistWorkspace = Boolean(
      options.sandboxId ||
      options.snapshotId ||
      options.workspaceReady ||
      options.snapshotName ||
      options.onSandboxId ||
      options.onWorkspaceReady ||
      options.onSnapshotId,
    );
    let snapshotId = options.snapshotId ?? null;
    let answer: string;
    let messages: ChatMessages[];
    try {
      await options.onSandboxId?.(sandbox.sandboxId);

      if (shouldClone) {
        await this.prepareSandbox(sandbox, Boolean(options.sandboxId));
        workspaceReady = true;
        await options.onWorkspaceReady?.(true);
      }

      messages = [
        {
          role: "system",
          content: options.systemPrompt ?? this.defaultSystemPrompt(),
        },
        ...(options.history ?? []).map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: "user", content: query },
      ];

      answer = await this.runLoop(
        sandbox,
        messages,
        this.mainTools,
        options.maxIterations ?? this.maxIterations,
        "main agent",
      );
    } finally {
      if (workspaceReady && persistWorkspace) {
        try {
          const snapshotOptions = {
            ...(options.snapshotName ? { name: options.snapshotName } : {}),
          };
          let snapshot;
          try {
            snapshot = await Sandbox.createSnapshot(sandbox.sandboxId, {
              ...snapshotOptions,
              mode: "filesystem",
            });
          } catch (error) {
            console.warn(
              "Filesystem-only snapshots are unavailable; trying a full snapshot",
              error,
            );
            snapshot = await Sandbox.createSnapshot(sandbox.sandboxId, {
              ...snapshotOptions,
              mode: "full",
            });
          }
          snapshotId = snapshot.snapshotId;
          await options.onSnapshotId?.(snapshotId);
        } catch (error) {
          console.error(
            "Failed to save conversation workspace snapshot",
            error,
          );
        }
      }

      if (persistWorkspace) {
        try {
          await sandbox.pause();
        } catch (error) {
          console.error("Failed to pause conversation sandbox", error);
        }
      } else {
        await sandbox.kill();
      }
    }

    return { answer, messages, sandboxId: sandbox.sandboxId, snapshotId };
  }

  private defaultSystemPrompt() {
    return `You are a helpful coding agent working inside a Linux sandbox. The project is cloned at ${this.sandboxPath}. You can run bash, delegate with run_subagent, list and update issues, create issues, inspect pull requests and their CI checks, and create pull requests.

Plan the work before making changes. For a complex task with multiple independent workstreams, proactively use run_subagent to delegate a clearly bounded part of the work; do this when it is likely to improve coverage or save meaningful time, even if the user did not ask for delegation. Complexity can include changes across separate subsystems, a broad investigation plus implementation, or substantial independent documentation or verification work. Do not delegate simple, tightly coupled, or small tasks where delegation adds overhead. You can run one subagent per task. The subagent shares this sandbox, has Bash access only, and cannot delegate further. Assign non-overlapping work, state the relevant context and expected outcome, and avoid having both agents edit the same files. After it returns, inspect its result, integrate it with your own work, and verify the complete change. Delegation does not replace your responsibility for the final result.

Use github_list_issues to find issues; it excludes pull requests. Use the GitHub inspection tools when asked about a pull request or its checks. Make requested code changes in the sandbox first, and report actual CI results rather than assuming checks passed. The GitHub tools handle short-lived installation tokens automatically; never print or request tokens. When the task is complete, reply with a short summary and stop calling tools.`;
  }

  private async runLoop(
    sandbox: Sandbox,
    messages: ChatMessages[],
    tools: Tool[],
    maxIterations: number,
    name: string,
  ): Promise<string> {
    let iterationCount = 0;

    while (iterationCount < maxIterations) {
      iterationCount++;
      const response = await this.callLLM(messages, tools);
      const choice = response.choices[0];

      if (!choice) {
        throw new Error("Expected the model to return a choice");
      }

      const toolCalls = choice.message.toolCalls;

      if (!toolCalls || toolCalls.length === 0) {
        return typeof choice.message.content === "string"
          ? choice.message.content
          : "";
      }

      for (const toolCall of toolCalls) {
        messages.push(await this.getToolResponse(sandbox, toolCall, tools));
      }
    }

    console.warn(`Warning: ${name} reached maximum iterations`);

    const lastMessage = messages[messages.length - 1];
    return typeof lastMessage?.content === "string" ? lastMessage.content : "";
  }

  private async callLLM(
    messages: ChatMessages[],
    tools: Tool[],
  ): Promise<ChatResult> {
    const result = await this.openrouter.chat.send({
      chatRequest: {
        model: this.model,
        tools,
        messages,
        stream: false,
      },
    });

    if (!("choices" in result)) {
      throw new Error("Expected a non-streaming response");
    }

    const choice = result.choices[0];

    if (!choice) {
      throw new Error("Expected the model to return a choice");
    }

    messages.push(choice.message);

    return result;
  }

  private async prepareSandbox(sandbox: Sandbox, resetExisting = false) {
    const authHeader = await this.github.getGitAuthHeader();

    if (resetExisting) {
      await sandbox.commands.run(
        `rm -rf -- ${JSON.stringify(this.sandboxPath)}`,
      );
    }

    await sandbox.commands.run(
      `git -c http.extraheader=${JSON.stringify(authHeader)} clone --depth 1 ${JSON.stringify(this.repoUrl)} ${JSON.stringify(this.sandboxPath)}`,
      { timeoutMs: 120_000 },
    );
  }

  private async runBash(sandbox: Sandbox, command: string) {
    try {
      const result = await sandbox.commands.run(command, {
        cwd: this.sandboxPath,
        timeoutMs: 120_000,
      });

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      if (!(error instanceof CommandExitError)) throw error;

      return {
        exitCode: error.exitCode,
        stdout: error.stdout,
        stderr: error.stderr,
      };
    }
  }

  private async pushChanges(
    sandbox: Sandbox,
    branch: string,
    commitMessage: string,
  ) {
    await sandbox.commands.run(`git config user.name "Bizzy Agent"`, {
      cwd: this.sandboxPath,
    });
    await sandbox.commands.run(
      `git config user.email "cloud-agent@users.noreply.github.com"`,
      { cwd: this.sandboxPath },
    );
    await sandbox.commands.run(`git checkout -B ${JSON.stringify(branch)}`, {
      cwd: this.sandboxPath,
    });

    const status = await sandbox.commands.run("git status --porcelain", {
      cwd: this.sandboxPath,
    });

    if (status.stdout.trim()) {
      await sandbox.commands.run(
        `git add -A && git commit -m ${JSON.stringify(commitMessage)}`,
        { cwd: this.sandboxPath, timeoutMs: 120_000 },
      );
    }

    const authHeader = await this.github.getGitAuthHeader();
    const remote = `https://github.com/${this.repoOwner}/${this.repoName}.git`;

    await sandbox.commands.run(
      `git -c http.extraheader=${JSON.stringify(authHeader)} push ${JSON.stringify(remote)} ${JSON.stringify(`HEAD:refs/heads/${branch}`)}`,
      { cwd: this.sandboxPath, timeoutMs: 120_000 },
    );
  }

  private async getToolResponse(
    sandbox: Sandbox,
    toolCall: ChatToolCall,
    tools: Tool[],
  ): Promise<ChatMessages> {
    if (!tools.some((tool) => tool.function.name === toolCall.function.name)) {
      throw new Error(`Unknown tool: ${toolCall.function.name}`);
    }

    const args = JSON.parse(toolCall.function.arguments) as Record<
      string,
      unknown
    >;
    let result: unknown;

    switch (toolCall.function.name) {
      case "bash": {
        const command = String(args.command ?? "");
        console.log(`$ ${command}`);
        result = await this.runBash(sandbox, command);
        break;
      }
      case "run_subagent": {
        const task = String(args.task ?? "");
        console.log(`\n[subagent] ${task}`);

        const subagentMessages: ChatMessages[] = [
          {
            role: "system",
            content: `You are a coding subagent working inside a Linux sandbox at ${this.sandboxPath}. You have one tool: bash. Complete the assigned task, verify your work, and reply with a concise summary. Do not ask follow-up questions.`,
          },
          { role: "user", content: task },
        ];

        const answer = await this.runLoop(
          sandbox,
          subagentMessages,
          this.subagentTools,
          DEFAULT_MAX_ITERATIONS,
          "subagent",
        );

        result = { result: answer };
        break;
      }
      case "github_list_issues": {
        const stateValue = args.state;
        const state =
          stateValue === "closed" || stateValue === "all" ? stateValue : "open";
        const labels =
          typeof args.labels === "string" ? args.labels.trim() : "";
        const limitValue = args.limit;
        const limit =
          typeof limitValue === "number" && Number.isFinite(limitValue)
            ? Math.min(100, Math.max(1, Math.trunc(limitValue)))
            : 30;

        result = await this.github.listIssues({
          state,
          ...(labels ? { labels } : {}),
          limit,
        });
        break;
      }
      case "github_create_issue": {
        const title = String(args.title ?? "").trim();
        const body = String(args.body ?? "");

        if (!title) {
          throw new Error("title is required");
        }

        result = await this.github.createIssue({ title, body });
        break;
      }
      case "github_update_issue": {
        const number = Number(args.number);
        if (!Number.isSafeInteger(number) || number < 1) {
          throw new Error("A valid issue number is required");
        }
        const update: {
          title?: string;
          body?: string;
          state?: "open" | "closed";
        } = {};
        if (typeof args.title === "string") {
          update.title = args.title.trim();
        }
        if (typeof args.body === "string") {
          update.body = args.body;
        }
        if (args.state === "open" || args.state === "closed") {
          update.state = args.state;
        }
        if (Object.keys(update).length === 0) {
          throw new Error("Provide at least one issue field to update");
        }
        if (update.title !== undefined && !update.title) {
          throw new Error("Issue title cannot be empty");
        }
        result = await this.github.updateIssue(number, update);
        break;
      }
      case "github_get_pull_request":
      case "github_get_pull_request_checks": {
        const number = Number(args.number);
        if (!Number.isSafeInteger(number) || number < 1) {
          throw new Error("A valid pull request number is required");
        }
        result =
          toolCall.function.name === "github_get_pull_request"
            ? await this.github.getPullRequest(number)
            : await this.github.getPullRequestChecks(number);
        break;
      }
      case "github_create_pull_request": {
        const title = String(args.title ?? "").trim();
        const body = String(args.body ?? "");
        const branch = String(args.branch ?? "").trim();
        const commitMessage = String(args.commitMessage ?? "").trim() || title;

        if (!title || !branch) {
          throw new Error("title and branch are required");
        }

        if (!/^[A-Za-z0-9._/-]+$/.test(branch)) {
          throw new Error("Invalid branch name");
        }

        const base = args.base
          ? String(args.base).trim()
          : await this.github.getDefaultBranch();

        await this.pushChanges(sandbox, branch, commitMessage);
        result = await this.github.createPullRequest({
          title,
          body,
          head: branch,
          base,
        });
        break;
      }
      default:
        throw new Error(`Unknown tool: ${toolCall.function.name}`);
    }

    return {
      role: "tool",
      toolCallId: toolCall.id,
      content: JSON.stringify(result),
    };
  }
}
