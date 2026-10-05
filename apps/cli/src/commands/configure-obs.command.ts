import { Injectable } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';
import * as p from '@clack/prompts';
import { StorageService } from '@mt/storage';
import { ObsService } from '@mt/obs';

@Injectable()
@Command({ name: 'configure-obs', description: 'Cria/atualiza as cenas do OBS para os monitores desta máquina' })
export class ConfigureObsCommand extends CommandRunner {
  constructor(
    private readonly storage: StorageService,
    private readonly obs: ObsService,
  ) {
    super();
  }

  async run(): Promise<void> {
    p.intro('mt configure-obs');

    const config = await this.storage.resolveStorageRoot();
    const { url, password } = this.storage.resolveObsConnection(config);
    const displays = await this.obs.configureScenes(this.storage.layout(config).recordings, url, password);
    p.log.success(`Cenas configuradas para ${displays.length} display(s).`);

    p.outro('OBS configurado.');
  }
}
