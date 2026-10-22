import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/layout/compact-layout";

/** React Flow's viewport: the canvas shifted by x and y screen pixels, then scaled by zoom. */
export type Viewport = { x: number; y: number; zoom: number };

/**
 * A viewport that centres the node at the same zoom, or null when the whole node is already in
 * view: the brief's "focused node scrolls into view", without moving the canvas needlessly.
 */
export function viewportShowing(
  node: { x: number; y: number },
  viewport: Viewport,
  size: { width: number; height: number },
): Viewport | null {
  const { x, y, zoom } = viewport;
  const left = node.x * zoom + x;
  const top = node.y * zoom + y;
  const inView =
    left >= 0 &&
    top >= 0 &&
    left + NODE_WIDTH * zoom <= size.width &&
    top + NODE_HEIGHT * zoom <= size.height;
  if (inView) return null;
  return {
    x: size.width / 2 - (node.x + NODE_WIDTH / 2) * zoom,
    y: size.height / 2 - (node.y + NODE_HEIGHT / 2) * zoom,
    zoom,
  };
}
