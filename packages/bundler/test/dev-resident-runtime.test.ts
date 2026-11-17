import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'pathe';
import { build } from 'rolldown';
import { createServer } from 'vite';
import { expect, test } from 'vitest';
import { markless } from '../src/vite/index.ts';
import {
	devResidentRuntimeImports,
	runtimePackageRoots,
} from '../src/vite/dev-resident-runtime.ts';

const fixtureRoot = fileURLToPath(new URL('./fixtures/rebound-route', import.meta.url));
const webSource = fileURLToPath(new URL('../../web/src/', import.meta.url));

async function servedRuntimeModule(file: string) {
	const server = await createServer({
		root: fixtureRoot,
		configFile: false,
		logLevel: 'error',
		appType: 'custom',
		server: { middlewareMode: true, hmr: false, preTransformRequests: false },
		plugins: [markless() as never],
	});
	try {
		const result = await server.environments.client.transformRequest(`/@fs${webSource}${file}`);
		if (!result) throw new Error(`${file} did not transform`);
		return result.code;
	} finally {
		await server.close();
	}
}

test('the runtime package and the packages it depends on are the runtime roots', () => {
	const roots = runtimePackageRoots().map((root) => root.split('/').at(-2));
	expect(roots.sort()).toEqual(['runtime', 'serializer', 'web']);
});

test('on the dev server a lazy import the runtime makes of its own module is already loaded', async () => {
	const code = await servedRuntimeModule('resume-sync-demand.ts');
	expect(code).not.toMatch(/\bimport\(['"]/);
	expect(code).toMatch(
		/import \* as marklessResidentModule0 from "[^"]*resume-sync-computed\.ts[^"]*";/,
	);
	expect(code).toMatch(/marklessDevResident\(marklessResidentModule0\)/);
});

test('an installed runtime the dependency optimizer pre-bundles makes the same imports resident', async () => {
	const directory = realpathSync(await mkdtemp(join(tmpdir(), 'installed-runtime-')));
	try {
		const runtime = join(directory, 'node_modules', '@markless', 'web', 'dist');
		await mkdir(runtime, { recursive: true });
		await writeFile(
			join(runtime, 'entry.js'),
			"export const load = () => import('./lazy.js');\n",
		);
		await writeFile(join(runtime, 'lazy.js'), 'export const value = 1;\n');
		await writeFile(
			join(directory, 'app.js'),
			"export const app = () => import('./app-lazy.js');\n",
		);
		await writeFile(join(directory, 'app-lazy.js'), 'export const value = 2;\n');
		const transform = devResidentRuntimeImports(() => [`${runtime}/`]);
		const output = await build({
			input: [join(runtime, 'entry.js'), join(directory, 'app.js')],
			write: false,
			plugins: [{ name: 'dev-resident-runtime', transform }],
			external: [/\/fns\/dev-resident\./],
		});
		const chunks = output.output.filter((item) => item.type === 'chunk');
		const entry = chunks.find((chunk) => chunk.name === 'entry')!;
		const app = chunks.find((chunk) => chunk.name === 'app')!;
		expect(entry.code).toContain('marklessDevResident(');
		expect(entry.dynamicImports).toEqual([]);
		expect(app.dynamicImports).toHaveLength(1);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
