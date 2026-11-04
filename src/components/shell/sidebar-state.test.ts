import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SIDEBAR_CHANGE_EVENT,
  bootstrapSidebar,
  currentSidebarState,
  readSidebarState,
  sidebarCookie,
  sidebarCookieName,
  sidebarScript,
  writeSidebarState,
} from "./sidebar-state";

// The sidebar is open on the app's pages and folded to icons in the scenario editor, so the canvas
// keeps its width (design board "Navegación de la app"). Each place remembers the person's choice
// in a cookie, which an inline script turns into an attribute on <html> before the first paint,
// as the theme does: the pages stay static and the sidebar never jumps.

function clearCookies() {
  for (const scope of ["app", "editor"] as const) {
    document.cookie = `${sidebarCookieName(scope)}=; path=/; max-age=0`;
  }
}

beforeEach(() => {
  clearCookies();
  delete document.documentElement.dataset.sidebarApp;
  delete document.documentElement.dataset.sidebarEditor;
});

afterEach(clearCookies);

describe("readSidebarState", () => {
  it("is open on the app's pages and folded in the editor without a cookie", () => {
    expect(readSidebarState("", "app")).toBe("expanded");
    expect(readSidebarState("", "editor")).toBe("collapsed");
  });

  it("reads each place's cookie among others", () => {
    const cookie = `a=1; ${sidebarCookieName("app")}=collapsed; ${sidebarCookieName("editor")}=expanded`;
    expect(readSidebarState(cookie, "app")).toBe("collapsed");
    expect(readSidebarState(cookie, "editor")).toBe("expanded");
  });

  it("falls back to the place's default for an unknown value", () => {
    expect(readSidebarState(`${sidebarCookieName("app")}=wide`, "app")).toBe("expanded");
  });
});

describe("sidebarCookie", () => {
  it("lasts a year, and is Secure on https only", () => {
    expect(sidebarCookie("app", "collapsed", "https:")).toMatch(/max-age=31536000.*; Secure$/);
    expect(sidebarCookie("app", "collapsed", "http:")).not.toMatch(/Secure/);
  });
});

describe("bootstrapSidebar", () => {
  it("puts each place's state on <html>", () => {
    document.cookie = `${sidebarCookieName("editor")}=expanded; path=/`;

    bootstrapSidebar(sidebarCookieName("app"), sidebarCookieName("editor"));

    expect(document.documentElement.dataset.sidebarApp).toBe("expanded");
    expect(document.documentElement.dataset.sidebarEditor).toBe("expanded");
  });

  it("is the inline script, self-contained", () => {
    document.cookie = `${sidebarCookieName("app")}=collapsed; path=/`;

    new Function(sidebarScript)();

    expect(document.documentElement.dataset.sidebarApp).toBe("collapsed");
    expect(document.documentElement.dataset.sidebarEditor).toBe("collapsed");
  });
});

describe("writeSidebarState", () => {
  it("stores the choice, applies it at once and announces it", () => {
    const announced = vi.fn();
    window.addEventListener(SIDEBAR_CHANGE_EVENT, announced);

    writeSidebarState("app", "collapsed");

    expect(document.cookie).toContain(`${sidebarCookieName("app")}=collapsed`);
    expect(document.documentElement.dataset.sidebarApp).toBe("collapsed");
    expect(currentSidebarState("app")).toBe("collapsed");
    expect(announced).toHaveBeenCalledOnce();
    window.removeEventListener(SIDEBAR_CHANGE_EVENT, announced);
  });
});

describe("currentSidebarState", () => {
  it("is the place's default before the script has run", () => {
    expect(currentSidebarState("app")).toBe("expanded");
    expect(currentSidebarState("editor")).toBe("collapsed");
  });
});
