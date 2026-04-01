import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, PermissionMode } from "@gsd/pi-coding-agent";
import { getPermissionMode, isToolCallEventType, setPermissionMode } from "@gsd/pi-coding-agent";

const PLAN_ENTRY_TYPE = "plan-mode-state";
const PLAN_APPROVAL_QUESTION_ID = "plan_mode_approval";
const PLAN_DIR_RE = /(^|[/\\])\.(?:lsd|gsd)[/\\]plan([/\\]|$)/;
const BASH_READ_ONLY_RE = /^\s*(cat|head|tail|less|more|wc|file|stat|du|df|which|type|echo|printf|ls|find|grep|rg|awk|sed\b(?!.*-i)|sort|uniq|diff|comm|tr|cut|tee\s+-a\s+\/dev\/null|git\s+(log|show|diff|status|branch|tag|remote|rev-parse|ls-files|blame|shortlog|describe|stash\s+list|config\s+--get|cat-file)|gh\s+(issue|pr|api|repo|release)\s+(view|list|diff|status|checks)|mkdir\s+-p\s+\.(?:lsd|gsd)(?:[\\/]+plan)?|rtk\s)/;
const SAFE_TOOLS = new Set([
  "read",
  "grep",
  "find",
  "ls",
  "glob",
  "lsp",
  "ask_user_questions",
  "resolve_library",
  "get_library_docs",
  "search-the-web",
  "fetch_page",
  "search_and_read",
  "google_search",
  "mcp_servers",
  "mcp_discover",
]);
const BLOCKED_TOOLS = new Set([
  "async_bash",
  "bg_shell",
  "browser_navigate",
  "browser_go_back",
  "browser_go_forward",
  "browser_reload",
  "browser_click",
  "browser_drag",
  "browser_type",
  "browser_upload_file",
  "browser_scroll",
  "browser_hover",
  "browser_key_press",
  "browser_select_option",
  "browser_set_checked",
  "browser_set_viewport",
  "browser_click_ref",
  "browser_hover_ref",
  "browser_fill_ref",
  "browser_act",
  "browser_batch",
  "browser_fill_form",
  "browser_mock_route",
  "browser_block_urls",
  "browser_clear_routes",
  "browser_emulate_device",
  "browser_save_state",
  "browser_restore_state",
  "browser_generate_test",
  "browser_verify",
  "write",
  "edit",
]);

type PlanApprovalStatus = "pending" | "approved" | "revising" | "cancelled";
type RestorablePermissionMode = Exclude<PermissionMode, "plan">;

interface PlanModeState {
  active: boolean;
  task: string;
  latestPlanPath?: string;
  approvalStatus: PlanApprovalStatus;
  previousMode?: RestorablePermissionMode;
}

let state: PlanModeState = {
  active: false,
  task: "",
  approvalStatus: "cancelled",
};
let startedFromFlag = false;

function isPlanModeActive(): boolean {
  return getPermissionMode() === "plan";
}

function saveState(pi: ExtensionAPI): void {
  pi.appendEntry<PlanModeState>(PLAN_ENTRY_TYPE, { ...state });
}

function setState(pi: ExtensionAPI, next: PlanModeState): void {
  state = next;
  saveState(pi);
}

function clearState(pi: ExtensionAPI): void {
  state = {
    active: false,
    task: "",
    latestPlanPath: undefined,
    approvalStatus: "cancelled",
    previousMode: undefined,
  };
  saveState(pi);
}

function ensurePlanDir(): string {
  const dir = join(process.cwd(), ".lsd", "plan");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function restoreStateFromSession(ctx: ExtensionCommandContext | any): void {
  try {
    const entries = ctx.sessionManager.getEntries();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type === "custom" && entry.customType === PLAN_ENTRY_TYPE && entry.data) {
        state = entry.data as PlanModeState;
        return;
      }
    }
  } catch {
    // Best-effort restore only.
  }
}

function enablePlanMode(
  pi: ExtensionAPI,
  next: Partial<Pick<PlanModeState, "task" | "latestPlanPath" | "approvalStatus" | "previousMode">> = {},
): void {
  const currentMode = getPermissionMode();
  const previousMode: RestorablePermissionMode = currentMode === "plan"
    ? (state.previousMode ?? "accept-on-edit")
    : currentMode;

  setPermissionMode("plan");
  process.env.LUCENT_CODE_PERMISSION_MODE = "plan";
  setState(pi, {
    active: true,
    task: next.task ?? state.task,
    latestPlanPath: next.latestPlanPath ?? state.latestPlanPath,
    approvalStatus: next.approvalStatus ?? state.approvalStatus ?? "pending",
    previousMode: next.previousMode ?? previousMode,
  });
}

function disablePlanMode(pi: ExtensionAPI, approvalStatus: PlanApprovalStatus, clearTask = false): RestorablePermissionMode {
  const restoreMode = state.previousMode ?? "accept-on-edit";
  setPermissionMode(restoreMode);
  process.env.LUCENT_CODE_PERMISSION_MODE = restoreMode;
  setState(pi, {
    active: false,
    task: clearTask ? "" : state.task,
    latestPlanPath: state.latestPlanPath,
    approvalStatus,
    previousMode: restoreMode,
  });
  return restoreMode;
}

