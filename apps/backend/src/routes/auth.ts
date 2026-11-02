import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "db";
import { clearSessionCookie, setSessionCookie } from "../lib/cookies.ts";
import { HttpError } from "../lib/errors.ts";
import { requireString, toPublicUser } from "../lib/http.ts";
import { createSession, revokeSession } from "../lib/session.ts";
import { requireAuth } from "../middleware/auth.ts";

export const authRouter = Router();

function requireEmail(value: unknown) {
  const email = requireString(value, "email", { max: 255 }).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "A valid email is required");
  }

  return email;
}

function requirePassword(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new HttpError(400, "Password must be between 8 and 128 characters");
  }

  return value;
}

authRouter.post("/signup", async (req, res) => {
  const name = requireString(req.body?.name, "name", { max: 255 });
  const email = requireEmail(req.body?.email);
  const password = requirePassword(req.body?.password);

  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existingUser) {
    throw new HttpError(409, "Email is already registered");
  }

  const passwordHash = await Bun.password.hash(password);
  const [user] = await db
    .insert(usersTable)
    .values({ name, email, passwordHash })
    .returning();

  if (!user) {
    throw new Error("Failed to create user");
  }

  const { token, expiresAt } = await createSession(user.id);
  setSessionCookie(res, token, expiresAt);

  res.status(201).json({ user: toPublicUser(user), token });
});

authRouter.post("/signin", async (req, res) => {
  const email = requireEmail(req.body?.email);
  const password = requirePassword(req.body?.password);

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user?.passwordHash) {
    throw new HttpError(401, "Invalid email or password");
  }

  const passwordMatches = await Bun.password.verify(
    password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    throw new HttpError(401, "Invalid email or password");
  }

  const { token, expiresAt } = await createSession(user.id);
  setSessionCookie(res, token, expiresAt);

  res.json({ user: toPublicUser(user), token });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.user!) });
});

authRouter.post("/signout", requireAuth, async (req, res) => {
  await revokeSession(req.sessionId!);
  clearSessionCookie(res);
  res.status(204).end();
});
