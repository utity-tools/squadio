// The keyboard shortcuts for the scenario's history (canvas brief, "Undo / redo"): ⌘Z and ⇧⌘Z on a
// Mac; Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y elsewhere. Any other modifier makes it another shortcut.

export type HistoryKey = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

export function historyShortcut(event: HistoryKey, mac: boolean): "undo" | "redo" | null {
  const command = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!command || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !mac && !event.shiftKey) return "redo";
  return null;
}
