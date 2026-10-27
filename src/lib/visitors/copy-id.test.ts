// @vitest-environment node
// ADR 0011, "The copy": ids in a visitor's copy are the UUIDv5 of the template's ids.
import { describe, expect, it } from "vitest";

import { copyId, uuidV5 } from "./copy-id";

const TEMPLATE_ID = "6d656d6f-0000-4000-8000-000000000200";
const COPY_ORGANIZATION = "0b0e6c1a-5d2f-4c3e-9a8b-7f6e5d4c3b2a";

describe("uuidV5", () => {
  it("matches RFC 9562's example for www.example.com in the DNS namespace", () => {
    expect(uuidV5("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "www.example.com")).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    );
  });
});

describe("copyId", () => {
  it("is the same for the same template id and copy", () => {
    expect(copyId(TEMPLATE_ID, COPY_ORGANIZATION)).toBe(copyId(TEMPLATE_ID, COPY_ORGANIZATION));
  });

  it("differs per copy and per template id", () => {
    const other = "0b0e6c1a-5d2f-4c3e-9a8b-7f6e5d4c3b2b";
    expect(copyId(TEMPLATE_ID, other)).not.toBe(copyId(TEMPLATE_ID, COPY_ORGANIZATION));
    expect(copyId("6d656d6f-0000-4000-8000-000000000201", COPY_ORGANIZATION)).not.toBe(
      copyId(TEMPLATE_ID, COPY_ORGANIZATION),
    );
  });

  it("is a version 5 UUID with the RFC variant", () => {
    expect(copyId(TEMPLATE_ID, COPY_ORGANIZATION)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("ignores the case of either id", () => {
    expect(copyId(TEMPLATE_ID.toUpperCase(), COPY_ORGANIZATION.toUpperCase())).toBe(
      copyId(TEMPLATE_ID, COPY_ORGANIZATION),
    );
  });

  it("refuses ids that are not UUIDs", () => {
    expect(() => copyId("seat-1", COPY_ORGANIZATION)).toThrow(TypeError);
    expect(() => copyId(TEMPLATE_ID, "")).toThrow(TypeError);
  });
});
