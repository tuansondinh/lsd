import test from 'node:test'
import assert from 'node:assert/strict'
import { SandboxManager } from '@gsd/pi-coding-agent'

type SandboxSettings = {
  enabled?: boolean
  autoAllowBashIfSandboxed?: boolean
  writableRoots?: string[]
  readOnlySubpaths?: string[]
  networkEnabled?: boolean
  networkMode?: 'allow' | 'ask' | 'deny'
}

function makeManager(settings: SandboxSettings = {}) {
  const settingsManager = {
    getSandboxSettings: () => settings,
  }
  return new SandboxManager(settingsManager as any)
}

function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  const restore = () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }

  try {
    const result = fn()
    if (result && typeof (result as Promise<void>).then === 'function') {
      return (result as Promise<void>).finally(restore)
    }
    restore()
    return result
  } catch (error) {
    restore()
    throw error
  }
}

function withPlatform<T>(platform: NodeJS.Platform, fn: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value: platform })
  try {
    return fn()
  } finally {
    if (descriptor) Object.defineProperty(process, 'platform', descriptor)
  }
}

test('sandbox config defaults enabled on supported platforms', () => {
  withEnv({ PI_NO_SANDBOX: undefined, PI_SANDBOX_NETWORK: undefined }, () => {
    withPlatform('linux', () => {
      const config = makeManager({}).getSandboxConfig()
      assert.equal(config.enabled, true)
      assert.equal(config.networkEnabled, false)
      assert.equal(config.networkMode, 'ask')
      assert.equal(config.autoAllowBashIfSandboxed, true)
    })

    withPlatform('win32', () => {
      const config = makeManager({}).getSandboxConfig()
      assert.equal(config.enabled, false)
    })
  })
})

test('sandbox env overrides disable sandbox and enable network', () => {
  withEnv({ PI_NO_SANDBOX: '1', PI_SANDBOX_NETWORK: '1' }, () => {
    withPlatform('linux', () => {
      const config = makeManager({ enabled: true, networkEnabled: false }).getSandboxConfig()
      assert.equal(config.enabled, false)
      assert.equal(config.networkEnabled, true)
      assert.equal(config.networkMode, 'deny')
    })
  })
})

test('sandbox network mode resolves from settings and env', () => {
  withEnv({ PI_SANDBOX_NETWORK: undefined, PI_SANDBOX_NETWORK_MODE: undefined }, () => {
    withPlatform('linux', () => {
      assert.equal(makeManager({ networkMode: 'allow' }).getSandboxConfig().networkMode, 'allow')
      assert.equal(makeManager({ networkMode: 'deny' }).getSandboxConfig().networkMode, 'deny')
      assert.equal(makeManager({ networkEnabled: true }).getSandboxConfig().networkMode, 'allow')
      assert.equal(makeManager({ networkEnabled: false }).getSandboxConfig().networkMode, 'deny')
    })
  })

  withEnv({ PI_SANDBOX_NETWORK_MODE: 'allow' }, () => {
    withPlatform('linux', () => {
      const config = makeManager({ networkMode: 'deny' }).getSandboxConfig()
      assert.equal(config.networkMode, 'allow')
      assert.equal(config.networkEnabled, true)
    })
  })
})

test('sandbox policy respects env override before permission mode mapping', () => {
  withEnv({ PI_NO_SANDBOX: undefined, PI_SANDBOX: 'none' }, () => {
    const manager = withPlatform('linux', () => makeManager({ enabled: true }))
    assert.equal(manager.getSandboxPolicy('auto'), 'none')
  })

  withEnv({ PI_NO_SANDBOX: undefined, PI_SANDBOX: 'workspace-write' }, () => {
    const manager = withPlatform('linux', () => makeManager({ enabled: true }))
    assert.equal(manager.getSandboxPolicy('plan'), 'workspace-write')
  })
})

test('sandbox install hints are platform specific', () => {
  assert.match(withPlatform('linux', () => makeManager({}).getInstallHint()) ?? '', /bubblewrap|bwrap/i)
  assert.match(withPlatform('darwin', () => makeManager({}).getInstallHint()) ?? '', /sandbox-exec/i)
  assert.match(withPlatform('win32', () => makeManager({}).getInstallHint()) ?? '', /Linux|macOS/)
})
