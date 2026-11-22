// Builds one app with the Vite the router builds apps with, as `vite build` does: `node app-server-child.ts <root>`.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2]!;
const fromRouter = createRequire(join(import.meta.dirname, '..', '..', '..', 'router', 'package.json'));
const { createBuilder } = (await import(pathToFileURL(fromRouter.resolve('vite')).href)) as typeof import('vite');
const builder = await createBuilder({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'warn' });
await builder.buildApp();
