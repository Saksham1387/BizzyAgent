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

export function parseRepoUrl(url: string): GitHubRepo {
    const clean = url.trim().replace(/\.git$/i, "").replace(/\/+$/, "");
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
        this.apiUrl = options.apiUrl ?? process.env.GITHUB_API_URL ?? DEFAULT_API_URL;
    }

    get repository() {
        return `${this.owner}/${this.repo}`;
    }

    async getInstallationToken(): Promise<string> {
        if (this.cachedToken && this.cachedToken.expiresAt - Date.now() > 5 * 60 * 1000) {
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

    async createIssue(input: { title: string; body: string }): Promise<GitHubIssue> {
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
                "User-Agent": "cloud-agent",
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
