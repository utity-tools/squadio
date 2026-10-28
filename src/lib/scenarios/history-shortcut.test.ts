import { describe, expect, it } from "vitest";

import { historyShortcut } from "./history-shortcut";

// ⌘Z and ⇧⌘Z on a Mac, Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y elsewhere (canvas brief, "Undo / redo").

const key = (
  key: string,
  mods: Partial<Record<"meta" | "ctrl" | "shift" | "alt", boolean>> = {},
) => ({
  key,
  metaKey: mods.meta ?? false,
  ctrlKey: mods.ctrl ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
});

describe("historyShortcut", () => {
  it("reads ⌘Z and ⇧⌘Z on a Mac", () => {
    expect(historyShortcut(key("z", { meta: true }), true)).toBe("undo");
    expect(historyShortcut(key("Z", { meta: true, shift: true }), true)).toBe("redo");
  });

  it("reads Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y elsewhere", () => {
    expect(historyShortcut(key("z", { ctrl: true }), false)).toBe("undo");
    expect(historyShortcut(key("Z", { ctrl: true, shift: true }), false)).toBe("redo");
    expect(historyShortcut(key("y", { ctrl: true }), false)).toBe("redo");
  });

  it("ignores the other platform's modifier, other keys and extra modifiers", () => {
    expect(historyShortcut(key("z", { ctrl: true }), true)).toBeNull();
    expect(historyShortcut(key("z", { meta: true }), false)).toBeNull();
    expect(historyShortcut(key("y", { meta: true }), true)).toBeNull();
    expect(historyShortcut(key("z"), false)).toBeNull();
    expect(historyShortcut(key("x", { ctrl: true }), false)).toBeNull();
    expect(historyShortcut(key("z", { ctrl: true, alt: true }), false)).toBeNull();
    expect(historyShortcut(key("z", { ctrl: true, meta: true }), false)).toBeNull();
    expect(historyShortcut(key("y", { ctrl: true, shift: true }), false)).toBeNull();
  });
});
