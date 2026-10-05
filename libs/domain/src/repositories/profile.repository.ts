import { Profile } from '../entities/profile.entity';

export interface ProfileRepository {
  listAvailableProfiles(additionalDirectories?: string[]): Promise<Profile[]>;
}

export const PROFILE_REPOSITORY = Symbol('PROFILE_REPOSITORY');
