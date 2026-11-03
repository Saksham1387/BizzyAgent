"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { FaGithub } from "react-icons/fa6";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useChatData } from "@/components/chat-shell";
import { apiFetch } from "@/lib/api";
import type { Conversation, GitHubRepository } from "@/lib/types";

async function fetchRepositories() {
  const data = await apiFetch<{ repositories: GitHubRepository[] }>(
    "/github/repos",
  );

  return data.repositories;
}

export default function NewConversationPage() {
  const router = useRouter();
  const { github, refreshConversations } = useChatData();
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [selected, setSelected] = useState("");
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!github?.connected) {
      return;
    }

    let cancelled = false;

    void fetchRepositories()
      .then((nextRepositories) => {
        if (cancelled) {
          return;
        }

        setRepositories(nextRepositories);
        setSelected(
          (current) => current || nextRepositories[0]?.fullName || "",
        );
        setRepoError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setRepoError(
            error instanceof Error
              ? error.message
              : "Failed to load repositories",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingRepos(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [github?.connected]);

  async function handleRetry() {
    setLoadingRepos(true);
    setRepoError(null);

    try {
      const nextRepositories = await fetchRepositories();
      setRepositories(nextRepositories);
      setSelected((current) => current || nextRepositories[0]?.fullName || "");
    } catch (error) {
      setRepoError(
        error instanceof Error ? error.message : "Failed to load repositories",
      );
    } finally {
      setLoadingRepos(false);
    }
  }

  async function handleCreate() {
    const repository = repositories.find(
      (candidate) => candidate.fullName === selected,
    );

    if (!repository) {
      setCreateError("Choose a repository first");
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const data = await apiFetch<{ conversation: Conversation }>(
        "/conversations",
        {
          method: "POST",
          body: JSON.stringify({
            repoUrl: repository.fullName,
            defaultBranch: repository.defaultBranch,
          }),
        },
      );

      await refreshConversations();
      router.push(`/chat/${data.conversation.id}`);
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Failed to create conversation",
      );
      setCreating(false);
    }
  }

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-y-auto px-4 py-12">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[28rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/[0.07] blur-3xl" />
      <div className="relative w-full max-w-lg">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-lg shadow-black/5">
            <Image
              alt="Bizzy"
              className="h-full w-full object-contain"
              height={1254}
              priority
              src="/bizzy-logo.png"
              width={1254}
            />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">
            New workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
            What are we building?
          </h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
            Choose a repository to give Bizzy a clean sandbox for your next
            change.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl shadow-black/5 sm:p-6">
          {github === null ? (
            <div className="flex items-center gap-3 py-4">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-500" />
              <p className="text-sm text-zinc-500">
                Checking GitHub connection...
              </p>
            </div>
          ) : !github.connected ? (
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">
                Connect GitHub first
              </h2>
              <p className="mt-1 text-sm leading-6 text-zinc-500">
                Install the GitHub App so the agent can access your
                repositories.
              </p>
              <a
                className="mt-4 inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
                href="/api/github/connect"
              >
                Connect GitHub
              </a>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-zinc-700"
                  id="repository-label"
                >
                  Repository
                </label>

                {loadingRepos ? (
                  <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
                    <p className="text-sm text-zinc-500">
                      Loading repositories...
                    </p>
                  </div>
                ) : repoError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-700">{repoError}</p>
                    <button
                      className="mt-2 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
                      onClick={() => void handleRetry()}
                      type="button"
                    >
                      Try again
                    </button>
                  </div>
                ) : repositories.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm text-amber-800">
                      No repositories are available to this installation.
                    </p>
                    <a
                      className="mt-2 inline-block text-xs font-semibold text-amber-900 underline underline-offset-2"
                      href="/api/github/connect"
                    >
                      Update GitHub App access
                    </a>
                  </div>
                ) : (
                  <Select onValueChange={setSelected} value={selected}>
                    <SelectTrigger
                      aria-labelledby="repository-label"
                      id="repository"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <FaGithub className="h-[18px] w-[18px] shrink-0 text-zinc-500" />
                        <SelectValue placeholder="Select a repository" />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {repositories.map((repository) => (
                        <SelectItem
                          key={repository.id}
                          value={repository.fullName}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <FaGithub className="h-4 w-4 shrink-0 text-zinc-400" />
                            <span className="truncate">
                              {repository.fullName}
                            </span>
                            {repository.private ? (
                              <span className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                                Private
                              </span>
                            ) : null}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {createError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {createError}
                </p>
              ) : null}

              <button
                className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/15 transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  creating ||
                  loadingRepos ||
                  repositories.length === 0 ||
                  !selected
                }
                onClick={() => void handleCreate()}
                type="button"
              >
                {creating ? "Creating workspace..." : "Continue to chat"}
              </button>
              <p className="text-center text-xs text-zinc-400">
                Bizzy will work in an isolated sandbox. Your repository stays
                unchanged until you ask for a pull request.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
