export class Profile {
  constructor(
    public readonly name: string,
    // Undefined when this profile has no segundo-cérebro / vault to route
    // notes into (e.g. Equipe — personal projects have none by design).
    // The profile still shows up so it can be picked when recording; routing
    // falls back to storageRoot/Processed/notes/unrouted/<profile> instead
    // (see VaultRoutingService) rather than this constructor rejecting it.
    public readonly vaultDirectory?: string,
    public readonly notesFolder: string = 'Meetings',
    public readonly memoryFile?: string,
  ) {
    if (!name || name.trim().length === 0) {
      throw new Error('Profile.name must not be empty');
    }
    if (vaultDirectory !== undefined && vaultDirectory.trim().length === 0) {
      throw new Error('Profile.vaultDirectory must not be empty when provided');
    }
  }
}
