import { Module } from '@nestjs/common';
import { MACHINE_CONFIG_REPOSITORY } from '@mt/domain';
import { CURRENT_PLATFORM, PlatformModule, SupportedPlatform } from '@mt/platform';
import { StorageService } from './storage.service';
import { DISK_SPACE_ADAPTER, DiskSpaceAdapter } from './disk-space.adapter';
import { WindowsDiskSpaceAdapter } from './windows-disk-space.adapter';
import { PosixDiskSpaceAdapter } from './posix-disk-space.adapter';
import { MachineConfigFileRepository } from './machine-config-file.repository';

@Module({
  imports: [PlatformModule],
  providers: [
    StorageService,
    {
      provide: DISK_SPACE_ADAPTER,
      useFactory: (platform: SupportedPlatform): DiskSpaceAdapter =>
        platform === 'windows' ? new WindowsDiskSpaceAdapter() : new PosixDiskSpaceAdapter(),
      inject: [CURRENT_PLATFORM],
    },
    { provide: MACHINE_CONFIG_REPOSITORY, useClass: MachineConfigFileRepository },
  ],
  exports: [StorageService],
})
export class StorageModule {}
