import { randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "db";
import {
  clearGithubStateCookie,
  GITHUB_STATE_COOKIE_NAME,
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
  const cookieState = cookies[GITHUB_STATE_COOKIE_NAME];
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

  const redirectUrl = process.env.GITHUB_CONNECT_REDIRECT_URL;

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
