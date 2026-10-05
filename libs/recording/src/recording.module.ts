import { RecordingLibraryService } from './recording-library.service';
import { Module } from '@nestjs/common';
import { SESSION_REPOSITORY } from '@mt/domain';
import { RecordingService } from './recording.service';
import { SessionFileRepository } from './session-file.repository';
import { INPUT_LOGGER } from './input-logger';
import { UiohookInputLogger } from './uiohook-input-logger.adapter';

@Module({
  providers: [RecordingLibraryService,
    RecordingService,
    { provide: SESSION_REPOSITORY, useClass: SessionFileRepository },
    // useFactory, not useClass: the constructor's params are plain strings
    // (default to require.resolve(...)) rather than injectable tokens, and
    // useClass would make Nest try (and fail) to resolve them as DI deps.
    { provide: INPUT_LOGGER, useFactory: () => new UiohookInputLogger() },
  ],
  exports: [RecordingService, RecordingLibraryService],
})
export class RecordingModule {}
