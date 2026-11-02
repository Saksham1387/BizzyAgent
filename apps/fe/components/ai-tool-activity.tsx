type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type ToolMessage = {
  role: "tool";
  toolCallId?: string | null;
  toolName?: string | null;
  content: string | null;
};

function isToolCall(value: unknown): value is ToolCall {
  if (typeof value !== "object" || value === null) return false;
  const call = value as Partial<ToolCall>;
  return (
    typeof call.id === "string" &&
    call.type === "function" &&
    typeof call.function?.name === "string" &&
    typeof call.function.arguments === "string"
  );
}

function pretty(value: string | null | undefined) {
  if (!value) return "No output";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function toolTitle(name: string, input: Record<string, unknown>) {
  switch (name) {
    case "bash":
      return `Ran ${String(input.command ?? "command")}`;
    case "run_subagent":
      return "Delegated task to subagent";
    case "github_list_issues":
      return "Searched repository issues";
    case "github_create_issue":
      return `Created issue: ${String(input.title ?? "New issue")}`;
    case "github_update_issue":
      return `Updated issue #${String(input.number ?? "")}`;
    case "github_get_pull_request":
      return `Inspected pull request #${String(input.number ?? "")}`;
    case "github_get_pull_request_checks":
      return `Checked CI for pull request #${String(input.number ?? "")}`;
    case "github_create_pull_request":
      return `Opened pull request: ${String(input.title ?? "New pull request")}`;
    default:
      return `Used ${name.replaceAll("_", " ")}`;
  }
}

function ToolCodeBlock({ children }: { children: string }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-lg bg-zinc-100 p-2.5 font-mono text-[10px] leading-4 text-zinc-700">
      {children}
    </pre>
  );
}

function ToolTrace({
  title,
  toolName,
  completed,
  input,
  output,
}: {
  title: string;
  toolName: string;
  completed: boolean;
  input: string;
  output: string | null;
}) {
  return (
    <div className="rounded-lg border border-zinc-200/70 p-3 text-left">
      <div className="flex items-center gap-2.5 text-xs font-medium">
        <span
          aria-hidden
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-violet-500/15 text-[10px] font-bold text-violet-300"
        >
          {completed ? "✓" : "…"}
        </span>
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className="shrink-0 text-[10px] text-zinc-400">{toolName}</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Input
          </p>
          <ToolCodeBlock>{input}</ToolCodeBlock>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Output
          </p>
          <ToolCodeBlock>{output ?? "Waiting for tool output…"}</ToolCodeBlock>
        </div>
      </div>
    </div>
  );
}

export function AiToolActivity({
  calls,
  toolMessages,
}: {
  calls: unknown[];
  toolMessages: ToolMessage[];
}) {
  const validCalls = calls.filter(isToolCall);
  if (validCalls.length === 0) return null;

  return (
    <details
      aria-label="Agent tool activity"
      className="my-2 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/70 text-left"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 text-xs font-medium marker:hidden">
        <span
          aria-hidden
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-violet-500/15 text-[10px] font-bold text-violet-300"
        >
          ✓
        </span>
        <span className="min-w-0 flex-1">
          Used {validCalls.length} {validCalls.length === 1 ? "tool" : "tools"}
        </span>
        <span className="truncate text-[10px] text-zinc-400">
          {validCalls.map((call) => call.function.name).join(" · ")}
        </span>
        <span aria-hidden className="text-zinc-400">
          ⌄
        </span>
      </summary>
      <div className="space-y-2 border-t border-zinc-200 p-2.5">
        {validCalls.map((call) => {
          const result = toolMessages.find(
            (message) => message.toolCallId === call.id,
          );
          let input: Record<string, unknown> = {};
          try {
            const parsed: unknown = JSON.parse(call.function.arguments);
            if (typeof parsed === "object" && parsed !== null) {
              input = parsed as Record<string, unknown>;
            }
          } catch {
            input = { raw: call.function.arguments };
          }

          return (
            <ToolTrace
              completed={Boolean(result)}
              input={pretty(JSON.stringify(input))}
              key={call.id}
              output={result ? pretty(result.content) : null}
              title={toolTitle(call.function.name, input)}
              toolName={call.function.name}
            />
          );
        })}
      </div>
    </details>
  );
}
