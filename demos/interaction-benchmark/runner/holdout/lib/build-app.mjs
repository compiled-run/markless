// Child process: builds one holdout app with the Vite API (its own vite config, untouched), then optionally
// serves it with `vite preview`. Run with `node --import ./markless-options-hook.mjs`; prints one JSON line
// `{ event: 'built' | 'serving', ... }` on stdout per phase.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const [root, mode = 'build', port = '0'] = process.argv.slice(2);
const require = createRequire(`${root}/package.json`);
const vite = await import(pathToFileURL(require.resolve('vite')).href);
const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);

if (mode === 'build' || mode === 'build+serve') {
	const started = Date.now();
	const builder = await vite.createBuilder({ root, logLevel: 'warn' });
	await builder.buildApp();
	emit({
		event: 'built',
		ms: Date.now() - started,
		marklessCalls: globalThis.__holdoutMarklessCalls ?? 0,
		options: process.env.HOLDOUT_MARKLESS_OPTIONS ?? null,
	});
}
if (mode === 'serve' || mode === 'build+serve') {
	const server = await vite.preview({
		root,
		logLevel: 'warn',
		preview: { host: '127.0.0.1', port: Number(port), strictPort: true },
	});
	emit({
		event: 'serving',
		url: server.resolvedUrls?.local?.[0] ?? `http://127.0.0.1:${port}/`,
		marklessCalls: globalThis.__holdoutMarklessCalls ?? 0,
	});
	const stop = () => server.close().finally(() => process.exit(0));
	process.on('SIGTERM', stop);
	process.on('SIGINT', stop);
}
