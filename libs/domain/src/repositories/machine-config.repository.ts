import { MachineConfig } from '../entities/machine-config.entity';

export interface MachineConfigRepository {
  load(): Promise<MachineConfig | null>;
  save(config: MachineConfig): Promise<void>;
}

export const MACHINE_CONFIG_REPOSITORY = Symbol('MACHINE_CONFIG_REPOSITORY');
