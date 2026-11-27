import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { describe, expect, it } from "vitest";

import { TeamDragProvider, useTeamDrag } from "@/components/team-drag/team-drag";
import { renderWithIntl } from "@/test/render";

import { BenchDock } from "./bench-dock";

/** A button drawn into the dock from elsewhere, as the team's views draw "Add to team…". */
function Portalled({ into }: { into: HTMLElement | null }) {
  return into ? createPortal(<button type="button">Añadir al equipo…</button>, into) : null;
}

/** A grip that drags, with a drop handler registered so drags can start. */
function Grip() {
  const drag = useTeamDrag();
  const { register } = drag;
  useEffect(() => register({ accepts: () => true, drop: () => {} }), [register]);
  return (
    <button
      type="button"
      onPointerDown={(event) => drag.start(event, { kind: "person", personId: "p1" }, "Person 1")}
    >
      Persona 1
    </button>
  );
}

function Page({ locale = "es", extra }: { locale?: "es" | "en"; extra?: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <TeamDragProvider>
      <button type="button">Fuera</button>
      <BenchDock label={locale === "es" ? "Banquillo" : "Bench"}>
        <input type="search" aria-label="Buscar persona" />
        <select aria-label="Categoría">
          <option>Todas</option>
        </select>
        <div ref={setSlot} />
        {extra}
      </BenchDock>
      <Portalled into={slot} />
    </TeamDragProvider>
  );
}

function renderDock({ locale = "es", extra }: { locale?: "es" | "en"; extra?: ReactNode } = {}) {
  return renderWithIntl(<Page locale={locale} extra={extra} />, { locale });
}

const dock = () => screen.getByRole("complementary", { name: "Banquillo" });
const handle = () => screen.getByRole("button", { name: /el banquillo$/ });
const search = () => screen.getByRole("searchbox", { name: "Buscar persona" });
/** Whether it may rise on hover and on the keyboard's focus, or is held folded. */
const rises = () => dock().classList.contains("hover:h-72");

