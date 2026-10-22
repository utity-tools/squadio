// @vitest-environment node
import { describe, expect, it } from "vitest";

import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/layout/compact-layout";

import { viewportShowing } from "./viewport";

const size = { width: 800, height: 600 };

describe("viewportShowing", () => {
  it("leaves the viewport alone when the node is already in view", () => {
    expect(viewportShowing({ x: 100, y: 100 }, { x: 0, y: 0, zoom: 1 }, size)).toBeNull();
  });

  it("centres a node that is out of view, keeping the zoom", () => {
    const viewport = viewportShowing({ x: 2000, y: 100 }, { x: 0, y: 0, zoom: 0.5 }, size);

    expect(viewport).toEqual({
      x: size.width / 2 - (2000 + NODE_WIDTH / 2) * 0.5,
      y: size.height / 2 - (100 + NODE_HEIGHT / 2) * 0.5,
      zoom: 0.5,
    });
  });

  it("counts a node cut by the edge of the canvas as out of view", () => {
    expect(viewportShowing({ x: 700, y: 0 }, { x: 0, y: 0, zoom: 1 }, size)).not.toBeNull();
    expect(viewportShowing({ x: 0, y: -10 }, { x: 0, y: 0, zoom: 1 }, size)).not.toBeNull();
  });
});
