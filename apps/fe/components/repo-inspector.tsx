"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { GitHubCheckSummary, GitHubPullRequestDetails } from "@/lib/types";

function CheckMark({ state }: { state: string }) {
  const passed =
    state === "success" || state === "neutral" || state === "skipped";
  const failed =
    state === "failure" ||
    state === "cancelled" ||
    state === "timed_out" ||
    state === "error";
  return (
    <span
      aria-label={passed ? "Passed" : failed ? "Failed" : "In progress"}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
        passed
          ? "bg-emerald-500/15 text-emerald-400"
          : failed
            ? "bg-red-500/15 text-red-400"
            : "bg-amber-500/15 text-amber-300"
      }`}
    >
      {passed ? "✓" : failed ? "!" : "·"}
    </span>
  );
}

export function RepoInspector({
  owner,
  repo,
  defaultBranch,
}: {
  owner: string;
  repo: string;
  defaultBranch: string;
}) {
  const [pullRequests, setPullRequests] = useState<GitHubPullRequestDetails[]>(
    [],
  );
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [checks, setChecks] = useState<GitHubCheckSummary[]>([]);
  const [checksForNumber, setChecksForNumber] = useState<number | null>(null);
  const [checksRefreshKey, setChecksRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const path = `/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`;
    void apiFetch<{ pullRequests: GitHubPullRequestDetails[] }>(path)
      .then(({ pullRequests: next }) => {
        if (cancelled) return;
        setPullRequests(next);
        setSelectedNumber((current) => current ?? next[0]?.number ?? null);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load pull requests",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [owner, repo]);

  useEffect(() => {
    if (selectedNumber === null) {
      return;
    }
    let cancelled = false;
    const path = `/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${selectedNumber}/checks`;
    void apiFetch<{ checks: GitHubCheckSummary[] }>(path)
      .then((data) => {
        if (!cancelled) {
          setChecks(data.checks);
          setChecksForNumber(selectedNumber);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setChecksForNumber(selectedNumber);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load checks",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [owner, repo, selectedNumber, checksRefreshKey]);

  const selected = pullRequests.find((pull) => pull.number === selectedNumber);
  const checksLoading =
    selectedNumber !== null && checksForNumber !== selectedNumber;

  return (
    <aside className="hidden w-[18rem] shrink-0 flex-col border-l border-zinc-200 bg-white xl:flex">
      <div className="border-b border-zinc-200 px-4 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
          Repository
        </p>
        <h2 className="mt-2 truncate text-sm font-semibold">
          {owner}/{repo}
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Default branch{" "}
          <span className="font-mono text-zinc-700">{defaultBranch}</span>
        </p>
      </div>

      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
            Pull requests
          </p>
          <h3 className="mt-1 text-sm font-semibold">Open reviews</h3>
        </div>
        <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-500">
          {pullRequests.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {loading ? (
          <p className="px-2 py-4 text-xs text-zinc-500">
            Loading pull requests…
          </p>
        ) : error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
            {error}
          </p>
        ) : pullRequests.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-medium">No open pull requests</p>
            <p className="mt-1 text-[11px] leading-5 text-zinc-500">
              When the agent opens a PR, its latest checks will show here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {pullRequests.map((pull) => (
              <button
                className={`w-full rounded-xl border p-3 text-left transition ${selectedNumber === pull.number ? "border-violet-400/60 bg-violet-500/10" : "border-zinc-200 hover:bg-zinc-50"}`}
                key={pull.number}
                onClick={() => {
                  setSelectedNumber(pull.number);
                  setError(null);
                }}
                type="button"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 text-xs font-semibold leading-5">
                    {pull.title}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-400">
                    #{pull.number}
                  </span>
                </span>
                <span className="mt-2 block truncate text-[10px] text-zinc-500">
                  {pull.head} → {pull.base}
                </span>
              </button>
            ))}
          </div>
        )}

        {selected ? (
          <section className="mt-5 border-t border-zinc-200 pt-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                  CI checks
                </p>
                <h3 className="mt-1 text-sm font-semibold">
                  PR #{selected.number}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  aria-label="Refresh CI checks"
                  className="text-xs text-zinc-400 transition hover:text-zinc-900"
                  onClick={() => {
                    setError(null);
                    setChecksForNumber(null);
                    setChecksRefreshKey((key) => key + 1);
                  }}
                  type="button"
                >
                  ↻
                </button>
                <a
                  className="text-[10px] font-semibold text-violet-300 hover:text-violet-200"
                  href={selected.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open ↗
                </a>
              </div>
            </div>
            {checksLoading ? (
              <p className="py-4 text-xs text-zinc-500">Loading checks…</p>
            ) : checks.length === 0 ? (
              <p className="py-4 text-xs leading-5 text-zinc-500">
                No check runs have reported for this commit yet.
              </p>
            ) : (
              <div className="mt-3 space-y-1">
                {checks.map((check, index) => (
                  <a
                    className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-zinc-50"
                    href={check.detailsUrl ?? selected.url}
                    key={`${check.name}-${index}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <CheckMark state={check.conclusion ?? check.status} />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                      {check.name}
                    </span>
                    <span className="shrink-0 text-[9px] capitalize text-zinc-400">
                      {check.conclusion ?? check.status.replaceAll("_", " ")}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>

      <div className="border-t border-zinc-200 px-4 py-3 text-[10px] text-zinc-500">
        Scoped to this repository
      </div>
    </aside>
  );
}
