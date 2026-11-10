import { createBuilder } from 'vite';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import type { FixtureBuild } from './fixture-build.ts';

const build = JSON.parse(process.argv[2]!) as FixtureBuild;
const builder = await createBuilder({
	root: build.root,
	configFile: false,
	logLevel: 'silent',
	...(build.nitro && { nitro: build.nitro }),
	...(build.build && { build: build.build }),
	plugins: [markless(build.markless), router()],
} as Parameters<typeof createBuilder>[0]);
await builder.buildApp();
