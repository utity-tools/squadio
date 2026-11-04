import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSignOut } from "./use-sign-out";

const signOut = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({ authClient: { signOut } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  signOut.mockReset();
  refresh.mockReset();
});

describe("useSignOut", () => {
  it("signs out, then renders the page again without the account", async () => {
    signOut.mockResolvedValue({ data: { success: true }, error: null });
    const { result } = renderHook(() => useSignOut());

    await act(() => result.current.signOut());

    expect(signOut).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(result.current.failed).toBe(false);
  });

  it("is pending while it signs out, and signs out once", async () => {
    signOut.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSignOut());

    act(() => void result.current.signOut());
    await waitFor(() => expect(result.current.pending).toBe(true));
    act(() => void result.current.signOut());

    expect(signOut).toHaveBeenCalledOnce();
  });

  it.each([
    ["the server refuses", () => signOut.mockResolvedValue({ data: null, error: { status: 500 } })],
    ["the request never reaches the server", () => signOut.mockRejectedValue(new TypeError("x"))],
  ])("says it failed and stays signed in when %s", async (_, fail) => {
    fail();
    const { result } = renderHook(() => useSignOut());

    await act(() => result.current.signOut());

    expect(result.current.failed).toBe(true);
    expect(result.current.pending).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
});
