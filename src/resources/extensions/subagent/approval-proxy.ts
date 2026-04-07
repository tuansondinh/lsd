import type { ChildProcess } from "node:child_process";
import {
	getFileChangeApprovalHandler,
	getClassifierHandler,
	requestNetworkApproval,
	type NetworkApprovalDecision,
} from "@gsd/pi-coding-agent";

export type SubagentPermissionRequest =
	| {
			type: "approval_request";
			id: string;
			action: "write" | "edit" | "delete" | "move";
			path: string;
			message: string;
	  }
	| {
			type: "classifier_request";
			id: string;
			toolName: string;
			toolCallId: string;
			args: any;
	  }
	| {
			type: "network_approval_request";
			id: string;
			command: string;
			message: string;
	  };

export function isSubagentPermissionRequest(event: any): event is SubagentPermissionRequest {
	return Boolean(
		event &&
			typeof event.id === "string" &&
			((event.type === "approval_request" && typeof event.path === "string" && typeof event.message === "string") ||
				(event.type === "classifier_request" && typeof event.toolName === "string" && typeof event.toolCallId === "string") ||
				(event.type === "network_approval_request" && typeof event.command === "string" && typeof event.message === "string")),
	);
}

/**
 * Handles permission requests from subagent processes.
 *
 * This function forwards approval requests from subagents to the parent session's
 * approval handlers, bypassing the permission mode check. This is important because
 * the subagent has already determined it needs approval (it sent the request),
 * so the parent should always prompt the user regardless of the parent's permission mode.
 */
export async function handleSubagentPermissionRequest(
	event: SubagentPermissionRequest,
	proc: Pick<ChildProcess, "stdin">,
): Promise<boolean> {
	if (event.type === "approval_request") {
		const handler = getFileChangeApprovalHandler();
		let approved = true;

		if (!handler) {
			// No handler configured - deny by default for safety
			approved = false;
		} else {
			try {
				// Call the handler directly, bypassing permission mode check
				const handlerApproved = await handler({
					action: event.action,
					path: event.path,
					message: event.message,
				});
				approved = handlerApproved;
			} catch {
				approved = false;
			}
		}

		if (proc.stdin && !proc.stdin.destroyed) {
			proc.stdin.write(JSON.stringify({ type: "approval_response", id: event.id, approved }) + "\n");
		}
		return true;
	}

	if (event.type === "network_approval_request") {
		// Forward network approval request to the parent session's network approval handler.
		let decision: NetworkApprovalDecision = "deny";

		try {
			decision = await requestNetworkApproval({
				command: event.command,
				message: event.message,
			});
		} catch {
			decision = "deny";
		}

		if (proc.stdin && !proc.stdin.destroyed) {
			proc.stdin.write(JSON.stringify({ type: "network_approval_response", id: event.id, decision }) + "\n");
		}
		return true;
	}

	const classifierHandler = getClassifierHandler();
	let approved = false;

	if (classifierHandler) {
		try {
			approved = await classifierHandler({
				toolName: event.toolName,
				toolCallId: event.toolCallId,
				args: event.args,
			});
		} catch {
			approved = false;
		}
	}

	if (proc.stdin && !proc.stdin.destroyed) {
		proc.stdin.write(JSON.stringify({ type: "classifier_response", id: event.id, approved }) + "\n");
	}
	return true;
}
