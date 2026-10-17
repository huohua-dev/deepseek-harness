import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'
import { forkCiSettings } from '../scripts/prepare-fork-ci.mjs'
import { validateDesktopPackageEnvironment } from '../scripts/desktop-package-environment.mjs'
import { desktopCiVersion } from '../scripts/desktop-ci-version.mjs'

describe('fork ARM64 packaging', () => {
  it('provides credential-free Windows settings accepted by unsigned packaging', () => {
    const settings = forkCiSettings('win32', 'arm64')
    expect(settings.target).toBe('win-arm64')
    const environment = parseEnv(settings.windowsSettings!)
    expect(environment.DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN).toBe('https://mandatory-update.invalid')
    expect(() => { validateDesktopPackageEnvironment(environment, { platform: 'win32', arch: 'arm64' }, { unsigned: true }) }).not.toThrow()
  })

  it('leaves unsigned macOS builds configuration-free', () => {
    expect(forkCiSettings('darwin', 'arm64')).toEqual({ target: 'mac-arm64' })
  })

  it('rejects hosts that cannot execute the selected native runtime', () => {
    expect(() => forkCiSettings('linux', 'arm64')).toThrow(/native Windows or macOS ARM64/u)
    expect(() => forkCiSettings('win32', 'x64')).toThrow(/native Windows or macOS ARM64/u)
    expect(() => forkCiSettings('darwin', 'x64')).toThrow(/native Windows or macOS ARM64/u)
  })

  it('uses the same deterministic CI version for both platforms', () => {
    expect(desktopCiVersion({ PACKAGE_BUILD_VERSION: 'auto', GITHUB_RUN_NUMBER: '1', GITHUB_RUN_ATTEMPT: '1' }, '0.2.1-alpha.5', new Date('2026-10-17T00:00:00Z')))
      .toBe('0.2.1-alpha.5.20261017.1.1')
  })

  it('builds both native targets on master pushes without publishing credentials', () => {
    const workflow = load(readFileSync(new URL('../../../.github/workflows/desktop-arm64-package.yml', import.meta.url), 'utf8')) as {
      on: { push: { branches: string[] }; workflow_dispatch: { inputs: { build_version: { default: string } } } }
      permissions: Record<string, string>
      jobs: { package: { if: string; strategy: { 'fail-fast': boolean; matrix: { include: object[] } } } }
    }
    expect(workflow.on.push.branches).toEqual(['master'])
    expect(workflow.on.workflow_dispatch.inputs.build_version.default).toBe('auto')
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.jobs.package.if).toBe("github.repository == 'huohua-dev/deepseek-harness'")
    expect(workflow.jobs.package.strategy['fail-fast']).toBe(false)
    expect(workflow.jobs.package.strategy.matrix.include).toEqual([
      { target: 'win-arm64', runner: 'windows-11-arm', shell: 'pwsh', command: 'package:desktop:win:arm64:unsigned', extension: 'exe' },
      { target: 'mac-arm64', runner: 'macos-15', shell: 'bash', command: 'package:desktop:mac:arm64:unsigned', extension: 'dmg' },
    ])
  })
})
