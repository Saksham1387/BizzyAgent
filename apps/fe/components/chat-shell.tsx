"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth-provider";
import { useTheme } from "@/components/theme-provider";
import { apiFetch } from "@/lib/api";
import type { ConversationWithRepository, GitHubStatus } from "@/lib/types";

type ChatDataContextValue = {
  conversations: ConversationWithRepository[];
  refreshConversations: () => Promise<void>;
  github: GitHubStatus | null;
  refreshGithub: () => Promise<void>;
};

const ChatDataContext = createContext<ChatDataContextValue | null>(null);

function GitHubMark() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.05c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.8 1.31 3.49 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.29-1.23 3.29-1.23.66 1.65.25 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.62-2.8 5.64-5.48 5.94.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5z" />
    </svg>
  );
}

async function fetchConversations() {
  const data = await apiFetch<{
    conversations: ConversationWithRepository[];
  }>("/conversations");

  return data.conversations;
}

async function fetchGithubStatus() {
  return apiFetch<GitHubStatus>("/github/status");
}

export function useChatData() {
  const context = useContext(ChatDataContext);

  if (!context) {
    throw new Error("useChatData must be used inside ChatShell");
  }

  return context;
}

export function ChatShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [conversations, setConversations] = useState<
    ConversationWithRepository[]
  >([]);
  const [github, setGithub] = useState<GitHubStatus | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const refreshConversations = useCallback(async () => {
    try {
      setConversations(await fetchConversations());
    } catch {
      setConversations([]);
    }
  }, []);

  const refreshGithub = useCallback(async () => {
    try {
      setGithub(await fetchGithubStatus());
    } catch {
      setGithub(null);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    void Promise.all([fetchConversations(), fetchGithubStatus()])
      .then(([nextConversations, nextGithub]) => {
        if (cancelled) {
          return;
        }

        setConversations(nextConversations);
        setGithub(nextGithub);
      })
      .catch(() => {
        if (!cancelled) {
          setConversations([]);
          setGithub(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDataLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleSignout() {
    await signout();
    router.replace("/signin");
  }

  if (loading || !user) {
    return (
      <main className="flex h-dvh items-center justify-center bg-zinc-50">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      </main>
    );
  }

  const value = {
    conversations,
    refreshConversations,
    github,
    refreshGithub,
  };

  return (
    <ChatDataContext.Provider value={value}>
      <div className="flex h-dvh overflow-hidden bg-zinc-50 text-zinc-900">
        <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white">
          <div className="flex items-center gap-2.5 px-4 pb-4 pt-4">
            <Image
              alt="Bizzy logo"
              className="h-9 w-9 rounded-lg bg-black object-contain"
              height={1254}
              sizes="36px"
              src="/bizzy-logo.png"
              width={1254}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">
                Bizzy
              </p>
              <p className="truncate text-[11px] text-zinc-400">
                CLOUD CODING AGENT
              </p>
            </div>
          </div>

          <div className="px-3 pb-2">
            <Link
              className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                pathname === "/chat"
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
              }`}
              href="/chat"
            >
              <span aria-hidden className="text-base leading-none">
                +
              </span>
              New conversation
            </Link>
          </div>

          <div className="mt-3 flex-1 overflow-y-auto px-2 pb-3">
            <div className="flex items-center justify-between px-2 pb-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                Sessions
              </p>
              <span className="text-[10px] tabular-nums text-zinc-400">
                {conversations.length}
              </span>
            </div>

            {dataLoading ? (
              <div className="flex justify-center px-2 py-6">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-500" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="px-2 py-3 text-xs leading-5 text-zinc-400">
                No conversations yet. Pick a repository to get started.
              </p>
            ) : (
              <div className="space-y-0.5">
                {conversations.map((conversation) => {
                  const isActive = pathname === `/chat/${conversation.id}`;

                  return (
                    <Link
                      className={`block rounded-xl px-2.5 py-2.5 transition ${
                        isActive ? "bg-zinc-100" : "hover:bg-zinc-50"
                      }`}
                      href={`/chat/${conversation.id}`}
                      key={conversation.id}
                    >
                      <span className="block truncate text-xs font-medium text-zinc-800">
                        {conversation.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-zinc-400">
                        {conversation.repository.fullName}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2.5 border-t border-zinc-200 p-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2.5">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                <GitHubMark />
                GitHub
              </p>
              {github === null ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Checking connection...
                </p>
              ) : github.connected ? (
                <p className="mt-1 truncate text-xs font-medium text-emerald-700">
                  Connected
                  {github.githubLogin ? ` as @${github.githubLogin}` : ""}
                </p>
              ) : (
                <a
                  className="mt-2 block rounded-md bg-zinc-900 px-2.5 py-1.5 text-center text-xs font-semibold text-white transition hover:bg-zinc-800"
                  href="/api/github/connect"
                >
                  Connect GitHub
                </a>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-700">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-zinc-800">
                  {user.name}
                </p>
                <p className="truncate text-[11px] text-zinc-400">
                  {user.email}
                </p>
              </div>
              <button
                className="shrink-0 rounded-md px-1.5 py-1 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                onClick={() => void handleSignout()}
                type="button"
              >
                Sign out
              </button>
            </div>
            <button
              className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100"
              onClick={toggleTheme}
              type="button"
            >
              <span>
                {theme === "dark" ? "Dark appearance" : "Light appearance"}
              </span>
              <span aria-hidden>{theme === "dark" ? "◐" : "☼"}</span>
            </button>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </ChatDataContext.Provider>
  );
}
