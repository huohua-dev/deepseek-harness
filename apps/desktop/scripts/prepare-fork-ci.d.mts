/** Public settings for credential-free fork packaging. */

/**
 * Select public settings for the fork's unsigned native ARM64 build.
 * @param platform Build host platform.
 * @param arch Build host architecture.
 * @returns Target and optional Windows dotenv contents.
 */
export function forkCiSettings(platform: NodeJS.Platform, arch: string): { target: string; windowsSettings?: string }
