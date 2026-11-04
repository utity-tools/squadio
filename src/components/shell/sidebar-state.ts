// Whether the sidebar is open lives in a cookie per place and becomes `data-sidebar-app` and
// `data-sidebar-editor` on <html> before the first paint, through an inline script in <head>, as
// the theme does (theme.ts). The CSS reads the attribute, so the pages stay static and the sidebar
// never jumps on hydration.

export const SIDEBAR_CHANGE_EVENT = "squadio:sidebarchange";

/** The app's pages, where the sidebar starts open, and the scenario editor, where it starts folded. */
export type SidebarScope = "app" | "editor";
export type SidebarState = "expanded" | "collapsed";

export const defaultSidebarState: Record<SidebarScope, SidebarState> = {
  app: "expanded",
  editor: "collapsed",
};
const datasetKeys = { app: "sidebarApp", editor: "sidebarEditor" } as const;

const isSidebarState = (value: string | undefined): value is SidebarState =>
  value === "expanded" || value === "collapsed";

export const sidebarCookieName = (scope: SidebarScope) => `squadio-sidebar-${scope}`;

/** The stored state of a place in a `document.cookie` string; its default when absent or unknown. */
export function readSidebarState(cookie: string, scope: SidebarScope): SidebarState {
  const name = sidebarCookieName(scope);
  const value = cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return isSidebarState(value) ? value : defaultSidebarState[scope];
}

/** The cookie that stores a place's state for a year; Secure whenever the page is on https. */
export function sidebarCookie(scope: SidebarScope, state: SidebarState, protocol: string) {
  const secure = protocol === "https:" ? "; Secure" : "";
  return `${sidebarCookieName(scope)}=${state}; path=/; max-age=31536000; SameSite=Lax${secure}`;
}

/** The state the page shows now: the attribute on <html>, or the place's default without it. */
export function currentSidebarState(scope: SidebarScope): SidebarState {
  const value = document.documentElement.dataset[datasetKeys[scope]];
  return isSidebarState(value) ? value : defaultSidebarState[scope];
}

/** Stores a place's state, applies it and lets the page know. */
export function writeSidebarState(scope: SidebarScope, state: SidebarState) {
  document.cookie = sidebarCookie(scope, state, window.location.protocol);
  document.documentElement.dataset[datasetKeys[scope]] = state;
  window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT));
}

/**
 * Sets both attributes from the cookies. It runs inline in <head> as a string, so it must not use
 * anything outside itself: the defaults are written out again here.
 */
export function bootstrapSidebar(appCookie: string, editorCookie: string) {
  const read = (name: string, fallback: string) => {
    let value: string | undefined;
    try {
      value = document.cookie
        .split("; ")
        .find((entry) => entry.startsWith(name + "="))
        ?.slice(name.length + 1);
    } catch {
      // Cookies can be blocked; each place keeps its default then.
    }
    return value === "expanded" || value === "collapsed" ? value : fallback;
  };
  document.documentElement.dataset.sidebarApp = read(appCookie, "expanded");
  document.documentElement.dataset.sidebarEditor = read(editorCookie, "collapsed");
}

export const sidebarScript = `(${bootstrapSidebar.toString()})(${JSON.stringify(sidebarCookieName("app"))},${JSON.stringify(sidebarCookieName("editor"))})`;
