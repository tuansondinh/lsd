import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import auditCommand from "./audit.js";
import clearCommand from "./clear.js";
import contextCommand from "./context.js";
import planCommand from "./plan.js";
import toolSearchExtension from "./tools.js";

export default function slashCommands(pi: ExtensionAPI) {
    auditCommand(pi);
    clearCommand(pi);
    contextCommand(pi);
    planCommand(pi);
    toolSearchExtension(pi);
}