describe("BenchDock", () => {
  it("is a named region the keyboard can reach and scroll, docked from lg only", () => {
    renderDock();

    expect(dock()).toHaveAttribute("tabindex", "0");
    expect(dock()).toHaveClass("hidden", "lg:block");
    expect(search()).toBeInTheDocument();
  });

  it("starts folded, clipped to its row, with a handle that raises it", () => {
    renderDock();

    expect(handle()).toHaveAccessibleName("Subir el banquillo");
    expect(handle()).toHaveAttribute("title", "Subir el banquillo");
    expect(handle()).toHaveAttribute("aria-expanded", "false");
    expect(dock()).not.toHaveAttribute("data-tall");
    // Only its row peeks out, not scrolled; it rises on hover and on the keyboard's focus.
    expect(dock()).toHaveClass("h-14", "overflow-clip", "hover:h-72", "has-[:focus-visible]:h-72");
  });

  it("keeps the handle on top while the bench scrolls, and shows it to the region's focus", () => {
    renderDock();

    expect(handle().parentElement).toHaveClass("sticky", "top-0");
    expect(handle()).toHaveClass("group-focus-visible/dock:opacity-100");
  });

  it("raises it to three quarters of the team with the handle, and lowers it again", async () => {
    const user = userEvent.setup();
    renderDock();

    await user.click(handle());
    expect(handle()).toHaveAccessibleName("Bajar el banquillo");
    expect(handle()).toHaveAttribute("title", "Bajar el banquillo");
    expect(handle()).toHaveAttribute("aria-expanded", "true");
    expect(dock()).toHaveAttribute("data-tall");
    expect(dock()).toHaveClass("h-3/4", "overflow-y-auto");

    await user.click(handle());
    expect(handle()).toHaveAccessibleName("Subir el banquillo");
    expect(handle()).toHaveAttribute("aria-expanded", "false");
    expect(dock()).not.toHaveClass("h-3/4");
  });

  it("lowers a raised bench with Escape, folds it, and moves the focus to its handle", async () => {
    const user = userEvent.setup();
    renderDock();

    await user.click(handle());
    await user.click(search());
    await user.keyboard("{Escape}");

    expect(handle()).toHaveAttribute("aria-expanded", "false");
    expect(handle()).toHaveFocus();
    expect(rises()).toBe(false);
  });

  it("lowers a raised bench with Escape from «Añadir al equipo…», drawn there from elsewhere", async () => {
    const user = userEvent.setup();
    renderDock();

    await user.click(handle());
    screen.getByRole("button", { name: "Añadir al equipo…" }).focus();
    await user.keyboard("{Escape}");

    expect(handle()).toHaveAttribute("aria-expanded", "false");
    expect(handle()).toHaveFocus();
  });

  it("folds a bench the focus raised with Escape, and leaves the focus where it is", async () => {
    const user = userEvent.setup();
    renderDock();

    await user.click(search());
    await user.keyboard("{Escape}");

    expect(rises()).toBe(false);
    expect(dock()).toHaveClass("h-14");
    expect(search()).toHaveFocus();
    expect(handle()).toHaveAttribute("aria-expanded", "false");

    // It rises again once the focus moves on.
    await user.tab();
    expect(screen.getByRole("combobox", { name: "Categoría" })).toHaveFocus();
    expect(rises()).toBe(true);
  });

  it("keeps a bench folded by Escape while the focus stays in it, though the pointer leaves", async () => {
    const user = userEvent.setup();
    renderDock();

    await user.click(search());
    await user.keyboard("{Escape}");
    fireEvent.pointerLeave(dock());
    expect(rises()).toBe(false);

    // The focus leaving ends it too.
    act(() => screen.getByRole("button", { name: "Fuera" }).focus());
    expect(rises()).toBe(true);
  });

  it("leaves an Escape something inside already used, as a menu closing", async () => {
    const user = userEvent.setup();
    renderDock();

    await user.click(handle());
    search().addEventListener("keydown", (event) => event.preventDefault());
    search().focus();
    fireEvent.keyDown(search(), { key: "Escape" });

    expect(handle()).toHaveAttribute("aria-expanded", "true");
    expect(search()).toHaveFocus();
  });

  it("leaves an Escape from outside the bench alone", async () => {
    const user = userEvent.setup();
    renderDock();

    await user.click(handle());
    const outside = screen.getByRole("button", { name: "Fuera" });
    outside.focus();
    await user.keyboard("{Escape}");

    expect(handle()).toHaveAttribute("aria-expanded", "true");
    expect(outside).toHaveFocus();
  });

  it("folds to its row while a drag goes on, so the whole canvas takes the drop", async () => {
    const user = userEvent.setup();
    // jsdom lays nothing out: the pointer is over nothing.
    document.elementFromPoint = () => null;
    renderDock({ extra: <Grip /> });
    await user.click(handle());

    const pointer = { pointerId: 1, isPrimary: true, button: 0, pointerType: "mouse" };
    fireEvent.pointerDown(screen.getByRole("button", { name: "Persona 1" }), {
      ...pointer,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(window, { ...pointer, clientX: 40, clientY: 40 });

    expect(dock()).not.toHaveClass("h-3/4");
    expect(dock()).toHaveClass("h-14", "overflow-clip");
    expect(rises()).toBe(false);
    // The handle still says it is up: the bench goes back once the drag ends.
    expect(handle()).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerUp(window, { ...pointer, clientX: 40, clientY: 40 });
    expect(dock()).toHaveClass("h-3/4");
  });

  it("names its handle in English", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Page locale="en" />, { locale: "en" });

    const raise = screen.getByRole("button", { name: "Raise the bench" });
    await user.click(raise);
    expect(screen.getByRole("button", { name: "Lower the bench" })).toBeInTheDocument();
  });
});
