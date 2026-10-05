# mt — Meeting Transcription

Gravação de tela pelo OBS, transcrição local e relatório com análise de frames.
A interface de terminal usa painéis e atalhos, inspirada em lazygit/lazydocker.
Gravar é independente da instalação dos modelos de transcrição e análise.

## Instalação global

O mt pode ser instalado como um comando global no macOS e no Windows.
Com Node.js 20+ e npm instalados, gere o pacote neste diretório:

```bash
npm ci
npm pack
npm install --global ./mt-0.1.0.tgz
```

Depois, em qualquer pasta:

```bash
mt
mt --version
mt process --file "/caminho/gravação.mp4" --local --audio-only
```

`npm pack` compila antes de gerar o `.tgz`. Esse arquivo pode ser copiado para
outro Mac/Windows e instalado com `npm install --global <caminho-do-arquivo>`.
A instalação baixa as dependências da plataforma; abrir `mt` não recompila
o projeto e não depende de manter o checkout original. OBS, ferramentas de
transcrição e modelos continuam sendo preparados separadamente.

Para atualizar, gere o pacote novamente e repita a instalação. Para remover:
`npm uninstall --global mt`. Configurações, gravações e modelos ficam nos
diretórios de dados escolhidos e são preservados. Se `mt` não for encontrado,
confira se o diretório de executáveis globais do npm está no PATH: no Mac é
`<npm prefix -g>/bin`; no Windows é o próprio diretório retornado por
`npm prefix -g`.

