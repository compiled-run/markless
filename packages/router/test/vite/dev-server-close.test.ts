import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { expect, test } from 'vitest';

const fixture = fileURLToPath(new URL('../../fixtures/router-app/', import.meta.url));

type Handle = { type: string; is_active?: boolean; filename?: string };

// fs.watch and chokidar hold one fs_event handle per watched path; a closed one lingers inactive until its close callback runs.
const watchedPaths = () =>
	(process.report.getReport() as unknown as { libuv: Handle[] }).libuv
		.filter((handle) => handle.type === 'fs_event' && handle.is_active === true)
		.map((handle) => handle.filename ?? '')
		.sort();

test("closing a routed app's dev server closes every file watcher it opened", async () => {
	const before = watchedPaths();
	const server = await createServer({
		root: fixture,
		configFile: `${fixture}vite.config.ts`,
		logLevel: 'silent',
		server: { port: 0, strictPort: false, ws: false },
	});
	await server.listen();
	expect(watchedPaths().length).toBeGreaterThan(before.length);

	await server.close();

	expect(watchedPaths()).toEqual(before);
}, 120_000);
