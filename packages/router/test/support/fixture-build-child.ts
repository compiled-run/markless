import { writeSync } from 'node:fs';
import { createBuilder } from 'vite';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import type { FixtureBuild } from './fixture-build.ts';

const build = JSON.parse(process.argv[2]!) as FixtureBuild;
const message = (error: unknown) => String((error as { message?: unknown })?.message ?? error);
try {
	const builder = await createBuilder({
		root: build.root,
		logLevel: 'silent',
		...(build.configFile
			? { configFile: build.configFile }
			: { configFile: false, plugins: [markless(build.markless), router()] }),
		...(build.nitro && { nitro: build.nitro }),
		...(build.build && { build: build.build }),
	} as Parameters<typeof createBuilder>[0]);
	await builder.buildApp();
} catch (error) {
	const errors = (error as { errors?: readonly unknown[] }).errors;
	// fd 3 is the parent's report pipe: the build's own messages, apart from anything it logged.
	writeSync(3, JSON.stringify({ message: message(error), errors: errors?.map(message) }));
	process.exit(1);
}
