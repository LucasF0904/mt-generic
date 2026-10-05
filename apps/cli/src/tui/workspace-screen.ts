import * as blessed from 'blessed';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { WorkspaceController } from './workspace-controller';

export interface WorkspaceAssistants { settings?: () => Promise<void>; prepare?: () => Promise<void>; }
const clean = (value: unknown): string => String(value ?? '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '');
const keys = ['r', 's', 't', 'p', 'd', 'm', 'a', 'g', 'k', '/', 'o', 'v', 'c', 'i'];

/** Owns the terminal's input for the lifetime of the dashboard. */
export class WorkspaceScreen {
  private screen!: blessed.Widgets.Screen;
  private actions!: blessed.Widgets.ListElement;
  private files!: blessed.Widgets.ListElement;
  private header!: blessed.Widgets.BoxElement;
  private history!: blessed.Widgets.BoxElement;
  private footer!: blessed.Widgets.BoxElement;
  private working = false;
  private modal = false;
  private rendering = false;
  private historyText = '';
  private closed = false;
  private finish?: () => void;
  private timer?: ReturnType<typeof setInterval>;
  private readonly onChange = () => this.render();
  constructor(
    private readonly controller: WorkspaceController,
    private readonly assistants: WorkspaceAssistants,
    private readonly createScreen: () => blessed.Widgets.Screen = () => blessed.screen({ smartCSR: true, fullUnicode: true, dockBorders: true, title: 'mt — Gravações', terminal: process.env.TERM === 'dumb' ? 'xterm-256color' : undefined }),
  ) {}

  async run(): Promise<void> {
    this.mount(); this.controller.on('change', this.onChange);
    this.timer = setInterval(() => this.render(), 1000);
    const done = new Promise<void>(resolve => { this.finish = resolve; });
    void this.work(() => this.controller.initialize());
    try { await done; }
    finally {
      clearInterval(this.timer); this.controller.off('change', this.onChange);
      if (!this.screen.destroyed) this.screen.destroy();
    }
  }

  private mount(): void {
    this.screen = this.createScreen(); this.historyText = '';
    const border = { type: 'line' as const };
    const style = { fg: '#cbd5e1', bg: '#0f172a', border: { fg: '#475569' }, focus: { border: { fg: '#22d3ee' } }, selected: { bg: '#164e63', fg: '#ffffff', bold: true } };
    this.header = blessed.box({ parent: this.screen, top: 0, height: 1, width: '100%', style: { bg: '#164e63', fg: 'white', bold: true } });
    this.actions = blessed.list({ parent: this.screen, label: ' 1 · Controles ', top: 1, left: 0, width: '34%', height: '65%', border, style: structuredClone(style), keys: true, vi: false, mouse: true, tags: false, scrollbar: { ch: '│' } });
    this.files = blessed.list({ parent: this.screen, label: ' 2 · Gravações ', top: 1, left: '34%', width: '66%', height: '65%', border, style: structuredClone(style), keys: true, vi: false, mouse: true, tags: false, scrollbar: { ch: '│' } });
    this.history = blessed.box({ parent: this.screen, label: ' 3 · Histórico / resultados ', top: '65%+1', bottom: 3, width: '100%', border, style: structuredClone(style), scrollable: true, alwaysScroll: true, keys: true, vi: false, mouse: true, tags: false, scrollbar: { ch: '│' } });
    this.footer = blessed.box({ parent: this.screen, bottom: 0, height: 3, width: '100%', style: { fg: '#cbd5e1', bg: '#0f172a' } });
    this.files.on('select item', (_item, index: number) => {
      if (!this.rendering) this.controller.select(this.controller.state.entries[index]?.path);
    });
    this.files.on('select', () => { void this.openSelected(); });
    this.actions.on('select', (_item, index: number) => { void this.dispatch(keys[index]); });
    this.screen.key(keys.filter(key => key !== 'k'), (_ch, key) => { if (!this.modal) void this.dispatch(key.full); });
    // Raw key logging is deliberately not bound to k: k is navigation in a lazy-style UI.
    this.screen.key('K', () => { if (!this.modal) void this.dispatch('k'); });
    this.screen.key(['j', 'k'], (ch) => {
      if (this.modal) return;
      const amount = ch === 'j' ? 1 : -1;
      if (this.screen.focused === this.files) amount > 0 ? this.files.down(1) : this.files.up(1);
      else if (this.screen.focused === this.actions) amount > 0 ? this.actions.down(1) : this.actions.up(1);
      else this.history.scroll(amount);
      this.screen.render();
    });
    this.screen.key(['tab', 'S-tab'], () => {
      if (this.modal) return;
      const panes = [this.actions, this.files, this.history];
      panes[(panes.indexOf(this.screen.focused as typeof this.actions) + 1) % panes.length].focus(); this.render();
    });
    this.screen.key(['1', '2', '3'], (ch) => { if (!this.modal) { [this.actions, this.files, this.history][Number(ch) - 1].focus(); this.render(); } });
    this.screen.key('backspace', () => { if (!this.modal) void this.work(() => this.controller.browse(path.dirname(this.controller.state.directory))); });
    this.screen.key('f5', () => { if (!this.modal) void this.work(() => this.controller.browse(this.controller.state.directory)); });
    this.screen.key(['q', 'C-c'], () => { if (!this.modal) void this.quit(); });
    this.files.focus(); this.render();
  }

  private render(): void {
    if (this.closed || !this.screen || this.screen.destroyed || this.rendering) return;
    this.rendering = true;
    try {
      const state = this.controller.state;
      const elapsed = state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0;
      const duration = `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;
      this.header.setContent(` mt  /  ${state.phase === 'recording' ? `● GRAVANDO ${duration}` : 'Gravações e transcrições'}   ·   ${clean(state.profileName)}`);
      this.header.style.bg = state.phase === 'recording' ? '#9f1239' : '#164e63';
      const display = state.displays.find(display => display.monitorIndex === state.displayIndex);
      const selectedAction = (this.actions as unknown as { selected: number }).selected;
      this.actions.setItems([
        '[r] Iniciar gravação', '[s] Parar e salvar', '[t] Transcrever vídeo',
        `[p] Perfil: ${clean(state.profileName)}`, `[d] Tela: ${clean(display?.monitorName ?? 'indisponível')}`,
        `[m] Microfone: ${state.mic ? 'ligado' : 'desligado'}`, `[a] Análise: ${state.audioOnly ? 'só áudio' : 'áudio + frames'}`,
        `[g] Registrar SC: ${state.registerSc ? 'sim' : 'não'}`, `[K] Teclado bruto: ${state.captureKeys ? 'sim' : 'não'}`,
        '[/] Escolher pasta', '[o] Abrir no Finder/Explorer', '[v] Reparar OBS', '[c] Configurações', '[i] Preparar modelos locais',
      ]);
      this.actions.select(selectedAction);
      this.files.setLabel(` 2 · ${clean(state.directory || 'Gravações')} `);
      this.files.setItems(state.entries.length ? state.entries.map(entry => `${entry.directory ? '▸' : '▶'} ${clean(entry.name)}${entry.directory ? '/' : `  ${(entry.size / 1024 / 1024).toFixed(1)} MB`}`) : ['(Nenhum vídeo nesta pasta. / escolhe outra pasta.)']);
      this.files.select(Math.max(0, state.entries.findIndex(entry => entry.path === state.selectedPath)));
      const history = state.messages.map(clean).join('\n') || 'Arquivos originais são preservados ao importar.\nEscolha uma tela para gravar ou navegue até um vídeo existente.';
      if (history !== this.historyText) { this.history.setContent(history); this.history.setScrollPerc(100); this.historyText = history; }
      this.footer.setContent(` ${clean(state.status)}\n Tab painéis · ↑↓/j/k navegar · Enter abrir pasta · Backspace subir · / outra pasta · F5 atualizar\n r gravar · s parar · t transcrever · o abrir pasta · q sair`);
      this.screen.render();
    } finally { this.rendering = false; }
  }

  private async work(action: () => Promise<void>): Promise<void> {
    if (this.working || this.closed) { this.controller.log('Aguarde a operação em andamento.'); return; }
    this.working = true;
    try { await action(); }
    catch (error) { this.controller.log(`Erro: ${(error as Error).message}`); }
    finally { this.working = false; this.render(); }
  }

  private async dispatch(key: string): Promise<void> {
    if (this.modal) return;
    if (key === 'r') return this.work(() => this.controller.startRecording());
    if (key === 's') return this.work(() => this.controller.stopRecording());
    if (key === 't') return this.work(() => this.controller.transcribeSelected());
    if (key === 'v') return this.work(() => this.controller.configureObs());
    if (key === 'o') return this.work(() => this.openFolder());
    if (key === 'c' || key === 'i') return this.assistant(key === 'c' ? this.assistants.settings : this.assistants.prepare);
    if (this.working || this.controller.state.phase !== 'idle') { this.controller.log('Pare a gravação ou aguarde antes de alterar as opções.'); return; }
    const state = this.controller.state;
    if (key === 'p') {
      const selected = await this.choose('Perfil', state.profiles.map(profile => profile.name), state.profiles.findIndex(profile => profile.name === state.profileName));
      if (selected !== undefined) this.controller.setOptions({ profileName: state.profiles[selected].name });
    } else if (key === 'd') {
      const selected = await this.choose('Tela para gravar', state.displays.map(display => `${display.monitorIndex} · ${display.monitorName}`), state.displays.findIndex(display => display.monitorIndex === state.displayIndex));
      if (selected !== undefined) this.controller.setOptions({ displayIndex: state.displays[selected].monitorIndex });
    } else if (key === 'm') this.controller.setOptions({ mic: !state.mic });
    else if (key === 'a') this.controller.setOptions({ audioOnly: !state.audioOnly });
    else if (key === 'g') this.controller.setOptions({ registerSc: !state.registerSc });
    else if (key === 'k') this.controller.setOptions({ captureKeys: !state.captureKeys });
    else if (key === '/') {
      const directory = await this.prompt('Caminho da pasta', state.directory);
      if (directory) await this.work(() => this.controller.browse(path.resolve(directory.startsWith('~/') ? path.join(homedir(), directory.slice(2)) : directory)));
    }
  }

  private async openSelected(): Promise<void> {
    if (this.modal) return;
    const entry = this.controller.state.entries.find(entry => entry.path === this.controller.state.selectedPath);
    if (entry?.directory) await this.work(() => this.controller.browse(entry.path));
    else if (entry) this.controller.log(`Selecionado: ${entry.path}. Pressione [t] para transcrever.`);
  }

  private choose(title: string, items: string[], initial = 0): Promise<number | undefined> {
    if (!items.length) { this.controller.log('Nenhuma opção disponível. Configure o ambiente primeiro.'); return Promise.resolve(undefined); }
    this.modal = true;
    return new Promise(resolve => {
      const previous = this.screen.focused;
      const box = blessed.list({ parent: this.screen, top: 'center', left: 'center', width: '80%', height: Math.min(items.length + 4, 18), label: ` ${title} · Enter confirma / Esc cancela `, border: { type: 'line' }, style: { bg: '#1e293b', fg: 'white', border: { fg: 'cyan' }, selected: { bg: 'blue' } }, keys: true, vi: false, mouse: true, items: items.map(clean) });
      let resolved = false;
      const done = (index?: number) => { if (resolved) return; resolved = true; box.destroy(); this.modal = false; previous?.focus(); this.render(); resolve(index); };
      box.key(['j', 'k'], ch => { ch === 'j' ? box.down(1) : box.up(1); this.screen.render(); });
      box.on('select', (_item, index: number) => done(index)); box.key(['escape', 'q', 'C-c'], () => done());
      box.select(Math.max(0, initial)); box.focus(); this.screen.render();
    });
  }

  private prompt(title: string, initial: string): Promise<string | undefined> {
    this.modal = true;
    return new Promise(resolve => {
      const box = blessed.prompt({ parent: this.screen, top: 'center', left: 'center', width: '85%', height: 9, border: { type: 'line' }, style: { bg: '#1e293b', fg: 'white', border: { fg: 'cyan' } } });
      box.input(`${title} (Esc cancela)`, initial, (_error, value) => { box.destroy(); this.modal = false; this.files.focus(); this.render(); resolve(value || undefined); });
    });
  }

  private async assistant(action?: () => Promise<void>): Promise<void> {
    if (!action || this.working || this.controller.state.phase !== 'idle') { this.controller.log('Pare a gravação ou aguarde para abrir o assistente.'); return; }
    await this.work(async () => {
      // Destroy removes this screen's key listeners and restores cooked mode.
      // The command's prompts get exclusive stdin; a fresh dashboard owns it afterwards.
      this.screen.destroy();
      try { await action(); this.controller.log('Assistente concluído.'); }
      finally { this.mount(); await this.controller.initialize(); }
    });
  }

  private async openFolder(): Promise<void> {
    const directory = this.controller.state.directory;
    if (!directory) return;
    const executable = process.platform === 'win32' ? 'explorer.exe' : 'open';
    await new Promise<void>((resolve, reject) => execFile(executable, [directory], error => error ? reject(error) : resolve()));
  }

  private async quit(): Promise<void> {
    if (this.working) { this.controller.log('Aguarde a operação para sair.'); return; }
    if (this.controller.state.phase === 'recording') {
      const answer = await this.choose('Gravação ativa', ['Continuar gravando', 'Parar, salvar e sair']);
      if (answer !== 1) return;
      await this.work(() => this.controller.stopRecording());
      if ((this.controller.state.phase as string) !== 'idle') return;
    }
    this.closed = true; this.finish?.();
  }
}
