import test from 'node:test'
import assert from 'node:assert/strict'
import { AuthStorage } from '@gsd/pi-coding-agent'

import {
	BEDROCK_PROVIDER_ID,
	BUDGET_MODEL_OPTIONS,
	LLM_PROVIDER_IDS,
	getLlmProviderOptions,
	shouldRunOnboarding,
} from '../onboarding-llm.js'
import { saveBedrockCredential } from '../bedrock-auth.js'
import { loadStoredEnvKeys } from '../wizard.js'

function withMockTty(value: boolean, fn: () => void): void {
	const descriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
	Object.defineProperty(process.stdin, 'isTTY', {
		configurable: true,
		value,
	})
	try {
		fn()
	} finally {
		if (descriptor) {
			Object.defineProperty(process.stdin, 'isTTY', descriptor)
		}
	}
}

function withCleanAwsEnv(fn: () => void): void {
	const previous = {
		AWS_PROFILE: process.env.AWS_PROFILE,
		AWS_REGION: process.env.AWS_REGION,
		AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
		AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
		AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
	}
	delete process.env.AWS_PROFILE
	delete process.env.AWS_REGION
	delete process.env.AWS_DEFAULT_REGION
	delete process.env.AWS_ACCESS_KEY_ID
	delete process.env.AWS_SECRET_ACCESS_KEY
	try {
		fn()
	} finally {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}
}

test('onboarding exposes Bedrock in both browser and API-key provider options', () => {
	const browserOptions = getLlmProviderOptions('browser')
	const apiKeyOptions = getLlmProviderOptions('api-key')

	assert.ok(browserOptions.some(option => option.value === BEDROCK_PROVIDER_ID && option.label === 'AWS SSO Login'))
	assert.ok(apiKeyOptions.some(option => option.value === BEDROCK_PROVIDER_ID && option.label === 'Amazon Bedrock'))
})

test('Bedrock provider ID is recognized for onboarding skip logic and budget models include gpt-5.4-mini', () => {
	assert.ok(LLM_PROVIDER_IDS.includes(BEDROCK_PROVIDER_ID))
	assert.ok(BUDGET_MODEL_OPTIONS.some(option => option.value === 'openai/gpt-5.4-mini'))

	const authStorage = AuthStorage.inMemory()
	saveBedrockCredential(authStorage, {
		authType: 'sso',
		profile: 'work',
		region: 'us-west-2',
	})

	withMockTty(true, () => {
		assert.equal(shouldRunOnboarding(authStorage), false)
	})
})

test('loading stored Bedrock API-key credentials hydrates AWS env vars including region', () => {
	const authStorage = AuthStorage.inMemory()

	saveBedrockCredential(authStorage, {
		authType: 'access-key',
		accessKeyId: 'AKIA_TEST_KEY',
		secretAccessKey: 'secret-test-value',
		region: 'eu-west-1',
	})

	withCleanAwsEnv(() => {
		loadStoredEnvKeys(authStorage)
		assert.equal(process.env.AWS_ACCESS_KEY_ID, 'AKIA_TEST_KEY')
		assert.equal(process.env.AWS_SECRET_ACCESS_KEY, 'secret-test-value')
		assert.equal(process.env.AWS_REGION, 'eu-west-1')
		assert.equal(process.env.AWS_DEFAULT_REGION, 'eu-west-1')
		assert.equal(process.env.AWS_PROFILE, undefined)
	})
})

test('loading stored Bedrock SSO credentials hydrates AWS profile and region', () => {
	const authStorage = AuthStorage.inMemory()

	saveBedrockCredential(authStorage, {
		authType: 'sso',
		profile: 'sandbox',
		region: 'ap-southeast-1',
	})

	withCleanAwsEnv(() => {
		loadStoredEnvKeys(authStorage)
		assert.equal(process.env.AWS_PROFILE, 'sandbox')
		assert.equal(process.env.AWS_REGION, 'ap-southeast-1')
		assert.equal(process.env.AWS_DEFAULT_REGION, 'ap-southeast-1')
		assert.equal(process.env.AWS_ACCESS_KEY_ID, undefined)
		assert.equal(process.env.AWS_SECRET_ACCESS_KEY, undefined)
	})
})