function buildPlanModeSystemPrompt(): string {
  const details: string[] = [
    "You are currently in plan mode.",
    "Investigate, clarify scope, and produce a persisted execution plan before making source changes.",
    "Do not modify source files or run side-effect commands while plan mode is active.",
    "Persist plan artifacts under .lsd/plan/.",
  ];
  if (state.task) details.push(`Current task: ${state.task}`);
  if (state.latestPlanPath) details.push(`Latest plan artifact: ${state.latestPlanPath}`);
  return details.join(" ");
}

export default function planCommand(pi: ExtensionAPI) {
  pi.registerFlag("plan", {
    description: "Start the session in plan mode and require a persisted .lsd/plan markdown plan before execution",
    type: "boolean",
  });

  pi.on("session_start", async (_event, ctx) => {
    restoreStateFromSession(ctx);
    startedFromFlag = false;
    if (state.active) {
      setPermissionMode("plan");
      process.env.LUCENT_CODE_PERMISSION_MODE = "plan";
    }
  });

  pi.on("before_agent_start", async () => {
    if (!isPlanModeActive()) return;
    return {
      systemPrompt: buildPlanModeSystemPrompt(),
    };
  });

  pi.on("input", async (event) => {
    const planFlag = pi.getFlag("plan");
    if (startedFromFlag || planFlag !== true || event.source !== "interactive") {
      return { action: "continue" as const };
    }

    startedFromFlag = true;
    ensurePlanDir();
    enablePlanMode(pi, {
      task: event.text.trim(),
      approvalStatus: "pending",
    });

    return { action: "continue" as const };
  });

  pi.on("tool_call", async (event) => {
    if (!isPlanModeActive()) return;

    if (SAFE_TOOLS.has(event.toolName)) return;

    if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
      if (PLAN_DIR_RE.test(event.input.path)) return;
      return {
        block: true,
        reason: `Plan mode is active. You may only write plan artifacts under .lsd/plan/ until the plan is approved. Blocked path: ${event.input.path}`,
      };
    }

    if (isToolCallEventType("bash", event)) {
      if (BASH_READ_ONLY_RE.test(event.input.command)) return;
      return {
        block: true,
        reason: "Plan mode is active. Only read-only investigative bash commands are allowed until plan mode is exited.",
      };
    }

    if (BLOCKED_TOOLS.has(event.toolName)) {
      return {
        block: true,
        reason: `Plan mode is active. Tool ${event.toolName} is blocked until plan mode is exited.`,
      };
    }
  });

  pi.on("tool_result", async (event) => {
    if (event.toolName === "write" || event.toolName === "edit") {
      const input = event.input as { path?: string } | undefined;
      const path = input?.path;
      if (path && PLAN_DIR_RE.test(path)) {
        setState(pi, {
          ...state,
          latestPlanPath: path,
          approvalStatus: state.approvalStatus === "revising" ? "pending" : state.approvalStatus,
        });
      }
      return;
    }

    if (!isPlanModeActive() || event.toolName !== "ask_user_questions") return;

    const details = event.details as {
      cancelled?: boolean;
      response?: { answers?: Record<string, { selected: string | string[]; notes?: string }> };
    } | undefined;
    if (details?.cancelled || !details?.response?.answers) return;

    const answer = details.response.answers[PLAN_APPROVAL_QUESTION_ID];
    if (!answer) return;

    const selected = Array.isArray(answer.selected) ? answer.selected[0] : answer.selected;
    if (typeof selected !== "string") return;

    if (selected.includes("Approve plan")) {
      disablePlanMode(pi, "approved");
      return;
    }

    if (selected.includes("Revise plan")) {
      enablePlanMode(pi, { approvalStatus: "revising" });
      return;
    }

    if (selected.includes("Cancel")) {
      disablePlanMode(pi, "cancelled", true);
      clearState(pi);
    }
  });

  pi.registerCommand("plan", {
    description: "Toggle plan mode. While active, only investigative tools and writes under .lsd/plan/ are allowed",
    async handler(args: string, ctx: ExtensionCommandContext) {
      if (isPlanModeActive()) {
        disablePlanMode(pi, "cancelled");
        ctx.ui.notify("Plan mode disabled.", "info");
        return;
      }

      ensurePlanDir();
      const task = args.trim();
      enablePlanMode(pi, {
        task,
        approvalStatus: "pending",
      });
      ctx.ui.notify(
        task
          ? `Plan mode enabled. Current task: ${task}`
          : "Plan mode enabled. Investigation is allowed; source changes stay blocked until you exit plan mode.",
        "info",
      );
    },
  });

  pi.registerCommand("execute", {
    description: "Exit plan mode after review and allow execution to proceed",
    async handler(_args: string, ctx: ExtensionCommandContext) {
      if (!isPlanModeActive()) {
        ctx.ui.notify("Plan mode is not active.", "info");
        return;
      }
      const restoreMode = disablePlanMode(pi, "approved");
      ctx.ui.notify(`Plan mode disabled. Permission mode restored to ${restoreMode}.`, "info");
    },
  });

  pi.registerCommand("cancel-plan", {
    description: "Cancel the current plan-mode session without executing",
    async handler(_args: string, ctx: ExtensionCommandContext) {
      if (isPlanModeActive()) {
        disablePlanMode(pi, "cancelled", true);
      }
      clearState(pi);
      ctx.ui.notify("Plan mode cancelled.", "info");
    },
  });
}
