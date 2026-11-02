"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-10">
      <div className="w-full max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          New conversation
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
          What should the agent work on?
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Choose a repository. The agent will clone it into a sandbox, make
          changes, and open a pull request when you ask it to.
        </p>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
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
                  className="mb-1.5 block text-sm font-medium text-zinc-700"
                  htmlFor="repository"
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
                  <select
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                    id="repository"
                    onChange={(event) => setSelected(event.target.value)}
                    value={selected}
                  >
                    {repositories.map((repository) => (
                      <option key={repository.id} value={repository.fullName}>
                        {repository.fullName}
                        {repository.private ? " (private)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {createError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {createError}
                </p>
              ) : null}

              <button
                className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  creating ||
                  loadingRepos ||
                  repositories.length === 0 ||
                  !selected
                }
                onClick={() => void handleCreate()}
                type="button"
              >
                {creating ? "Creating conversation..." : "Start conversation"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
