// @vitest-environment node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { firstReplyText } from "./canary-check";

const hook = fileURLToPath(new URL("./canary-check.ts", import.meta.url));

const prompt = (text: string) => ({ type: "user", message: { role: "user", content: text } });
const toolResult = () => ({
  type: "user",
  message: { role: "user", content: [{ type: "tool_result", content: "ok" }] },
});
const reply = (...blocks: { type: string; text?: string }[]) => ({
  type: "assistant",
  message: { role: "assistant", content: blocks },
});
const text = (value: string) => ({ type: "text", text: value });

const lines = (...entries: object[]) => entries.map((entry) => JSON.stringify(entry));

describe("firstReplyText", () => {
  it("returns the first text of the latest turn, skipping thinking and tool calls", () => {
    const transcript = lines(
      prompt("first"),
      reply(text("Capitán, old turn")),
      prompt("second"),
      reply({ type: "thinking" }),
      reply({ type: "tool_use" }),
      toolResult(),
      reply(text("Capitán, new turn")),
      reply(text("trailing note")),
    );

    expect(firstReplyText(transcript)).toBe("Capitán, new turn");
  });

  it("ignores subagent and meta entries", () => {
    const transcript = lines(
      prompt("go"),
      { ...reply(text("subagent talk")), isSidechain: true },
      { ...prompt("<system-reminder>"), isMeta: true },
      reply(text("Capitán, done")),
    );

    expect(firstReplyText(transcript)).toBe("Capitán, done");
  });

  it("returns null when the turn has no text yet", () => {
    expect(firstReplyText(lines(prompt("go"), reply({ type: "tool_use" })))).toBeNull();
  });

  it("skips lines that are not valid JSON", () => {
    expect(firstReplyText(["{broken", ...lines(prompt("go"), reply(text("Capitán")))])).toBe(
      "Capitán",
    );
  });
});

describe("canary-check hook", () => {
  const run = (input: object) =>
    spawnSync(process.execPath, [hook], { input: JSON.stringify(input), encoding: "utf8" });

  const transcriptWith = (...entries: object[]) => {
    const path = join(mkdtempSync(join(tmpdir(), "canary-")), "transcript.jsonl");
    writeFileSync(path, lines(...entries).join("\n"));
    return path;
  };

  it("exits 0 when the reply starts with the canary", () => {
    const transcript_path = transcriptWith(prompt("go"), reply(text("Capitán · all good")));

    expect(run({ transcript_path }).status).toBe(0);
  });

  it("exits 2 when the reply drops the canary", () => {
    const transcript_path = transcriptWith(prompt("go"), reply(text("All good")));
    const result = run({ transcript_path });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Capitán");
  });

  it("does not block twice in a row", () => {
    const transcript_path = transcriptWith(prompt("go"), reply(text("All good")));

    expect(run({ transcript_path, stop_hook_active: true }).status).toBe(0);
  });

  it("does not block when the transcript cannot be read", () => {
    expect(run({ transcript_path: "/nonexistent/transcript.jsonl" }).status).toBe(0);
  });
});
