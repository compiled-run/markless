import { createServer } from 'vite-plus';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Session } from 'node:inspector/promises';

const output = '/tmp/markless-cold-start';
mkdirSync(output, { recursive: true });
const label = process.argv[2] ?? 'baseline-1',
	started = performance.now(),
	events = [];
const profiler = new Session();
profiler.connect();
await profiler.post('Profiler.enable');
await profiler.post('Profiler.start');
const observer = {
	name: 'cold-start-observer',
	configResolved(config) {
		for (const plugin of config.plugins) {
			const hook = plugin.transform,
				handler = typeof hook === 'function' ? hook : hook?.handler;
			if (!handler) continue;
			const wrapped = async function (code, id, ...rest) {
				const start = performance.now();
				try {
					return await handler.call(this, code, id, ...rest);
				} finally {
					events.push({
						plugin: plugin.name,
						id,
						environment: this.environment?.name,
						start: start - started,
						milliseconds: performance.now() - start,
					});
				}
			};
			plugin.transform = typeof hook === 'function' ? wrapped : { ...hook, handler: wrapped };
		}
	},
	configureServer(server) {
		server.middlewares.use('/__cold_profile', async (_request, response) => {
			const { profile } = await profiler.post('Profiler.stop');
			writeFileSync(`${output}/${label}.cpuprofile`, JSON.stringify(profile));
			writeFileSync(`${output}/${label}-transforms.json`, JSON.stringify(events));
			response.end(JSON.stringify({ events: events.length }));
		});
	},
};
const server = await createServer({
	root: resolve('website'),
	configFile: resolve('website/vite.config.ts'),
	cacheDir: `${output}/vite-cache`,
	plugins: [observer],
	server: { host: '127.0.0.1', port: 4488, strictPort: true },
});
await server.listen();
writeFileSync(
	`${output}/server.json`,
	JSON.stringify({
		pid: process.pid,
		url: server.resolvedUrls.local[0],
		label,
		startupMilliseconds: performance.now() - started,
	}),
);
server.printUrls();
for (const signal of ['SIGTERM', 'SIGINT'])
	process.on(signal, async () => {
		await server.close();
		profiler.disconnect();
		process.exit(0);
	});
