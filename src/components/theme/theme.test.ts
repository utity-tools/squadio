import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  THEME_CHANGE_EVENT,
  THEME_COOKIE,
  bootstrapTheme,
  readThemePreference,
  themeCookie,
  themeScript,
  writeThemePreference,
} from "./theme";

let prefersDark = false;
let mediaListeners: (() => void)[] = [];

function setSystemDark(dark: boolean) {
  prefersDark = dark;
  for (const listener of mediaListeners) listener();
}

function clearCookie() {
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0`;
}

beforeEach(() => {
  prefersDark = false;
  mediaListeners = [];
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return prefersDark;
      },
      addEventListener: (_: string, listener: () => void) => mediaListeners.push(listener),
    })),
  );
  clearCookie();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCookie();
});

describe("readThemePreference", () => {
  it("is system without a cookie", () => {
    expect(readThemePreference("")).toBe("system");
  });

  it("reads the theme cookie among others", () => {
    expect(readThemePreference(`a=1; ${THEME_COOKIE}=dark; b=2`)).toBe("dark");
  });

  it("falls back to system for an unknown value", () => {
    expect(readThemePreference(`${THEME_COOKIE}=sepia`)).toBe("system");
  });
});

describe("themeCookie", () => {
  it("is Secure on https and plain on http, where a Secure cookie would not be stored", () => {
    expect(themeCookie("dark", "https:")).toMatch(/; Secure$/);
    expect(themeCookie("dark", "http:")).not.toMatch(/Secure/);
  });
});

describe("writeThemePreference", () => {
  it("stores the preference in a cookie for a year and announces the change", () => {
    const announced = vi.fn();
    window.addEventListener(THEME_CHANGE_EVENT, announced);

    writeThemePreference("light");

    expect(readThemePreference(document.cookie)).toBe("light");
    expect(announced).toHaveBeenCalledOnce();
    window.removeEventListener(THEME_CHANGE_EVENT, announced);
  });
});

describe("bootstrapTheme", () => {
  it("follows the system theme without a preference", () => {
    setSystemDark(true);

    bootstrapTheme(THEME_COOKIE, THEME_CHANGE_EVENT);

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("lets a stored preference win over the system", () => {
    setSystemDark(true);
    document.cookie = `${THEME_COOKIE}=light; path=/`;

    bootstrapTheme(THEME_COOKIE, THEME_CHANGE_EVENT);

    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("follows the system when it changes while the preference is system", () => {
    bootstrapTheme(THEME_COOKIE, THEME_CHANGE_EVENT);
    expect(document.documentElement.dataset.theme).toBe("light");

    setSystemDark(true);

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applies a new preference as soon as it is written", () => {
    bootstrapTheme(THEME_COOKIE, THEME_CHANGE_EVENT);

    writeThemePreference("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("themeScript", () => {
  it("is a self-contained script that bootstraps the theme", () => {
    document.cookie = `${THEME_COOKIE}=dark; path=/`;

    new Function(themeScript)();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
