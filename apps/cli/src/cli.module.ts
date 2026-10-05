import { CliAssistantService } from './tui/cli-assistant.service';
import { TerminalUiService } from './tui/terminal-ui.service';
import { WorkspaceController } from './tui/workspace-controller';
import { PrepareCommand } from './commands/prepare.command';
import { SettingsCommand } from './commands/settings.command';
import { MenuCommand } from './commands/menu.command';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@mt/platform';
import { StorageModule } from '@mt/storage';
import { SetupModule } from '@mt/setup';
import { ObsModule } from '@mt/obs';
import { ProfilesModule } from '@mt/profiles';
import { RecordingModule } from '@mt/recording';
import { ProcessingModule } from '@mt/processing';
import { SetupCommand } from './commands/setup.command';
import { ConfigureObsCommand } from './commands/configure-obs.command';
import { RecordCommand } from './commands/record.command';
import { ProcessCommand } from './commands/process.command';

@Module({
  imports: [PlatformModule, StorageModule, SetupModule, ObsModule, ProfilesModule, RecordingModule, ProcessingModule],
  providers: [CliAssistantService, TerminalUiService, WorkspaceController, PrepareCommand, SettingsCommand, MenuCommand, SetupCommand, ConfigureObsCommand, RecordCommand, ProcessCommand],
})
export class CliModule {}
