import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { marklessBuildManifestPath } from '@markless/bundler/rolldown';
import { markless } from '@markless/bundler/vite';
import { MARKLESS_INTERACTION_CLOSURES } from '../../../bundler/src/build/chunking.ts';
import { readInteractionClosuresAsset } from '../../../bundler/src/build/interaction-closures.ts';
import { router } from '../../src/vite/index.ts';

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let closures: ReturnType<typeof readInteractionClosuresAsset>;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-static-prop-arm-'));
	await cp(resolve(import.meta.dirname, '../fixtures/static-prop-arm-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless(), router()],
	});
	await builder.buildApp();
	closures = readInteractionClosuresAsset(
		await readFile(
			marklessBuildManifestPath(join(root, '.output/public'), MARKLESS_INTERACTION_CLOSURES),
			'utf8',
		),
	);
}, 180_000);
afterAll(() => rm(root, { recursive: true, force: true }));

function glossCode(route: string) {
	const found = closures.routes.find((candidate) => candidate.route === route);
	expect(found, route).toBeDefined();
	expect(found!.fallback).toBeUndefined();
	return {
		actions: found!.consumers
			.filter((consumer) => consumer.key.includes('gloss.tsrx'))
			.map((consumer) => consumer.key),
		modules: found!.consumers
			.filter((consumer) => consumer.kind !== 'render')
			.flatMap((consumer) => consumer.modules.filter((id) => id.includes('gloss.tsrx'))),
	};
}

// Caption renders Gloss only in its @if (word) arm; a caller passing only text can never show it.
test('a page that passes a component only literal props loads none of the code its ruled-out arm renders', () => {
	expect(glossCode('pages/index.tsrx')).toEqual({ actions: [], modules: [] });
});

// Resuming an MDX page reads Caption's render data, which imports Gloss's render data for every arm; only that may stay.
test('an MDX page, whose component props are literals, loads none of the code a ruled-out arm runs', () => {
	const gloss = glossCode('pages/notes.mdx');
	expect(gloss.actions).toEqual([]);
	expect(gloss.modules.filter((id) => !/render-data|symbol%3A/.test(id))).toEqual([]);
	expect(gloss.modules.some((id) => id.includes('gloss.tsrx?markless-symbols'))).toBe(false);
});

test('a page whose literal props pick the arm still preloads the code that arm renders', () => {
	const gloss = glossCode('pages/glossary.tsrx');
	expect(gloss.actions).toEqual([
		expect.stringMatching(/^action:components\/gloss\.tsrx#h\d+:click$/),
	]);
	expect(gloss.modules.length).toBeGreaterThan(0);
});
