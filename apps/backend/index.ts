import express from "express";
import { authRouter } from "./src/routes/auth.ts";
import { chatRouter } from "./src/routes/chat.ts";
import { conversationsRouter } from "./src/routes/conversations.ts";
import { githubRouter } from "./src/routes/github.ts";
import { errorHandler, notFoundHandler } from "./src/middleware/error.ts";

export const app = express();

if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/github", githubRouter);
app.use("/api/chat", chatRouter);
app.use("/chat", chatRouter);

app.use(notFoundHandler);
app.use(errorHandler);

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3001);

  app.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
  });
}
