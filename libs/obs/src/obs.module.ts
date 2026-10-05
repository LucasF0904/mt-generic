import { Module } from '@nestjs/common';
import { CURRENT_PLATFORM, PlatformModule, SupportedPlatform } from '@mt/platform';
import { ObsService } from './obs.service';
import { OBS_CLIENT_ADAPTER } from './obs-client.adapter';
import { ObsWebsocketAdapter } from './obs-websocket.adapter';

@Module({
  imports: [PlatformModule],
  providers: [
    ObsService,
    {
      provide: OBS_CLIENT_ADAPTER,
      useFactory: (platform: SupportedPlatform) => new ObsWebsocketAdapter(platform),
      inject: [CURRENT_PLATFORM],
    },
  ],
  exports: [ObsService],
})
export class ObsModule {}
