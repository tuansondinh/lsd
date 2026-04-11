/**
 * Serializes/deserializes extension file paths to a delimiter-separated string
 * so they can be passed via the LSD_BUNDLED_EXTENSIONS env var between loader.ts and cli.ts.
 */

import { delimiter } from "node:path";

export function serializeBundledExtensionPaths(
	paths: readonly string[],
	pathDelimiter = delimiter,
): string {
	return paths.filter(Boolean).join(pathDelimiter);
}

export function parseBundledExtensionPaths(
	value: string | undefined,
	pathDelimiter = delimiter,
): string[] {
	return (value ?? "")
		.split(pathDelimiter)
		.map((segment) => segment.trim())
		.filter(Boolean);
}
