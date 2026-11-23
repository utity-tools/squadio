// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: null as null | { name: string; email: string },
  signUp: true,
  calls: [] as string[],
}));
vi.mock("@/auth/session", () => ({
  currentAccount: async () => {
    mocks.calls.push("request");
    return mocks.account;
  },
  signUpOpen: () => {
    mocks.calls.push("auth variables");
    return mocks.signUp;
  },
}));
vi.mock("./sign-in-to-return", () => ({ SignInToReturnLink: () => null }));

const { SignInToReturn } = await import("./sign-in-to-return-gate");
const { SignInToReturnLink } = await import("./sign-in-to-return");

beforeEach(() => {
  mocks.account = null;
  mocks.signUp = true;
  mocks.calls = [];
});

describe("SignInToReturn", () => {
  it("offers signing in to a signed-out request while accounts are open", async () => {
    expect((await SignInToReturn())?.type).toBe(SignInToReturnLink);
  });

  it("reads the request before the auth variables, which a build does not hold", async () => {
    await SignInToReturn();

    expect(mocks.calls).toEqual(["request", "auth variables"]);
  });

  it("offers nothing to a signed-in account", async () => {
    mocks.account = { name: "Ada Synthetic", email: "ada@squadio.example" };

    expect(await SignInToReturn()).toBeNull();
  });

  it("offers nothing while sign-up is closed, as the account corner does", async () => {
    mocks.signUp = false;

    expect(await SignInToReturn()).toBeNull();
  });
});
