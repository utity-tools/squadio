import { createHash } from "node:crypto";

// ADR 0011, "The copy": each row's id in a visitor's copy is the UUIDv5 of the template id in the
// namespace of the copy's organization id. The mapping needs no table, so the first save can
// translate changes that name template ids, and a template link can lead to the visitor's copy.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidBytes(uuid: string): Buffer {
  if (!UUID.test(uuid)) throw new TypeError("Expected a UUID");
  return Buffer.from(uuid.replaceAll("-", ""), "hex");
}

/** A name-based UUID (RFC 9562, version 5): SHA-1 of the namespace's bytes and the name. */
export function uuidV5(namespace: string, name: string): string {
  const hash = createHash("sha1").update(uuidBytes(namespace)).update(name, "utf8").digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50; // version 5
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The id a template row takes in the copy whose organization is `copyOrganizationId`. */
export function copyId(templateId: string, copyOrganizationId: string): string {
  uuidBytes(templateId);
  return uuidV5(copyOrganizationId, templateId.toLowerCase());
}
