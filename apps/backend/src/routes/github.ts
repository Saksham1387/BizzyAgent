import { randomBytes, timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import { eq } from "drizzle-orm";
import { GitHubApp, listInstallationRepositories } from "agent";
import { db, usersTable } from "db";
import {
  clearGithubStateCookie,
  GITHUB_STATE_COOKIE_NAME,
  LEGACY_GITHUB_STATE_COOKIE_NAME,
  parseCookies,
  setGithubStateCookie,
} from "../lib/cookies.ts";
import { HttpError } from "../lib/errors.ts";
import { requireAuth } from "../middleware/auth.ts";

export const githubRouter = Router();

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function getQueryString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

githubRouter.get("/connect", requireAuth, (req, res) => {
  const state = randomBytes(24).toString("base64url");
  const slug = process.env.GITHUB_APP_SLUG ?? "bizzyagent";
  const installUrl = new URL(
    `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`,
  );

  installUrl.searchParams.set("state", state);
  setGithubStateCookie(res, state);
  res.redirect(installUrl.toString());
});

githubRouter.get("/callback", requireAuth, async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const cookieState =
    cookies[GITHUB_STATE_COOKIE_NAME] ??
    cookies[LEGACY_GITHUB_STATE_COOKIE_NAME];
  const queryState = getQueryString(req.query.state);

  clearGithubStateCookie(res);

  if (!cookieState || !queryState || !safeEqual(cookieState, queryState)) {
    throw new HttpError(400, "Invalid GitHub connection state");
  }

  const installationIdValue = getQueryString(req.query.installation_id);

  if (!installationIdValue || !/^\d+$/.test(installationIdValue)) {
    throw new HttpError(400, "GitHub installation id is required");
  }

  const installationId = Number(installationIdValue);

  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    throw new HttpError(400, "GitHub installation id is invalid");
  }

  const [user] = await db
    .update(usersTable)
    .set({ githubInstallationId: installationId })
    .where(eq(usersTable.id, req.user!.id))
    .returning();

  if (!user) {
    throw new HttpError(404, "User not found");
  }

  const redirectUrl =
    process.env.GITHUB_CONNECT_REDIRECT_URL ??
    process.env.FRONTEND_URL ??
    (process.env.NODE_ENV === "production"
      ? undefined
      : "http://localhost:3000/chat");

  if (redirectUrl) {
    const target = new URL(redirectUrl);
    target.searchParams.set("github", "connected");
    res.redirect(target.toString());
    return;
  }

  res.json({ connected: true, githubInstallationId: installationId });
});

githubRouter.get("/status", requireAuth, (req, res) => {
  const installationId = req.user!.githubInstallationId;

  res.json({
    connected: installationId !== null,
    githubInstallationId: installationId,
    githubLogin: req.user!.githubLogin,
  });
});

githubRouter.get("/repos", requireAuth, async (req, res) => {
  const installationId = req.user!.githubInstallationId;

  if (!installationId) {
    throw new HttpError(409, "Connect GitHub before listing repositories");
  }

  try {
    const repositories = await listInstallationRepositories(installationId);
    res.json({ repositories });
  } catch (error) {
    console.error("Failed to list GitHub repositories", error);
    throw new HttpError(502, "Failed to load GitHub repositories");
  }
});

function getRepositoryClient(req: Request) {
  const installationId = req.user?.githubInstallationId;
  const owner = typeof req.params.owner === "string" ? req.params.owner : "";
  const repo = typeof req.params.repo === "string" ? req.params.repo : "";

  if (!installationId) {
    throw new HttpError(409, "Connect GitHub before inspecting pull requests");
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new HttpError(400, "Invalid repository");
  }

  return new GitHubApp({ owner, repo, installationId });
}

githubRouter.get("/repos/:owner/:repo/pulls", requireAuth, async (req, res) => {
  try {
    const pulls = await getRepositoryClient(req).listPullRequests();
    res.json({ pullRequests: pulls });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("Failed to inspect GitHub pull requests", error);
    throw new HttpError(502, "Failed to load pull requests");
  }
});

githubRouter.get(
  "/repos/:owner/:repo/pulls/:number/checks",
  requireAuth,
  async (req, res) => {
    const number = Number(req.params.number);
    if (!Number.isSafeInteger(number) || number < 1) {
      throw new HttpError(400, "Invalid pull request number");
    }
    try {
      const checks =
        await getRepositoryClient(req).getPullRequestChecks(number);
      res.json(checks);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error("Failed to load pull request checks", error);
      throw new HttpError(502, "Failed to load pull request checks");
    }
  },
);
