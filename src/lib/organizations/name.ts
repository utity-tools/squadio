import { z } from "zod";

/** The longest organization name, as long as any other name people read (src/db/schema.ts). */
export const MAX_ORGANIZATION_NAME = 100;

/**
 * An organization's name as someone types it: surrounding spaces are dropped, and it must keep at
 * least one character and at most MAX_ORGANIZATION_NAME.
 */
export const organizationNameSchema = z
  .string()
  .trim()
  .min(1, { error: "blank" })
  .max(MAX_ORGANIZATION_NAME, { error: "too-long" });
