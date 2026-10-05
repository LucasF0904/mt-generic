import { SecondBrainService } from './second-brain.service';
import { StorageModule } from '@mt/storage';
import { Module } from '@nestjs/common';
import { ProfilesModule } from '@mt/profiles';
import { VaultRoutingService } from './vault-routing.service';
import { NOTE_WRITER } from './note-writer';
import { FsNoteWriter } from './fs-note-writer';

@Module({
  imports: [ProfilesModule, StorageModule],
  providers: [SecondBrainService, VaultRoutingService, { provide: NOTE_WRITER, useClass: FsNoteWriter }],
  exports: [SecondBrainService, VaultRoutingService],
})
export class RoutingModule {}
