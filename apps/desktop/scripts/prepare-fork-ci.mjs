/** Prepare credential-free unsigned ARM64 builds on GitHub-hosted runners. */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { desktopCiVersion } from './desktop-ci-version.mjs'

/**
 * Select public settings for the fork's unsigned native ARM64 build.
 * @param {NodeJS.Platform} platform Build host platform.
 * @param {string} arch Build host architecture.
 * @returns {{ target: string, windowsSettings?: string }} Target and optional Windows dotenv contents.
 */
export function forkCiSettings(platform, arch) {
  if (arch !== 'arm64' || (platform !== 'win32' && platform !== 'darwin')) {
    throw new Error('Fork packaging requires a native Windows or macOS ARM64 runner')
  }
  if (platform === 'darwin') return { target: 'mac-arm64' }
  return {
    target: 'win-arm64',
    // The reserved .invalid origin cannot serve a mandatory-update policy.
    windowsSettings: 'DSH_DESKTOP_APP_ID=com.deepseek.harness\nDSH_DESKTOP_AUTO_UPDATE_ENV=production\nDSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN=https://mandatory-update.invalid\n',
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  const appRoot = resolve(import.meta.dirname, '..')
  if (!process.env.GITHUB_OUTPUT || !process.env.GITHUB_STEP_SUMMARY) throw new Error('Run this adapter from GitHub Actions')
  const product = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
  const version = desktopCiVersion(process.env, product.version)
  const settings = forkCiSettings(process.platform, process.arch)
  if (settings.windowsSettings !== undefined) writeFileSync(resolve(appRoot, '.env.windows'), settings.windowsSettings, { flag: 'wx' })
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ${settings.target} unsigned installer\n\nVersion: ${version}\n\nCommit: ${process.env.GITHUB_SHA}\n\nDownload the verified installer from this run's Artifacts. Retention: 14 days. No release publication or automatic-update feed.\n`)
}
