/**
 * Open Measures integration
 * Tools for searching social media data across multiple platforms
 */

import { OpenMeasuresClient } from "open-measures";
import type { Tool } from "../../agent/tools";
import { createOpenMeasuresTools as createTools } from "./simple-tools";

/**
 * Create Open Measures tools with the given API key.
 * Returns an empty array if no API key is provided (fails gracefully).
 */
export function createOpenMeasuresTools(apiKey?: string): Tool[] {
  if (!apiKey) {
    return [];
  }

  try {
    const client = new OpenMeasuresClient({ apiKey });
    return createTools(client);
  } catch (error) {
    console.error("Failed to initialize Open Measures client:", error);
    return [];
  }
}

export { OpenMeasuresClient };
