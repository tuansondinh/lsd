/**
 * LLM provider registry and onboarding wizard helpers — lists available providers,
 * presents picker options for browser vs API-key auth flows, and decides whether
 * the first-run onboarding should trigger.
 */

import type { AuthStorage } from '@gsd/pi-coding-agent'
import { BEDROCK_PROVIDER_ID } from './bedrock-auth.js'

export { BEDROCK_PROVIDER_ID } from './bedrock-auth.js'

export type LlmProviderOption = { value: string; label: string; hint?: string }

export const LLM_PROVIDER_IDS = [
	'anthropic',
	'anthropic-vertex',
	'openai',
	'github-copilot',
	'openai-codex',
	'google-gemini-cli',
	'google-antigravity',
	'google',
	'groq',
	'xai',
	'openrouter',
	'mistral',
	'ollama-cloud',
	'custom-openai',
	BEDROCK_PROVIDER_ID,
]

const OTHER_PROVIDERS = [
	{ value: 'google', label: 'Google (Gemini)' },
	{ value: 'groq', label: 'Groq' },
	{ value: 'xai', label: 'xAI (Grok)' },
	{ value: 'openrouter', label: 'OpenRouter' },
	{ value: 'mistral', label: 'Mistral' },
	{ value: 'ollama-cloud', label: 'Ollama Cloud' },
	{ value: 'custom-openai', label: 'Custom (OpenAI-compatible)' },
] as const

export const BUDGET_MODEL_OPTIONS = [
	{ value: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5', hint: 'recommended for scout/subagents' },
	{ value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', hint: 'fast and cheap' },
	{ value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', hint: 'newer flash option' },
	{ value: 'openai/gpt-4.1-mini', label: 'GPT-4.1 mini', hint: 'small general-purpose option' },
	{ value: 'openai/gpt-5.4-mini', label: 'GPT-5.4 mini', hint: 'fast and cheap — OpenAI' },
]

export function getOtherLlmProviders() {
	return [...OTHER_PROVIDERS]
}

export function getLlmProviderOptions(method: 'browser' | 'api-key'): LlmProviderOption[] {
	if (method === 'browser') {
		return [
			{ value: 'anthropic', label: 'Anthropic (Claude)', hint: 'recommended' },
			{ value: 'github-copilot', label: 'GitHub Copilot' },
			{ value: 'openai-codex', label: 'ChatGPT Plus/Pro (Codex)' },
			{ value: BEDROCK_PROVIDER_ID, label: 'AWS SSO Login', hint: 'Amazon Bedrock via aws sso login' },
			{ value: 'google-gemini-cli', label: 'Google Gemini CLI' },
			{ value: 'google-antigravity', label: 'Antigravity (Gemini 3, Claude, GPT-OSS)' },
		]
	}

	return [
		{ value: 'anthropic', label: 'Anthropic (Claude)' },
		{ value: 'openai', label: 'OpenAI' },
		{ value: BEDROCK_PROVIDER_ID, label: 'Amazon Bedrock', hint: 'AWS access key + region' },
		...OTHER_PROVIDERS.map(op => ({ value: op.value, label: op.label })),
	]
}

export function shouldRunOnboarding(authStorage: AuthStorage, settingsDefaultProvider?: string): boolean {
	if (!process.stdin.isTTY) return false
	if (settingsDefaultProvider) return false
	const hasLlmAuth = LLM_PROVIDER_IDS.some(id => authStorage.hasAuth(id))
	return !hasLlmAuth
}
