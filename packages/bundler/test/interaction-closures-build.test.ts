import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'pathe';
import { afterAll, expect, test } from 'vitest';
import { nativePackingPlugins } from '../src/build/native-packing.ts';

const exec = promisify(execFile);
const fixture = resolve(import.meta.dirname, '../fixtures/vite-ssr');
const outDir = resolve(fixture, 'node_modules/.markless-pack-planner');
afterAll(() => rm(outDir, { force: true, recursive: true }));

type Consumer = { key: string; kind: string; conservative?: string; modules: string[] };

test('a real counter build names the click handler and its dispatch runtime in the click closure', async () => {
	await exec(
		process.execPath,
		[resolve(import.meta.dirname, 'helpers/build-pack-planner-fixture.ts'), outDir],
		{ cwd: fixture },
	);
	const asset = JSON.parse(
		await readFile(resolve(outDir, 'build/interaction-closures.json'), 'utf8'),
	) as {
		partition: string;
		routes: { route: string; fallback?: string; consumers: Consumer[] }[];
		packs: Record<string, string[]>;
	};
	// Entry-rooted builds keep their packs whole; the closures are still reported.
	expect(asset.partition).toBe('unsplit:entry-roots');
	const route = asset.routes.find((candidate) => candidate.route === 'src/root.tsrx')!;
	expect(route.fallback).toBeUndefined();
	const clicks = route.consumers.filter((consumer) => consumer.key.endsWith(':click'));
	expect(clicks).toHaveLength(1);
	const [click] = clicks;
	expect(click!.modules).toContain('virtual:markless:symbol:src%2Froot.tsrx:symbol%3A0');
	expect(click!.modules.some((id) => id.endsWith('web/src/fns/write-scalar.ts'))).toBe(true);
	const boot = route.consumers.find((consumer) => consumer.kind === 'boot')!;
	expect(boot.modules).toContain('virtual:markless:resume:src%2Froot.tsrx');
	// The resume module can import every handler through its resolver, so boot holds the handler.
	expect(boot.modules).toContain('virtual:markless:symbol:src%2Froot.tsrx:symbol%3A0');
}, 180_000);

test('the planner stays out of the build unless it is asked for', () => {
	const [packing] = nativePackingPlugins(() => '/workspace');
	expect(packing!.generateBundle).toBeUndefined();
	const [planned] = nativePackingPlugins(
		() => '/workspace',
		() => [],
		{ mode: 'closures', demandSources: () => [] },
	);
	expect(typeof planned!.generateBundle).toBe('function');
});
