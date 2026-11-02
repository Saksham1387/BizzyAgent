export type Tool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export function createTools(sandboxPath: string) {
  const bashTool: Tool = {
    type: "function",
    function: {
      name: "bash",
      description: `Run a bash command inside a Linux sandbox. Commands start in ${sandboxPath}.`,
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The bash command to execute.",
          },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
  };

  const subagentTool: Tool = {
    type: "function",
    function: {
      name: "run_subagent",
      description:
        "Delegate a complex, well-scoped task to a subagent. The subagent runs its own agent loop with bash access in the same sandbox, but cannot start further subagents. Give it a complete task description.",
      parameters: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description: "The complete task for the subagent to carry out.",
          },
        },
        required: ["task"],
        additionalProperties: false,
      },
    },
  };

  const githubListIssuesTool: Tool = {
    type: "function",
    function: {
      name: "github_list_issues",
      description:
        "List issues in the GitHub repository, excluding pull requests. Use this to find issues to work on. Returns issue numbers, titles, bodies, labels, authors, and URLs.",
      parameters: {
        type: "object",
        properties: {
          state: {
            type: "string",
            enum: ["open", "closed", "all"],
            description: "Filter by issue state. Defaults to open.",
          },
          labels: {
            type: "string",
            description:
              "Comma-separated label names to filter by, for example: bug,help wanted.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            description: "Maximum number of issues to return. Defaults to 30.",
          },
        },
        additionalProperties: false,
      },
    },
  };

  const githubIssueTool: Tool = {
    type: "function",
    function: {
      name: "github_create_issue",
      description:
        "Create an issue in the GitHub repository. This tool authenticates with a short-lived GitHub App installation token.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The issue title.",
          },
          body: {
            type: "string",
            description: "The issue body in Markdown.",
          },
        },
        required: ["title", "body"],
        additionalProperties: false,
      },
    },
  };

  const githubUpdateIssueTool: Tool = {
    type: "function",
    function: {
      name: "github_update_issue",
      description:
        "Update an issue title, body, or open/closed state in the selected GitHub repository. Only provide fields that should change.",
      parameters: {
        type: "object",
        properties: {
          number: { type: "integer", minimum: 1, description: "Issue number." },
          title: { type: "string", description: "New issue title." },
          body: {
            type: "string",
            description: "Replacement issue body in Markdown.",
          },
          state: {
            type: "string",
            enum: ["open", "closed"],
            description: "New issue state.",
          },
        },
        required: ["number"],
        additionalProperties: false,
      },
    },
  };

  const githubGetPullRequestTool: Tool = {
    type: "function",
    function: {
      name: "github_get_pull_request",
      description:
        "Inspect a pull request in the selected repository, including its title, description, state, branches, draft status, and head commit SHA.",
      parameters: {
        type: "object",
        properties: {
          number: {
            type: "integer",
            minimum: 1,
            description: "Pull request number.",
          },
        },
        required: ["number"],
        additionalProperties: false,
      },
    },
  };

  const githubGetPullRequestChecksTool: Tool = {
    type: "function",
    function: {
      name: "github_get_pull_request_checks",
      description:
        "Inspect check runs and commit statuses for a pull request's latest head commit. Use this to report CI results or diagnose failed checks.",
      parameters: {
        type: "object",
        properties: {
          number: {
            type: "integer",
            minimum: 1,
            description: "Pull request number.",
          },
        },
        required: ["number"],
        additionalProperties: false,
      },
    },
  };

  const githubPullRequestTool: Tool = {
    type: "function",
    function: {
      name: "github_create_pull_request",
      description:
        "Commit all changes made in the sandbox, push them to a new branch using a short-lived GitHub App installation token, and open a pull request.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The pull request title.",
          },
          body: {
            type: "string",
            description: "The pull request body in Markdown.",
          },
          branch: {
            type: "string",
            description: "The branch to create and push the changes to.",
          },
          commitMessage: {
            type: "string",
            description: "The commit message for the changes.",
          },
          base: {
            type: "string",
            description:
              "The base branch for the pull request. Defaults to the repository default branch.",
          },
        },
        required: ["title", "body", "branch", "commitMessage"],
        additionalProperties: false,
      },
    },
  };

  return {
    mainTools: [
      bashTool,
      subagentTool,
      githubListIssuesTool,
      githubIssueTool,
      githubUpdateIssueTool,
      githubGetPullRequestTool,
      githubGetPullRequestChecksTool,
      githubPullRequestTool,
    ] as Tool[],
    subagentTools: [bashTool] as Tool[],
  };
}
