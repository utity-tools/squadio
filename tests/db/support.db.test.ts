import { describe, expect, it } from "vitest";

import { localOnly } from "./support";

describe("localOnly", () => {
  it.each([
    "postgres://u:p@127.0.0.1:5434/squadio_test",
    "postgres://u:p@localhost:5434/squadio_test",
    "postgres://u:p@[::1]:5434/squadio_test",
  ])("accepts the local database %s", (url) => {
    expect(localOnly(url, "DATABASE_URL")).toBe(url);
  });

  it.each([
    "postgres://u:p@db.example.com:5432/squadio",
    // pg lets query parameters override the host, so a local-looking URL can still point elsewhere.
    "postgres://u:p@127.0.0.1:5434/squadio_test?host=db.example.com",
    "postgres://u:p@127.0.0.1:5434/squadio_test?hostaddr=192.0.2.10",
    "postgres://u:p@localhost/squadio_test?sslmode=disable&host=%2Fvar%2Frun%2Fpostgresql",
  ])("rejects %s without echoing it", (url) => {
    // The whole message is fixed, so no part of the URL can leak into logs.
    expect(() => localOnly(url, "DATABASE_URL")).toThrow(
      /^Database tests only run against a local database; DATABASE_URL points elsewhere\.$/,
    );
  });
});