O pacote é distribuível por arquivo local e ainda não foi publicado em um
registro público. Não use `npm install -g mt` sem o caminho do `.tgz`: esse
nome no registro não identifica necessariamente este projeto. Uma publicação
pública ou distribuição via Homebrew/winget exige preparar essa distribuição.
O mapeamento do comando segue o campo [bin do npm](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#bin).

O pacote contém apenas o executável, o aplicativo compilado, `package.json` e
este README. Configurações, perfis, credenciais, gravações e modelos ficam no
computador de cada pessoa e não são incluídos no pacote. A configuração inicial
usa **Sem perfil** quando nenhum perfil local foi criado; o registro no SC
começa desligado e só funciona quando um perfil local aponta para uma memória.

## Abrir

Requisitos para iniciar: macOS ou Windows, Node.js 20+ com npm e OBS Studio 28+.
Abra `mt.command` no Mac ou `mt.cmd` no Windows. Os launchers verificam as
dependências, compilam o projeto e abrem a interface. Pelo terminal:

```bash
npm ci
npm run build
npm start
```

Na primeira execução, o assistente apresenta o ambiente detectado e permite
escolher armazenamento, perfil e destino dos relatórios. A instalação começa
sem perfis e não procura perfis de outros aplicativos. É possível criar um
perfil local ou usar **Sem perfil**, gerando arquivos genéricos. Vaults
registrados no Obsidian podem ser escolhidos como destino; também é possível
criar um vault ou escolher uma pasta sem instalar o Obsidian. Os perfis criados
no mt ficam na pasta `profiles` dentro do armazenamento escolhido.

## Painéis e atalhos

| Tecla | Ação |
| --- | --- |
| `r` / `s` | Iniciar / parar e salvar a gravação |
| `t` | Transcrever o vídeo selecionado |
| `p` / `d` | Escolher perfil / tela |
| `m` | Ligar ou desligar microfone (inicialmente desligado) |
| `a` | Alternar áudio + frames / somente áudio |
| `g` | Alternar registro no SC (inicialmente desligado) |
| `K` | Alternar captura de teclado bruto (inicialmente desligada) |
| `Tab`, `1`, `2`, `3` | Alternar painel |
| Setas ou `j`/`k` | Navegar |
| `Enter` / `Backspace` | Entrar na pasta / subir um nível |
| `/` | Informar outra pasta de gravações |
| `o` | Abrir a pasta atual no Finder/Explorer |
| `F5` | Atualizar arquivos |
| `v` | Configurar/reparar OBS novamente |
| `c` | Abrir configurações |
| `i` | Preparar modelos locais |
| `q` ou `Ctrl+C` | Sair; durante gravação, oferece parar e salvar |

Ao parar, a interface permanece aberta e seleciona o vídeo salvo: pressione
`t` para transcrever ou `r` para gravar outra sessão. Um logger auxiliar travado
é interrompido após o prazo de encerramento, sem impedir o retorno à interface.
Os assistentes de configuração rodam em processos separados; ao terminar,
o controle do teclado volta aos painéis.

O navegador começa na pasta configurada de gravações e aceita vídeos que não
possuem sessão prévia. A importação **copia e preserva o arquivo original**.
São listados MKV, MP4, MOV, WebM, AVI, M4V, FLV e TS; o processamento depende
do suporte do FFmpeg ao conteúdo do arquivo.

## OBS e monitores externos

O mt confere/configura o OBS ao abrir a interface e antes de cada gravação.
Abre o OBS local quando necessário e reaproveita porta e senha do WebSocket.
Com o OBS fechado, pode habilitar o servidor; configurações novas recebem uma
senha aleatória. Se o OBS estiver aberto com WebSocket desabilitado, habilite-o
em **Tools > WebSocket Server Settings** ou feche o OBS e tente novamente.

Cada tela conectada recebe cenas `DISPLAY<n>-Reuniao` e
`DISPLAY<n>-Reuniao-Mic`. No Mac, a captura usa os UUIDs das telas obtidos por
AppKit/CoreGraphics, incluindo monitores externos de nomes iguais. No Windows,
usa os identificadores fornecidos pela fonte de captura do OBS. O mt repara
fontes ausentes, ajusta o enquadramento e preserva dispositivos de microfone
escolhidos nas propriedades do OBS. Cenas de telas desconectadas são mantidas,
mas essas telas não aparecem na seleção atual.

A configuração aguarda o carregamento inicial das cenas e recusa alterações
com gravação, transmissão ou replay buffer ativo. Ao parar, aguarda a finalização
do arquivo. Dispositivos globais de áudio silenciados durante a gravação voltam
ao estado anterior.

No macOS, autorize **Gravação de Tela e Áudio do Sistema** para o OBS e
**Microfone** se for usá-lo. Captura de áudio do sistema usa ScreenCaptureKit
(macOS 13+). O registro opcional de cliques/teclas precisa de **Acessibilidade**
para o terminal que executa o mt. A gravação continua se esse logger falhar.
Permissões do sistema e diálogos de primeiro uso do OBS exigem interação local.

Para conexões personalizadas, use `setup --obs-url <url> --obs-password <senha>`
ou `MT_OBS_URL`/`MT_OBS_PASSWORD`. Credenciais locais não são inferidas para
servidores remotos. Instalações fora do padrão podem usar `MT_OBS_CONFIG_DIR`
e, no Windows, `MT_OBS_EXECUTABLE`.

## Armazenamento, perfis e modelos

A configuração completa fica em `<armazenamento>/config/machine-config.json`;
`~/.mt/machine-config.json` guarda o local dessa configuração. Configurações
antigas continuam sendo lidas. O assistente `c` permite trocar o armazenamento
e oferece copiar os dados, preservando a origem. Para copiar, escolha uma pasta
vazia fora da origem. Caminhos personalizados fora da origem são mantidos.

Por padrão, sessões ficam em `<armazenamento>/Staging` e `Processed`, modelos
em `models` e relatórios sem vault em `Processed/notes/unrouted/<perfil>`.
Cada categoria também pode apontar para outra pasta:

```bash
node dist/apps/cli/main.js settings --storage-root "/Volumes/Disco/MeetingAI" --migrate
node dist/apps/cli/main.js settings --recordings-root "/Volumes/Disco/Videos" --models-root "/Volumes/Disco/Modelos"
node dist/apps/cli/main.js settings --config-root "/Volumes/Disco/Config" --reports-root "/Volumes/Disco/Relatorios"
```

As opções de categoria mudam os locais usados nas próximas operações; não
copiam vídeos/modelos/perfis existentes. Ao trocar `--config-root`, copie os
perfis locais desejados para a subpasta `profiles` do novo local. A configuração
em si é salva automaticamente. `--migrate` se aplica à troca do armazenamento
principal e copia os dados contidos nele.

Para transcrever, são necessários FFmpeg, whisper.cpp e seu modelo. Para
resumo e análise visual, também Ollama e os modelos selecionados. Prepare-os
com `i` ou:

```bash
node dist/apps/cli/main.js prepare --install-tools
# Apenas transcrição, sem preparar Ollama:
node dist/apps/cli/main.js prepare --install-tools --audio-only
```

A instalação usa Homebrew no Mac e winget no Windows; esses gerenciadores
precisam estar disponíveis. O pacote Windows x64 do whisper.cpp e o modelo
Whisper medium são verificados por SHA256. Downloads podem ser grandes.
Se uma instalação alterar o PATH no Windows, pode ser necessário reabrir o terminal.

O mt inicia uma instância local própria do Ollama usando a pasta de modelos
selecionada e a encerra ao sair, sem encerrar o servidor do usuário. Arquivos
Whisper legados em `bin` e modelos Ollama legados em `ollama-models` são
reaproveitados quando não há outra pasta de modelos configurada.

```bash
node dist/apps/cli/main.js settings --whisper-binary "/caminho/whisper-cli" --whisper-model "/caminho/modelo.bin"
node dist/apps/cli/main.js settings --summary-model llama3.2:3b --vision-model qwen2.5vl
```

Overrides disponíveis: `MT_WHISPER_BINARY`, `MT_WHISPER_MODEL_PATH`,
`MT_WHISPER_MODEL`, `MT_WHISPER_LANG`, `MT_OLLAMA_LLM_MODEL`,
`MT_OLLAMA_VISION_MODEL` e `MT_OLLAMA_URL` (servidor local explícito).

## Transcrição, relatório e SC

Cada processamento gera dois arquivos no destino do perfil/vault ou na pasta
de relatórios genéricos:

- `<sessão>.transcript.txt`: transcrição de áudio com timestamps.
- `<sessão>.md`: relatório com transcrição e análise dos frames; imagens
  disponíveis são copiadas para `<sessão>.assets/` e vinculadas no Markdown.

A transcrição é salva antes dos enriquecimentos. Se Ollama, visão ou síntese
falharem, o relatório preserva as fontes disponíveis e informa a ausência da
análise. O modo somente áudio dispensa Ollama.

Com SC ligado, os arquivos são salvos e uma entrada com referências aos dois
é registrada no `memory.jsonl` apontado pelo perfil. A entrada é idempotente
por sessão. Sem referência de memória, o registro é pulado; erros no grafo
não invalidam os arquivos gerados. Não há commit ou push automático.

Os subcomandos continuam disponíveis para scripts:

```bash
node dist/apps/cli/main.js record --profile "Sem perfil" --display 0 --no-mic --no-capture-keys --seconds 10
node dist/apps/cli/main.js process --latest --local --register-sc
node dist/apps/cli/main.js process --file "/caminho/gravação.mp4" --local --audio-only
node dist/apps/cli/main.js process --directory "/caminho/Gravações"
node dist/apps/cli/main.js configure-obs
```

`--display` começa em zero. `process` permite sessões pendentes ou navegação por
pastas; `--file`, `--directory`, `--session` e `--latest` são seletores alternativos.
Use `--help` em cada comando para consultar as opções.

## Verificação

```bash
npm test
npm run test:cov
npm run typecheck
npm run build
npm run test:package
```

A verificação de pacote compila, empacota e instala em um prefixo global
temporário sem dependências de desenvolvimento. Executa o comando instalado
fora do projeto, verifica ajuda/versão/erros e remove apenas esse prefixo de
teste. Ela também está na matriz de CI de macOS e Windows.

A gravação com três monitores externos e a transcrição local foram exercitadas
neste Mac. Windows tem testes dos adaptadores e argumentos, mas ainda precisa
de validação em hardware Windows. Processamento remoto não está implementado.

Contexto e evidências em [docs/superpowers](docs/superpowers), incluindo o
[design da interface](docs/superpowers/specs/2026-09-09-terminal-ui-design.md).
