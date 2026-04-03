/**
 * cancel_job tool — cancel a running background job.
 */

import type { ToolDefinition } from "@gsd/pi-coding-agent";
import { Text } from "@gsd/pi-tui";
import { Type } from "@sinclair/typebox";
import type { AsyncJobManager } from "./job-manager.js";

const schema = Type.Object({
	job_id: Type.String({ description: "The background job ID to cancel (e.g. bg_a1b2c3d4)" }),
});

export function createCancelJobTool(getManager: () => AsyncJobManager): ToolDefinition<typeof schema> {
	return {
		name: "cancel_job",
		label: "Cancel Background Job",
		description: "Cancel a running background job by its ID.",
		parameters: schema,
		renderCall(args, theme, options) {
			const indicator = options?.statusIndicator ? `${options.statusIndicator} ` : "";
			let text = indicator + theme.fg("toolTitle", theme.bold("cancel_job "));
			text += theme.fg("accent", args.job_id);
			return new Text(text, 0, 0);
		},

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const manager = getManager();
			const result = manager.cancel(params.job_id);

			const messages: Record<string, string> = {
				cancelled: `Job ${params.job_id} has been cancelled.`,
				not_found: `Job ${params.job_id} not found.`,
				already_completed: `Job ${params.job_id} has already completed (or failed/cancelled).`,
			};

			return {
				content: [{ type: "text", text: messages[result] ?? `Unknown result: ${result}` }],
				details: undefined,
			};
		},
	};
}
