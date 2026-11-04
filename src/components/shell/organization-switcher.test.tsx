import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { DemoOrganization, OrganizationSwitcher } from "./organization-switcher";
import { ShellPlacement } from "./placement";

const push = vi.fn();

beforeEach(() => {
  push.mockClear();
});

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Design board 14, "Menús de organización y cuenta": the active organization on the left of the
// top bar opens a menu with «Tus organizaciones», a check on the active one, and «Ajustes de la
// organización». A visitor's demo is named, with its «Demo» chip, and opens nothing.

const mine = { id: "0b5c1e1a-0000-4000-8000-000000000001", name: "Mi consultora", example: false };
const adopted = {
  id: "0b5c1e1a-0000-4000-8000-000000000002",
  name: "Consultora Demo",
  example: true,
};

describe("OrganizationSwitcher", () => {
  it("names the active organization and lists the account's, the active one checked", async () => {
    const switchTo = vi.fn().mockResolvedValue({ ok: true });
    renderWithIntl(
      <OrganizationSwitcher
        organizations={[mine, adopted]}
        activeId={mine.id}
        switchTo={switchTo}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Organización: Mi consultora" });
    await userEvent.click(trigger);

    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("group", { name: "Tus organizaciones" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitemradio", { name: /Mi consultora/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const other = within(menu).getByRole("menuitemradio", { name: /Consultora Demo/ });
    expect(other).toHaveAttribute("aria-checked", "false");
    expect(within(other).getByText("Demo")).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Ajustes de la organización" }),
    ).toHaveAttribute("href", "/organization");
  });

  it("switches to the organization chosen, and not to the active one again", async () => {
    const switchTo = vi.fn().mockResolvedValue({ ok: true });
    renderWithIntl(
      <OrganizationSwitcher
        organizations={[mine, adopted]}
        activeId={mine.id}
        switchTo={switchTo}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Organización/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Mi consultora/ }));
    expect(switchTo).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /Organización/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Consultora Demo/ }));
    expect(switchTo).toHaveBeenCalledWith(adopted.id);
    // Then to the organization's page, in the same language: the one it was on may not be its own.
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/organization"));
  });

  it("says so when the switch did not happen", async () => {
    const switchTo = vi.fn().mockResolvedValue({ ok: false });
    renderWithIntl(
      <OrganizationSwitcher
        organizations={[mine, adopted]}
        activeId={mine.id}
        switchTo={switchTo}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Organización/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Consultora Demo/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se ha podido cambiar de organización",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("with one organization lists no others: only its settings", async () => {
    renderWithIntl(
      <OrganizationSwitcher organizations={[adopted]} activeId={adopted.id} switchTo={vi.fn()} />,
    );

    // Its name holds what it shows, the chip included (WCAG 2.5.3, label in name).
    const trigger = screen.getByRole("button", { name: "Organización: Consultora Demo Demo" });
    expect(within(trigger).getByText("Demo")).toBeInTheDocument();
    expect(trigger).not.toHaveAttribute("aria-label");
    await userEvent.click(trigger);

    expect(screen.queryByText("Tus organizaciones")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Ajustes de la organización" })).toBeVisible();
  });

  it("is a 44 px target below lg, its items too", async () => {
    renderWithIntl(
      <OrganizationSwitcher
        organizations={[mine, adopted]}
        activeId={mine.id}
        switchTo={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Organización/ });
    expect(trigger).toHaveClass("max-lg:h-11");
    await userEvent.click(trigger);
    for (const item of [
      ...screen.getAllByRole("menuitemradio"),
      screen.getByRole("menuitem", { name: "Ajustes de la organización" }),
    ]) {
      expect(item).toHaveClass("max-lg:min-h-11");
    }
  });

  it("fills the ☰ menu's width in a 44 px row", () => {
    renderWithIntl(
      <ShellPlacement value="menu">
        <OrganizationSwitcher organizations={[mine]} activeId={mine.id} switchTo={vi.fn()} />
      </ShellPlacement>,
    );

    expect(screen.getByRole("button", { name: /Organización/ })).toHaveClass("min-h-11", "w-full");
  });
});

describe("DemoOrganization", () => {
  it("names the demo with its chip and says its figures are fictitious", () => {
    renderWithIntl(<DemoOrganization copy />);

    expect(screen.getByText("Consultora Demo")).toBeInTheDocument();
    // Not read twice: «Consultora Demo» already says it, and the note says the figures are fictitious.
    expect(screen.getByText("Demo")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Nombres y cifras ficticios · tu copia")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("leaves «tu copia» out before the visitor's first save", () => {
    renderWithIntl(<DemoOrganization copy={false} />);

    expect(screen.getByText("Nombres y cifras ficticios")).toBeInTheDocument();
  });
});
