import { StorageModule } from '@mt/storage';
import { Module } from '@nestjs/common';
import { PROFILE_REPOSITORY } from '@mt/domain';
import { ProfileService } from './profile.service';
import { FileProfileRepository } from './file-profile.repository';

@Module({
  imports: [StorageModule],
  providers: [ProfileService, { provide: PROFILE_REPOSITORY, useClass: FileProfileRepository }],
  exports: [ProfileService],
})
export class ProfilesModule {}
