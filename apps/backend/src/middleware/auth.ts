import type { NextFunction, Request, Response } from "express";
import {
  LEGACY_SESSION_COOKIE_NAME,
  parseCookies,
  SESSION_COOKIE_NAME,
} from "../lib/cookies.ts";
import { HttpError } from "../lib/errors.ts";
import { findSession } from "../lib/session.ts";

function getSessionToken(req: Request) {
  const authorization = req.header("authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] ?? cookies[LEGACY_SESSION_COOKIE_NAME];
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const token = getSessionToken(req);

  if (!token) {
    throw new HttpError(401, "Authentication required");
  }

  const session = await findSession(token);

  if (!session) {
    throw new HttpError(401, "Invalid or expired session");
  }

  req.user = session.user;
  req.sessionId = session.id;
  next();
}
