import 'reflect-metadata';
import { CommandFactory } from 'nest-commander';
import { CliModule } from './cli.module';

async function bootstrap() {
  await CommandFactory.run(CliModule, {
    errorHandler: (error) => {
      const code = (error as { code?: string }).code;
      if (code === 'commander.help' || code === 'commander.helpDisplayed' || code === 'commander.version') {
        process.exit(0);
      }
      console.error(error.message);
      process.exit((error as { exitCode?: number }).exitCode ?? 1);
    },
    serviceErrorHandler: (error) => {
      console.error(error);
      process.exit(1);
    },
  });
}

bootstrap().catch((error: unknown) => {
  // Reaches here for failures thrown during DI bootstrap (before any command
  // runs) — e.g. an unsupported OS rejected by detectPlatform().
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
