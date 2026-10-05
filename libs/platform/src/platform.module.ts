import { Module } from '@nestjs/common';
import { CURRENT_PLATFORM, detectPlatform } from './platform';

/**
 * Provides {@link CURRENT_PLATFORM}. The factory runs during Nest bootstrap, so
 * an unsupported OS is rejected before any command executes.
 */
@Module({
  providers: [{ provide: CURRENT_PLATFORM, useFactory: () => detectPlatform() }],
  exports: [CURRENT_PLATFORM],
})
export class PlatformModule {}
