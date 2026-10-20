import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parse } from 'yaml';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const json = (path: string) => JSON.parse(read(path));

const root = json('../../../package.json');
const catalog = parse(read('../../../pnpm-workspace.yaml')).catalogs.default;
const node = json('../templates/formats/node/package.json');
const bun = json('../templates/formats/bun/package.json');
const deno = json('../templates/formats/deno/deno.json').imports;

// vite-plus 1.x starts Vite in a child `deno vite.js`, which has no permissions, so `deno task build` fails on its first env read.
const DENO_VITE_PLUS = '0.3.1';

test('the Node and Bun starters pin the vite-plus, vite alias, nitro and TypeScript the workspace builds with', () => {
	for (const [format, manifest] of [
		['node', node],
		['bun', bun],
	] as const) {
		expect(manifest.dependencies['vite-plus'], format).toBe(root.devDependencies['vite-plus']);
		expect(manifest.devDependencies.vite, format).toBe(root.devDependencies.vite);
		expect(manifest.dependencies.nitro, format).toBe(catalog.nitro);
		expect(manifest.devDependencies.typescript, format).toBe(catalog.typescript);
	}
});

test('the Deno starter pins the workspace nitro and the last vite-plus that builds under Deno', () => {
	expect(deno['vite-plus']).toBe(`npm:vite-plus@${DENO_VITE_PLUS}`);
	expect(deno.vite).toBe(`npm:@voidzero-dev/vite-plus-core@${DENO_VITE_PLUS}`);
	expect(deno.nitro).toBe(`npm:nitro@${catalog.nitro}`);
});
