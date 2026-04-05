/**
 * Usage Tips Extension
 *
 * Footer usage tips are intentionally disabled. Tips still appear in the
 * regular conversation area, but not inline on the first footer row.
 */

import type { ExtensionAPI } from "@gsd/pi-coding-agent";

const IS_MEMORY_MAINTENANCE_WORKER = process.env.LSD_MEMORY_EXTRACT === "1" || process.env.LSD_MEMORY_DREAM === "1";

export default function usageTipsExtension(_pi: ExtensionAPI) {
    if (IS_MEMORY_MAINTENANCE_WORKER) {
        return;
    }
}
