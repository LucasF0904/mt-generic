import { Injectable } from '@nestjs/common';
import { WorkspaceController } from './workspace-controller';
import { WorkspaceAssistants, WorkspaceScreen } from './workspace-screen';
@Injectable()
export class TerminalUiService {
  constructor(private readonly controller: WorkspaceController) {}
  run(assistants: WorkspaceAssistants): Promise<void> { return new WorkspaceScreen(this.controller, assistants).run(); }
}
