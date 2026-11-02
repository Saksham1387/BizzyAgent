import type { Response } from "express";

export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME ?? "bizzy_session";
export const LEGACY_SESSION_COOKIE_NAME = "cex_session";

export const GITHUB_STATE_COOKIE_NAME =
  process.env.GITHUB_STATE_COOKIE_NAME ?? "bizzy_github_state";
export const LEGACY_GITHUB_STATE_COOKIE_NAME = "cex_github_state";

const COOKIE_SECURE = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === "true"
  : process.env.NODE_ENV === "production";

export function setSessionCookie(
  res: Response,
  token: string,
  expiresAt: Date,
) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: COOKIE_SECURE,
    expires: expiresAt,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: COOKIE_SECURE,
    path: "/",
  };
  res.clearCookie(SESSION_COOKIE_NAME, options);
  res.clearCookie(LEGACY_SESSION_COOKIE_NAME, options);
}

export function setGithubStateCookie(res: Response, state: string) {
  res.cookie(GITHUB_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    maxAge: 10 * 60 * 1000,
    path: "/api/github",
  });
}

export function clearGithubStateCookie(res: Response) {
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: COOKIE_SECURE,
    path: "/api/github",
  };
  res.clearCookie(GITHUB_STATE_COOKIE_NAME, options);
  res.clearCookie(LEGACY_GITHUB_STATE_COOKIE_NAME, options);
}

export function parseCookies(header: string | undefined) {
  const cookies: Record<string, string> = {};

  if (!header) {
    return cookies;
  }

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();

    if (!name) {
      continue;
    }

    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }

  return cookies;
}
