import { LocalRuntimeService } from './local-runtime.service';
import { StorageModule } from '@mt/storage';
import { ManagedOllamaService } from './managed-ollama.service';
import { WorkspaceDiscoveryService } from './workspace-discovery.service';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@mt/platform';
import { EnvironmentSetupService } from './environment-setup.service';
import { PROCESS_RUNNER } from './process-runner';
import { ChildProcessRunner } from './child-process-runner';

@Module({
  imports: [PlatformModule, StorageModule],
  providers: [LocalRuntimeService, ManagedOllamaService, WorkspaceDiscoveryService, EnvironmentSetupService, { provide: PROCESS_RUNNER, useClass: ChildProcessRunner }],
  exports: [LocalRuntimeService, WorkspaceDiscoveryService, EnvironmentSetupService],
})
export class SetupModule {}
