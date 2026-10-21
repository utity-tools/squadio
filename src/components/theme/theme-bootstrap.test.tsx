import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_COOKIE } from "./theme";
import { ThemeBootstrap } from "./theme-bootstrap";

const addListener = vi.fn();

beforeEach(() => {
  addListener.mockClear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: addListener })),
  );
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0`;
});

describe("ThemeBootstrap", () => {
  it("applies the theme when the inline script did not run, as on a client-rendered 404", () => {
    document.cookie = `${THEME_COOKIE}=dark; path=/`;

    render(<ThemeBootstrap />);

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("leaves the theme to the inline script when it already ran", () => {
    document.documentElement.dataset.theme = "light";

    render(<ThemeBootstrap />);

    expect(addListener).not.toHaveBeenCalled();
  });

  it("renders nothing", () => {
    const { container } = render(<ThemeBootstrap />);

    expect(container).toBeEmptyDOMElement();
  });
});
