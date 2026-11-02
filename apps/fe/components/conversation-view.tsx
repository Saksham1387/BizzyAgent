"use client";

import Link from "next/link";
import Image from "next/image";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useChatData } from "@/components/chat-shell";
import { RepoInspector } from "@/components/repo-inspector";
import { AiToolActivity } from "@/components/ai-tool-activity";
import { apiFetch } from "@/lib/api";
import type { ChatResponse, ConversationDetail, Message } from "@/lib/types";

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown text-sm leading-6">
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  );
}

type ConversationTurn = {
  id: string;
  userMessage: Message | null;
  assistantMessages: Message[];
};

function groupConversationTurns(messages: Message[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let currentTurn: ConversationTurn | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      currentTurn = {
        id: message.id,
        userMessage: message,
        assistantMessages: [],
      };
      turns.push(currentTurn);
      continue;
    }

    if (message.role === "assistant") {
      if (!currentTurn) {
        currentTurn = {
          id: message.id,
          userMessage: null,
          assistantMessages: [],
        };
        turns.push(currentTurn);
      }
      currentTurn.assistantMessages.push(message);
    }
  }

  return turns;
}

export function ConversationView({
  conversationId,
}: {
  conversationId: string;
}) {
  const { github, refreshConversations } = useChatData();
  const [data, setData] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    void apiFetch<ConversationDetail>(`/conversations/${conversationId}`)
      .then((nextData) => {
        if (!cancelled) {
          setData(nextData);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load conversation",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const messageCount = data?.messages.length ?? 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageCount, sending]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = input.trim();

    if (!content || !data || sending) {
      return;
    }

    const optimisticId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `optimistic-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      conversationId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };

    setInput("");
    setSendError(null);
    setSending(true);
    setData((previous) =>
      previous
        ? {
            ...previous,
            messages: [...previous.messages, optimisticMessage],
          }
        : previous,
    );

    try {
      const result = await apiFetch<ChatResponse>("/chat", {
        method: "POST",
        body: JSON.stringify({ conversationId, message: content }),
      });

      setData((previous) => {
        if (!previous) {
          return previous;
        }

        const nextTitle =
          previous.conversation.title === "New conversation"
            ? content.replace(/\s+/g, " ").slice(0, 80)
            : previous.conversation.title;

        return {
          ...previous,
          conversation: { ...previous.conversation, title: nextTitle },
          messages: [
            ...previous.messages.filter(
              (message) => message.id !== optimisticId,
            ),
            result.userMessage,
            ...(result.activityMessages ?? [result.assistantMessage]),
          ],
        };
      });

      await refreshConversations();
    } catch (submitError) {
      setData((previous) =>
        previous
          ? {
              ...previous,
              messages: previous.messages.filter(
                (message) => message.id !== optimisticId,
              ),
            }
          : previous,
      );
      setInput(content);
      setSendError(
        submitError instanceof Error
          ? submitError.message
          : "The agent could not process that message",
      );
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <h2 className="text-lg font-semibold text-zinc-900">
            Conversation unavailable
          </h2>
          <p className="mt-2 text-sm text-zinc-500">
            {error ?? "Conversation not found"}
          </p>
          <Link
            className="mt-4 inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            href="/chat"
          >
            Start a new conversation
          </Link>
        </div>
      </div>
    );
  }

  const turns = groupConversationTurns(data.messages);
  const toolMessages = data.messages.filter(
    (message): message is Message & { role: "tool" } => message.role === "tool",
  );
  const repoName = data.repository.fullName;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 backdrop-blur">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-zinc-900">
              {data.conversation.title}
            </h1>
            <p className="truncate text-xs text-zinc-400">{repoName}</p>
          </div>
          <span className="shrink-0 rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-500">
            {data.repository.defaultBranch}
          </span>
        </header>

        {github && !github.connected ? (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-xs text-amber-800">
            GitHub is disconnected.{" "}
            <a
              className="font-semibold underline underline-offset-2"
              href="/api/github/connect"
            >
              Reconnect
            </a>{" "}
            before sending a message.
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {turns.length === 0 && !sending ? (
            <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-4 py-12 text-center">
              <Image
                alt="Bizzy logo"
                className="h-12 w-12 rounded-2xl bg-black object-contain p-1"
                height={1254}
                sizes="48px"
                src="/bizzy-logo.png"
                width={1254}
              />
              <h2 className="mt-4 text-lg font-semibold text-zinc-900">
                Ready to work in {repoName}
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                Ask the agent to fix a bug, add a feature, or explain the
                codebase. It works in an isolated sandbox and can open a pull
                request when you ask.
              </p>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
              {turns.map((turn) => {
                return (
                  <div className="space-y-3" key={turn.id}>
                    {turn.userMessage ? (
                      <div className="flex justify-end">
                        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-zinc-900 px-4 py-2.5 text-sm leading-6 text-white">
                          {turn.userMessage.content}
                        </div>
                      </div>
                    ) : null}

                    {turn.assistantMessages.length > 0 ? (
                      <div className="flex gap-2.5">
                        <Image
                          alt="Bizzy"
                          className="h-10 w-10 shrink-0 rounded-full object-cover"
                          height={1254}
                          sizes="40px"
                          src="/bizzy-logo.png"
                          width={1254}
                        />
                        <div className="min-w-0 max-w-[90%] break-words text-sm leading-6 text-zinc-800">
                          {turn.assistantMessages.some(
                            (message) => message.toolCalls?.length,
                          ) ? (
                            <AiToolActivity
                              calls={turn.assistantMessages.flatMap(
                                (message) => message.toolCalls ?? [],
                              )}
                              toolMessages={toolMessages}
                            />
                          ) : null}
                          {turn.assistantMessages.map((message) => (
                            <div key={message.id}>
                              {message.content ? (
                                <MarkdownMessage content={message.content} />
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {sending ? (
                <div className="flex gap-2.5">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-bold text-white">
                    A
                  </div>
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
                    <span className="ml-1 text-xs text-zinc-400">
                      Agent is working...
                    </span>
                  </div>
                </div>
              ) : null}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <form className="shrink-0 px-4 py-4" onSubmit={handleSubmit}>
          <div className="mx-auto w-full max-w-3xl">
            {sendError ? (
              <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {sendError}
              </p>
            ) : null}

            <div className="rounded-2xl border border-zinc-300 bg-transparent p-3 transition focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/10">
              <textarea
                className="max-h-24 min-h-16 w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 text-zinc-900 outline-none placeholder:text-zinc-400"
                disabled={sending}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask the agent to change ${repoName}...`}
                rows={2}
                value={input}
              />
              <div className="flex justify-end pt-2">
                <button
                  className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={sending || input.trim().length === 0}
                  type="submit"
                >
                  {sending ? "Working..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
      <RepoInspector
        defaultBranch={data.repository.defaultBranch}
        key={`${data.repository.owner}/${data.repository.name}`}
        owner={data.repository.owner}
        repo={data.repository.name}
      />
    </div>
  );
}
