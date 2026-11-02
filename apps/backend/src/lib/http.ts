import type { User } from "db";
import { HttpError } from "./errors.ts";

export function toPublicUser(user: User) {
  const {
    passwordHash: _passwordHash,
    googleAccessToken: _googleAccessToken,
    googleRefreshToken: _googleRefreshToken,
    googleIdToken: _googleIdToken,
    ...publicUser
  } = user;

  return publicUser;
}

export function requireString(
  value: unknown,
  field: string,
  options: { min?: number; max?: number } = {},
) {
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} is required`);
  }

  const trimmed = value.trim();
  const min = options.min ?? 1;
  const max = options.max ?? 255;

  if (trimmed.length < min || trimmed.length > max) {
    throw new HttpError(
      400,
      `${field} must be between ${min} and ${max} characters`,
    );
  }

  return trimmed;
}

export function optionalString(
  value: unknown,
  field: string,
  options: { max?: number } = {},
) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a string`);
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  const max = options.max ?? 255;

  if (trimmed.length > max) {
    throw new HttpError(400, `${field} must be at most ${max} characters`);
  }

  return trimmed;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
