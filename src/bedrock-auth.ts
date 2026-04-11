/**
 * AWS Bedrock credential handling — encodes/decodes SSO or access-key credentials
 * to JSON for storage in auth.json, and hydrates AWS_* env vars at runtime.
 */

import type { AuthStorage } from '@gsd/pi-coding-agent'

export const BEDROCK_PROVIDER_ID = 'amazon-bedrock'

export type BedrockCredentialInput =
	| {
		authType: 'sso'
		profile: string
		region: string
	}
	| {
		authType: 'access-key'
		accessKeyId: string
		secretAccessKey: string
		region: string
	}

export type BedrockStoredCredential =
	| ({
		version: 1
	} & Extract<BedrockCredentialInput, { authType: 'sso' }>)
	| ({
		version: 1
	} & Extract<BedrockCredentialInput, { authType: 'access-key' }>)

export function encodeBedrockCredential(credential: BedrockCredentialInput): string {
	return JSON.stringify({ version: 1, ...credential } satisfies BedrockStoredCredential)
}

export function decodeBedrockCredential(value: string): BedrockStoredCredential | null {
	try {
		const parsed = JSON.parse(value) as Partial<BedrockStoredCredential> & { version?: unknown }
		if (parsed.version !== 1 || typeof parsed.region !== 'string' || !parsed.region.trim()) {
			return null
		}
		if (parsed.authType === 'sso' && typeof parsed.profile === 'string' && parsed.profile.trim()) {
			return {
				version: 1,
				authType: 'sso',
				profile: parsed.profile.trim(),
				region: parsed.region.trim(),
			}
		}
		if (
			parsed.authType === 'access-key' &&
			typeof parsed.accessKeyId === 'string' &&
			typeof parsed.secretAccessKey === 'string' &&
			parsed.accessKeyId.trim() &&
			parsed.secretAccessKey.trim()
		) {
			return {
				version: 1,
				authType: 'access-key',
				accessKeyId: parsed.accessKeyId.trim(),
				secretAccessKey: parsed.secretAccessKey.trim(),
				region: parsed.region.trim(),
			}
		}
	} catch {
		// Ignore malformed or legacy plain-text values.
	}
	return null
}

function clearBedrockEnv(): void {
	delete process.env.AWS_PROFILE
	delete process.env.AWS_ACCESS_KEY_ID
	delete process.env.AWS_SECRET_ACCESS_KEY
}

export function applyBedrockCredentialToEnv(credential: BedrockStoredCredential): void {
	clearBedrockEnv()
	process.env.AWS_REGION = credential.region
	process.env.AWS_DEFAULT_REGION = credential.region
	if (credential.authType === 'sso') {
		process.env.AWS_PROFILE = credential.profile
		return
	}
	process.env.AWS_ACCESS_KEY_ID = credential.accessKeyId
	process.env.AWS_SECRET_ACCESS_KEY = credential.secretAccessKey
}

export function saveBedrockCredential(
	authStorage: AuthStorage,
	credential: BedrockCredentialInput,
): void {
	const encoded = encodeBedrockCredential(credential)
	authStorage.remove(BEDROCK_PROVIDER_ID)
	authStorage.set(BEDROCK_PROVIDER_ID, { type: 'api_key', key: encoded })
	applyBedrockCredentialToEnv({ version: 1, ...credential })
}
