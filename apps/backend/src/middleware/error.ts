import type { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError } from "../lib/errors.ts";

type PostgresError = {
  code?: string;
  constraint?: string;
};

function asPostgresError(error: unknown): PostgresError | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  return error as PostgresError;
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Not found" });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return;
  }

  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const postgresError = asPostgresError(error);

  if (postgresError?.code === "23505") {
    res.status(409).json({ error: "Resource already exists" });
    return;
  }

  if (postgresError?.code === "22P02") {
    res.status(400).json({ error: "Invalid identifier" });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
};
