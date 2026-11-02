import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, sessionsTable, usersTable } from "db";

const configuredTtlDays = Number(process.env.SESSION_TTL_DAYS ?? 30);
const sessionTtlDays =
  Number.isFinite(configuredTtlDays) && configuredTtlDays > 0
    ? configuredTtlDays
    : 30;

const SESSION_TTL_MS = sessionTtlDays * 24 * 60 * 60 * 1000;

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessionsTable).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });

  return { token, expiresAt };
}

export async function findSession(token: string) {
  const [session] = await db
    .select({
      id: sessionsTable.id,
      user: usersTable,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(
      and(
        eq(sessionsTable.tokenHash, hashSessionToken(token)),
        gt(sessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return session ?? null;
}

export async function revokeSession(id: string) {
  await db.delete(sessionsTable).where(eq(sessionsTable.id, id));
}
