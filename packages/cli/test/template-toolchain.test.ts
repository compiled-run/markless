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

test('every starter format pins the vite-plus, vite alias and nitro the workspace builds with', () => {
	const vitePlus = root.devDependencies['vite-plus'];
	const vite = root.devDependencies.vite;
	for (const [format, manifest] of [
		['node', node],
		['bun', bun],
	] as const) {
		expect(manifest.dependencies['vite-plus'], format).toBe(vitePlus);
		expect(manifest.devDependencies.vite, format).toBe(vite);
		expect(manifest.dependencies.nitro, format).toBe(catalog.nitro);
		expect(manifest.devDependencies.typescript, format).toBe(catalog.typescript);
	}
	expect(deno['vite-plus']).toBe(`npm:vite-plus@${vitePlus}`);
	expect(deno.vite).toBe(vite);
	expect(deno.nitro).toBe(`npm:nitro@${catalog.nitro}`);
});
