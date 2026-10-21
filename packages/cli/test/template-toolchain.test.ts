import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parse } from 'yaml';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const json = (path: string) => JSON.parse(read(path));

const root = json('../../../package.json');
const catalog = parse(read('../../../pnpm-workspace.yaml')).catalogs.default;

test('every starter format pins the vite-plus, vite alias, nitro and TypeScript the workspace builds with', () => {
	for (const format of ['node', 'bun']) {
		const manifest = json(`../templates/formats/${format}/package.json`);
		expect(manifest.dependencies['vite-plus'], format).toBe(root.devDependencies['vite-plus']);
		expect(manifest.devDependencies.vite, format).toBe(root.devDependencies.vite);
		expect(manifest.dependencies.nitro, format).toBe(catalog.nitro);
		expect(manifest.devDependencies.typescript, format).toBe(catalog.typescript);
	}
});
