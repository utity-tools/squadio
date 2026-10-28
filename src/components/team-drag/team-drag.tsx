"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  createContext,
  use,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import type { Dragged, DropZone } from "@/lib/scenarios/drop-action";

// ADR 0008, point 1: one pointer-events layer drags people from the bench into the team and
// assignments inside it, for mouse, touch and pen alike. No HTML5 drag-and-drop: it fails with
// touch. The team decides what a drop does (`dropAction`), the same way its menus do.

/** What the team does with drops; registered by the team's editing context. */
export type DropHandler = {
  /** Whether dropping there does anything: only then is the zone highlighted. */
  accepts: (dragged: Dragged, zone: DropZone) => boolean;
  drop: (dragged: Dragged, zone: DropZone) => void;
};

type TeamDrag = {
  /** Whether anything takes drops: without it, nothing offers a grip. */
  enabled: boolean;
  /** Called from a grip's pointerdown; the drag starts once the pointer has moved a little. */
  start: (event: ReactPointerEvent<HTMLElement>, dragged: Dragged, label: string) => void;
  register: (handler: DropHandler) => () => void;
};

/** What changes while a drag goes on, apart from the functions above, which do not. */
type DragState = {
  /** What is being dragged, once the drag has started. */
  dragged: Dragged | null;
  /** The zone under the pointer, only when dropping there does something. */
  over: DropZone | null;
};

const TeamDragContext = createContext<TeamDrag>({
  enabled: false,
  start: () => {},
  register: () => () => {},
});

const DragStateContext = createContext<DragState>({ dragged: null, over: null });

/** Starts drags and registers the drop handler; it does not change while a drag goes on. */
export function useTeamDrag(): TeamDrag {
  return use(TeamDragContext);
}

/** What is being dragged and where it would drop, for the cards and zones that show it. */
export function useDragState(): DragState {
  return use(DragStateContext);
}

/** How far the pointer moves before a press becomes a drag, so a click stays a click. */
const THRESHOLD_PX = 4;

/**
 * The drop zone at a point: an assignment's node, or the canvas around the nodes. Only elements
 * inside a `data-drop-root` take drops; a node is marked with `data-drop-node`.
 */
export function zoneAt(x: number, y: number): DropZone | null {
  const element = document.elementFromPoint(x, y);
  // Controls on the canvas, such as the zoom buttons, are not part of it.
  if (!element?.closest("[data-drop-root]") || element.closest("[data-no-drop]")) return null;
  const id = element.closest<HTMLElement>("[data-drop-node]")?.dataset.dropNode;
  return id ? { kind: "assignment", id } : { kind: "canvas" };
}

const sameZone = (a: DropZone | null, b: DropZone | null) =>
  a?.kind === "assignment" ? b?.kind === "assignment" && a.id === b.id : a?.kind === b?.kind;

/** Gives the bench and the team one drag layer; it lives above both, in the scenario editor. */
export function TeamDragProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  /** Read at each move and at the drop, so a handler that goes away mid-drag is never called. */
  const handler = useRef<DropHandler | null>(null);
  const [drag, setDrag] = useState<{ dragged: Dragged; label: string } | null>(null);
  const [over, setOver] = useState<DropZone | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  /** Where the pointer is, for the ghost's first frame. */
  const point = useRef({ x: 0, y: 0 });
  /** Ends the current press or drag; set while one is under way. */
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => () => stop.current?.(), []);

  // One function for the provider's life, so registering never runs again on its own.
  const [register] = useState(() => (next: DropHandler) => {
    handler.current = next;
    setEnabled(true);
    return () => {
      if (handler.current !== next) return;
      handler.current = null;
      setEnabled(false);
      // Nothing takes the drop any more, such as after the scenario was chosen.
      stop.current?.();
    };
  });

  function start(event: ReactPointerEvent<HTMLElement>, dragged: Dragged, label: string) {
    if (!handler.current || !event.isPrimary || event.button !== 0) return;
    // No text selection, and no scrolling or panning under the finger.
    event.preventDefault();
    event.stopPropagation();
    stop.current?.();
    const { pointerId } = event;
    const origin = { x: event.clientX, y: event.clientY };
    let started = false;
    let zone: DropZone | null = null;

    const place = () => {
      const { x, y } = point.current;
      if (ghost.current) ghost.current.style.transform = `translate(${x + 8}px, ${y + 8}px)`;
    };
    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      point.current = { x: move.clientX, y: move.clientY };
      if (!started) {
        if (Math.hypot(move.clientX - origin.x, move.clientY - origin.y) < THRESHOLD_PX) return;
        started = true;
        setDrag({ dragged, label });
      }
      place();
      const at = zoneAt(move.clientX, move.clientY);
      const next = at && handler.current?.accepts(dragged, at) ? at : null;
      if (!sameZone(next, zone)) {
        zone = next;
        setOver(next);
      }
    };
    const onUp = (up: PointerEvent) => {
      if (up.pointerId !== pointerId) return;
      const target = zone;
      end();
      if (started && target) handler.current?.drop(dragged, target);
    };
    const onCancel = (cancel: PointerEvent) => {
      if (cancel.pointerId === pointerId) end();
    };
    const onKey = (key: KeyboardEvent) => {
      if (key.key !== "Escape") return;
      // Before the drag starts, Escape is still the menus' and tooltips' to take.
      if (started) key.preventDefault();
      end();
    };
    const end = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", end);
      stop.current = null;
      setDrag(null);
      setOver(null);
    };

    point.current = origin;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    // Leaving the window mid-drag, the release may never come back here.
    window.addEventListener("blur", end);
    stop.current = end;
  }

  return (
    <TeamDragContext value={{ enabled, start, register }}>
      <DragStateContext value={{ dragged: drag?.dragged ?? null, over }}>
        {children}
      </DragStateContext>
      {drag &&
        createPortal(
          // What is being dragged, under the pointer. The drop's announcement is what a screen
          // reader hears.
          <div
            ref={(element) => {
              ghost.current = element;
              if (!element) return;
              const { x, y } = point.current;
              element.style.transform = `translate(${x + 8}px, ${y + 8}px)`;
            }}
            aria-hidden
            data-drag-ghost=""
            className="pointer-events-none fixed top-0 left-0 z-50 max-w-48 truncate rounded-md border bg-card px-2 py-1 text-sm font-medium text-card-foreground shadow-md"
          >
            {drag.label}
          </div>,
          document.body,
        )}
    </TeamDragContext>
  );
}
