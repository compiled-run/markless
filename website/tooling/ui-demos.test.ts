import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, expect, it } from 'vitest';
import { uiDemos } from './ui-demos.ts';

let server: ViteDevServer | undefined;
let root: string | undefined;
afterEach(async () => {
	await server?.close();
	if (root) rmSync(root, { recursive: true, force: true });
	server = root = undefined;
});

it("adding a demo invalidates its family module in every dev environment's graph", async () => {
	root = realpathSync(mkdtempSync(join(tmpdir(), 'ui-demos-')));
	const family = join(root, 'components/demos/ui/tabs');
	mkdirSync(family, { recursive: true });
	writeFileSync(join(family, 'basic.tsrx'), 'export default function Basic() {}\n');
	server = await createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		server: { middlewareMode: true, ws: false },
		plugins: [uiDemos()],
	});
	const environments = [server.environments.client, server.environments.ssr];
	for (const environment of environments) await environment.transformRequest('ui-demos:tabs');
	const families = environments.map((environment) => environment.moduleGraph.getModuleById('\0ui-demos:tabs'));
	for (const module of families) expect(module?.transformResult).toBeTruthy();

	const added = join(family, 'second.tsrx');
	writeFileSync(added, 'export default function Second() {}\n');
	server.watcher.emit('add', added);

	for (const module of families) expect(module?.transformResult).toBeNull();
});
