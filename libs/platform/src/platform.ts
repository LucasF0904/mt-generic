export type SupportedPlatform = 'windows' | 'macos';

/** DI token carrying the resolved {@link SupportedPlatform} for the running host. */
export const CURRENT_PLATFORM = Symbol('CURRENT_PLATFORM');

/**
 * Maps a Node `process.platform` value onto the OS families mt supports.
 *
 * Anything other than Windows or macOS throws here, so an unsupported host fails
 * loudly at startup (the DI factory in {@link PlatformModule} runs during
 * bootstrap) instead of much later, mid-command, against an OS-specific adapter.
 */
export function detectPlatform(nodePlatform: NodeJS.Platform = process.platform): SupportedPlatform {
  switch (nodePlatform) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'macos';
    default:
      throw new Error(`mt só roda em Windows e macOS — plataforma "${nodePlatform}" não é suportada.`);
  }
}
