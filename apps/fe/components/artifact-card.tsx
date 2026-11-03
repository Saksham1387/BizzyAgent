import type { ConversationArtifact } from "@/lib/types";
import { IoMdGitPullRequest } from "react-icons/io";

function isConversationArtifact(value: unknown): value is ConversationArtifact {
  if (typeof value !== "object" || value === null) return false;
  const artifact = value as Partial<ConversationArtifact>;
  return (
    (artifact.kind === "issue" || artifact.kind === "pull_request") &&
    typeof artifact.number === "number" &&
    Number.isSafeInteger(artifact.number) &&
    artifact.number > 0 &&
    typeof artifact.title === "string" &&
    typeof artifact.repository === "string" &&
    typeof artifact.url === "string" &&
    /^https:\/\/github\.com\//.test(artifact.url)
  );
}

export function parseConversationArtifacts(value: unknown) {
  return Array.isArray(value) ? value.filter(isConversationArtifact) : [];
}

export function ArtifactCard({ artifact }: { artifact: ConversationArtifact }) {
  const isIssue = artifact.kind === "issue";
  const typeLabel = isIssue ? "Issue created" : "Pull request opened";

  return (
    <a
      className="my-2 flex max-w-xl items-start gap-3 rounded-xl border border-zinc-200  p-3 transition hover:border-violet-400/50 hover:bg-zinc-100"
      href={artifact.url}
      rel="noreferrer"
      target="_blank"
    >
      <IoMdGitPullRequest className="text-green w-5 h-5 text-green-600"/>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          {typeLabel} #{artifact.number}
        </span>
        <span className="mt-1 block truncate text-xs font-semibold text-zinc-800">
          {artifact.title}
        </span>
      </span>
    </a>
  );
}
