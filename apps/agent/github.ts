import { sign } from "node:crypto";
import { readFile } from "node:fs/promises";

const DEFAULT_API_URL = "https://api.github.com";
const DEFAULT_PRIVATE_KEY_PATH = new URL(
  "../../bizzyagent.2026-11-01.private-key.pem",
  import.meta.url,
).pathname;

export type GitHubRepo = {
  owner: string;
  repo: string;
};

export type GitHubAppOptions = GitHubRepo & {
  appId?: string;
  privateKey?: string;
  privateKeyPath?: string;
  installationId?: number;
  apiUrl?: string;
};

export type GitHubIssue = {
  number: number;
  url: string;
};

export type GitHubPullRequest = {
  number: number;
  url: string;
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

export type GitHubIssueSummary = {
  number: number;
  title: string;
  body: string | null;
  state: string;
  url: string;
  labels: string[];
  author: string | null;
  comments: number;
  createdAt: string;
  updatedAt: string;
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

export function parseRepoUrl(url: string): GitHubRepo {
  const clean = url
    .trim()
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  const match = clean.match(/github\.com[/:]([^/]+)\/([^/]+)$/i);

  if (match) {
    return { owner: match[1] ?? "", repo: match[2] ?? "" };
  }

  const parts = clean.split(/[/:]/).filter(Boolean);
  const repo = parts.pop() ?? "";
  const owner = parts.pop() ?? "";

  return { owner, repo };
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export class GitHubApp {
  private readonly owner: string;
  private readonly repo: string;
  private readonly appId: string | undefined;
  private readonly privateKey: string | undefined;
  private readonly privateKeyPath: string | undefined;
  private readonly installationId: number | undefined;
  private readonly apiUrl: string;

  private privateKeyPromise: Promise<string> | null = null;
  private cachedInstallationId: number | null = null;
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(options: GitHubAppOptions) {
    if (!options.owner || !options.repo) {
      throw new Error("A valid GitHub owner and repository are required");
    }

    this.owner = options.owner;
    this.repo = options.repo;
    this.appId = options.appId;
    this.privateKey = options.privateKey;
    this.privateKeyPath = options.privateKeyPath;
    this.installationId = options.installationId;
    this.apiUrl =
      options.apiUrl ?? process.env.GITHUB_API_URL ?? DEFAULT_API_URL;
  }

  get repository() {
    return `${this.owner}/${this.repo}`;
  }

  async getInstallationToken(): Promise<string> {
    if (
      this.cachedToken &&
      this.cachedToken.expiresAt - Date.now() > 5 * 60 * 1000
    ) {
      return this.cachedToken.value;
    }

    const jwt = await this.createAppJwt();
    const installationId = await this.getInstallationId(jwt);
    const response = await this.request<{ token: string; expires_at: string }>(
      `/app/installations/${installationId}/access_tokens`,
      jwt,
      {
        method: "POST",
        body: JSON.stringify({ repositories: [this.repo] }),
      },
    );

    this.cachedToken = {
      value: response.token,
      expiresAt: new Date(response.expires_at).getTime(),
    };

    return this.cachedToken.value;
  }

  async getGitAuthHeader() {
    const token = await this.getInstallationToken();
    const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
    return `AUTHORIZATION: basic ${basic}`;
  }

  async getDefaultBranch(): Promise<string> {
    const repo = await this.request<{ default_branch: string }>(
      `/repos/${this.owner}/${this.repo}`,
      await this.getInstallationToken(),
    );

    return repo.default_branch;
  }

  async createIssue(input: {
    title: string;
    body: string;
  }): Promise<GitHubIssue> {
    const issue = await this.request<{ number: number; html_url: string }>(
      `/repos/${this.owner}/${this.repo}/issues`,
      await this.getInstallationToken(),
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );

    return { number: issue.number, url: issue.html_url };
  }

  async updateIssue(
    number: number,
    input: { title?: string; body?: string; state?: "open" | "closed" },
  ): Promise<GitHubIssueSummary> {
    const issue = await this.request<{
      number: number;
      title: string;
      body: string | null;
      state: string;
      html_url: string;
      labels: Array<{ name: string }>;
      user: { login: string } | null;
      comments: number;
      created_at: string;
      updated_at: string;
    }>(
      `/repos/${this.owner}/${this.repo}/issues/${number}`,
      await this.getInstallationToken(),
      { method: "PATCH", body: JSON.stringify(input) },
    );

    return {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      url: issue.html_url,
      labels: issue.labels.map((label) => label.name),
      author: issue.user?.login ?? null,
      comments: issue.comments,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    };
  }

  async getPullRequest(number: number): Promise<GitHubPullRequestDetails> {
    const pullRequest = await this.request<{
      number: number;
      title: string;
      state: string;
      body: string | null;
      html_url: string;
      head: { ref: string; sha: string };
      base: { ref: string };
      draft: boolean;
    }>(
      `/repos/${this.owner}/${this.repo}/pulls/${number}`,
      await this.getInstallationToken(),
    );

    return {
      number: pullRequest.number,
      title: pullRequest.title,
      state: pullRequest.state,
      body: pullRequest.body,
      url: pullRequest.html_url,
      head: pullRequest.head.ref,
      base: pullRequest.base.ref,
      headSha: pullRequest.head.sha,
      draft: pullRequest.draft,
    };
  }

  async listPullRequests(limit = 10): Promise<GitHubPullRequestDetails[]> {
    const safeLimit = Math.min(30, Math.max(1, Math.trunc(limit)));
    const pullRequests = await this.request<
      Array<{
        number: number;
        title: string;
        state: string;
        body: string | null;
        html_url: string;
        head: { ref: string; sha: string };
        base: { ref: string };
        draft: boolean;
      }>
    >(
      `/repos/${this.owner}/${this.repo}/pulls?state=open&per_page=${safeLimit}&sort=updated&direction=desc`,
      await this.getInstallationToken(),
    );

    return pullRequests.map((pullRequest) => ({
      number: pullRequest.number,
      title: pullRequest.title,
      state: pullRequest.state,
      body: pullRequest.body,
      url: pullRequest.html_url,
      head: pullRequest.head.ref,
      base: pullRequest.base.ref,
      headSha: pullRequest.head.sha,
      draft: pullRequest.draft,
    }));
  }

  async getPullRequestChecks(number: number): Promise<{
    state: string;
    checks: GitHubCheckSummary[];
  }> {
    const pullRequest = await this.getPullRequest(number);
    const token = await this.getInstallationToken();
    const [checkRuns, commitStatus] = await Promise.all([
      this.request<{
        check_runs: Array<{
          name: string;
          status: string;
          conclusion: string | null;
          html_url: string | null;
        }>;
      }>(
        `/repos/${this.owner}/${this.repo}/commits/${pullRequest.headSha}/check-runs?per_page=100`,
        token,
      ),
      this.request<{
        state: string;
        statuses: Array<{
          context: string;
          state: string;
          target_url: string | null;
        }>;
      }>(
        `/repos/${this.owner}/${this.repo}/commits/${pullRequest.headSha}/status`,
        token,
      ),
    ]);

    return {
      state: commitStatus.state,
      checks: [
        ...checkRuns.check_runs.map((check) => ({
          name: check.name,
          status: check.status,
          conclusion: check.conclusion,
          detailsUrl: check.html_url,
        })),
        ...commitStatus.statuses.map((status) => ({
          name: status.context,
          status: status.state === "pending" ? "in_progress" : "completed",
          conclusion: status.state,
          detailsUrl: status.target_url,
        })),
      ],
    };
  }

  async createPullRequest(input: {
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<GitHubPullRequest> {
    const pullRequest = await this.request<{
      number: number;
      html_url: string;
    }>(
      `/repos/${this.owner}/${this.repo}/pulls`,
      await this.getInstallationToken(),
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );

    return { number: pullRequest.number, url: pullRequest.html_url };
  }

  async listIssues(
    options: {
      state?: "open" | "closed" | "all";
      labels?: string;
      limit?: number;
    } = {},
  ): Promise<GitHubIssueSummary[]> {
    const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 30)));
    const params = new URLSearchParams({
      state: options.state ?? "open",
      per_page: String(limit),
      sort: "updated",
      direction: "desc",
    });

    if (options.labels) {
      params.set("labels", options.labels);
    }

    const issues = await this.request<
      Array<{
        number: number;
        title: string;
        body: string | null;
        state: string;
        html_url: string;
        labels: Array<{ name: string }>;
        user: { login: string } | null;
        comments: number;
        created_at: string;
        updated_at: string;
        pull_request?: unknown;
      }>
    >(
      `/repos/${this.owner}/${this.repo}/issues?${params.toString()}`,
      await this.getInstallationToken(),
    );

    return issues
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        url: issue.html_url,
        labels: issue.labels.map((label) => label.name),
        author: issue.user?.login ?? null,
        comments: issue.comments,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
      }));
  }

  async listRepositories(): Promise<GitHubRepository[]> {
    const jwt = await this.createAppJwt();
    const installationId = await this.getInstallationId(jwt);
    const token = await this.request<{ token: string }>(
      `/app/installations/${installationId}/access_tokens`,
      jwt,
      { method: "POST" },
    );
    const response = await this.request<{
      repositories: Array<{
        id: number;
        name: string;
        full_name: string;
        owner: { login: string };
        private: boolean;
        default_branch: string;
        clone_url: string;
        html_url: string;
      }>;
    }>("/installation/repositories?per_page=100", token.token);

    return response.repositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      private: repo.private,
      defaultBranch: repo.default_branch,
      cloneUrl: repo.clone_url,
      url: repo.html_url,
    }));
  }

  private async getInstallationId(jwt: string): Promise<number> {
    const configured =
      this.installationId ??
      (process.env.GITHUB_INSTALLATION_ID
        ? Number(process.env.GITHUB_INSTALLATION_ID)
        : Number.NaN);

    if (Number.isFinite(configured)) {
      return configured;
    }

    if (this.cachedInstallationId) {
      return this.cachedInstallationId;
    }

    const installations = await this.request<
      Array<{ id: number; account: { login: string } | null }>
    >("/app/installations?per_page=100", jwt);

    const installation = installations.find(
      (item) => item.account?.login.toLowerCase() === this.owner.toLowerCase(),
    );

    if (!installation) {
      throw new Error(
        `GitHub App is not installed on ${this.owner}/${this.repo}`,
      );
    }

    this.cachedInstallationId = installation.id;
    return installation.id;
  }

  private async createAppJwt(): Promise<string> {
    const appId = this.appId ?? process.env.GITHUB_APP_ID;

    if (!appId) {
      throw new Error("GITHUB_APP_ID is not set");
    }

    const privateKey = await this.getPrivateKey();
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64Url(
      JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }),
    );
    const unsigned = `${header}.${payload}`;
    const signature = sign("RSA-SHA256", Buffer.from(unsigned), privateKey);

    return `${unsigned}.${signature.toString("base64url")}`;
  }

  private async getPrivateKey(): Promise<string> {
    this.privateKeyPromise ??= (async () => {
      const inlineKey = this.privateKey ?? process.env.GITHUB_PRIVATE_KEY;

      if (inlineKey) {
        return inlineKey.replace(/\\n/g, "\n");
      }

      const keyPath =
        this.privateKeyPath ??
        process.env.GITHUB_PRIVATE_KEY_PATH ??
        DEFAULT_PRIVATE_KEY_PATH;

      return readFile(keyPath, "utf8");
    })();

    return this.privateKeyPromise;
  }

  private async request<T>(
    path: string,
    token: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "bizzy-agent",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`GitHub API error ${response.status}: ${details}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}

export async function listInstallationRepositories(
  installationId: number,
): Promise<GitHubRepository[]> {
  const app = new GitHubApp({
    owner: "installation",
    repo: "repositories",
    installationId,
  });

  return app.listRepositories();
}
