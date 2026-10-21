/**
 * Stop hook: checks the context-drift canary from CLAUDE.md. If the final reply of the turn does
 * not start with "Capitán", exit code 2 keeps Claude going and sends stderr back to it. Progress
 * notes written earlier in the turn are not checked.
 * Fails open: an unreadable transcript never blocks.
 * Runs with Node's built-in type stripping: keep to erasable TypeScript syntax.
 */
import { readFileSync } from "node:fs";

const CANARY = "Capitán";

type Block = { type?: string; text?: string };
type Entry = {
  type?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  message?: { content?: string | Block[] };
};

function parse(line: string): Entry | null {
  try {
    return JSON.parse(line) as Entry;
  } catch {
    return null;
  }
}

/** Last text Claude wrote after the latest user prompt, or null if it has written none. */
export function finalReplyText(lines: string[]): string | null {
  let reply: string | null = null;

  for (const entry of lines.map(parse)) {
    if (!entry || entry.isSidechain || entry.isMeta) continue;
    const content = entry.message?.content;

    if (entry.type === "user") {
      const isPrompt =
        typeof content === "string" || content?.some((block) => block.type === "text");
      if (isPrompt) reply = null;
    } else if (entry.type === "assistant" && Array.isArray(content)) {
      reply = content.findLast((block) => block.type === "text")?.text ?? reply;
    }
  }

  return reply;
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8")) as {
    transcript_path?: string;
    stop_hook_active?: boolean;
  };

  if (!input.stop_hook_active && input.transcript_path) {
    let reply: string | null = null;
    try {
      reply = finalReplyText(readFileSync(input.transcript_path, "utf8").split("\n"));
    } catch {
      // Fail open.
    }

    if (reply !== null && !reply.trimStart().startsWith(CANARY)) {
      process.stderr.write(
        `Canary failed: your reply did not start with "${CANARY}". Your context may have drifted. ` +
          "Re-read CLAUDE.md and AGENTS.md; if the session is long, run /handoff and start a new one.\n",
      );
      process.exit(2);
    }
  }
}
