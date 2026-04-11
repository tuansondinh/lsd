/**
 * Encodes a project directory path into a safe directory name for per-project
 * session storage under ~/.lsd/sessions/ (e.g. "/Users/alice/my-app" → "--Users-alice-my-app--").
 */

import { join } from "node:path"

import { sessionsDir as defaultSessionsDir } from "./app-paths.js"

export function getProjectSessionsDir(cwd: string, baseSessionsDir = defaultSessionsDir): string {
  const safePath = `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`
  return join(baseSessionsDir, safePath)
}
