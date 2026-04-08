import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DefaultResourceLoader } from "./resource-loader.js";
import { SettingsManager } from "./settings-manager.js";

test("resource loader reads global LSD.md from the app root", async (t) => {
	const tmp = mkdtempSync(join(tmpdir(), "resource-loader-lsd-md-"));
	t.after(() => rmSync(tmp, { recursive: true, force: true }));

	const appRoot = join(tmp, ".lsd");
	const agentDir = join(appRoot, "agent");
	const cwd = join(tmp, "project");
	mkdirSync(agentDir, { recursive: true });
	mkdirSync(cwd, { recursive: true });
	writeFileSync(join(appRoot, "LSD.md"), "# global lsd\n", "utf-8");

	const loader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager: SettingsManager.inMemory(),
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
	});
	await loader.reload();

	const contextFiles = loader.getAgentsFiles().agentsFiles;
	assert.equal(contextFiles.length, 1);
	assert.equal(contextFiles[0]?.path, join(appRoot, "LSD.md"));
	assert.equal(contextFiles[0]?.content, "# global lsd\n");
});

test("resource loader uses project LSD.md before CLAUDE.md or AGENTS.md in the same directory", async (t) => {
	const tmp = mkdtempSync(join(tmpdir(), "resource-loader-lsd-md-"));
	t.after(() => rmSync(tmp, { recursive: true, force: true }));

	const appRoot = join(tmp, ".lsd");
	const agentDir = join(appRoot, "agent");
	const projectRoot = join(tmp, "project");
	const cwd = join(projectRoot, "src", "feature");
	mkdirSync(agentDir, { recursive: true });
	mkdirSync(cwd, { recursive: true });
	writeFileSync(join(projectRoot, "LSD.md"), "# project lsd\n", "utf-8");
	writeFileSync(join(projectRoot, "CLAUDE.md"), "# claude fallback\n", "utf-8");
	writeFileSync(join(projectRoot, "AGENTS.md"), "# agents fallback\n", "utf-8");

	const loader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager: SettingsManager.inMemory(),
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
	});
	await loader.reload();

	const contextFiles = loader.getAgentsFiles().agentsFiles;
	assert.equal(contextFiles.length, 1);
	assert.equal(contextFiles[0]?.path, join(projectRoot, "LSD.md"));
	assert.equal(contextFiles[0]?.content, "# project lsd\n");
});

test("resource loader loads both global and project LSD.md files", async (t) => {
	const tmp = mkdtempSync(join(tmpdir(), "resource-loader-lsd-md-"));
	t.after(() => rmSync(tmp, { recursive: true, force: true }));

	const appRoot = join(tmp, ".lsd");
	const agentDir = join(appRoot, "agent");
	const projectRoot = join(tmp, "project");
	const cwd = join(projectRoot, "src", "feature");
	mkdirSync(agentDir, { recursive: true });
	mkdirSync(cwd, { recursive: true });
	writeFileSync(join(appRoot, "LSD.md"), "# global lsd\n", "utf-8");
	writeFileSync(join(projectRoot, "LSD.md"), "# project lsd\n", "utf-8");

	const loader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager: SettingsManager.inMemory(),
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
	});
	await loader.reload();

	const contextFiles = loader.getAgentsFiles().agentsFiles;
	assert.equal(contextFiles.length, 2);
	assert.equal(contextFiles[0]?.path, join(appRoot, "LSD.md"));
	assert.equal(contextFiles[1]?.path, join(projectRoot, "LSD.md"));
});

test("resource loader falls back to CLAUDE.md when no LSD.md exists", async (t) => {
	const tmp = mkdtempSync(join(tmpdir(), "resource-loader-lsd-md-"));
	t.after(() => rmSync(tmp, { recursive: true, force: true }));

	const appRoot = join(tmp, ".lsd");
	const agentDir = join(appRoot, "agent");
	const projectRoot = join(tmp, "project");
	const cwd = join(projectRoot, "src", "feature");
	mkdirSync(agentDir, { recursive: true });
	mkdirSync(cwd, { recursive: true });
	writeFileSync(join(projectRoot, "CLAUDE.md"), "# claude fallback\n", "utf-8");
	writeFileSync(join(projectRoot, "AGENTS.md"), "# agents fallback\n", "utf-8");

	const loader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager: SettingsManager.inMemory(),
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
	});
	await loader.reload();

	const contextFiles = loader.getAgentsFiles().agentsFiles;
	assert.equal(contextFiles.length, 1);
	assert.equal(contextFiles[0]?.path, join(projectRoot, "CLAUDE.md"));
	assert.equal(contextFiles[0]?.content, "# claude fallback\n");
});
