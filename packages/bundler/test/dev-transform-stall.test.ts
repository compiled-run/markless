import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { createServer } from 'vite';
import { markless } from '../src/vite/index.ts';
import {
	DEV_TRANSFORM_STALL_MS,
	createDevTransformGuard,
	devTransformStallMs,
} from '../src/vite/dev-transform-stall.ts';
import { marklessSourceAliases } from './helpers.ts';

const root = resolve(import.meta.dirname, '../../..');
const cleanupRoots: string[] = [];
afterEach(async () => {
	vi.unstubAllEnvs();
	await Promise.all(
		cleanupRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })),
	);
});

async function createFixture() {
	const fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'markless-dev-stall-')));
	cleanupRoots.push(fixtureRoot);
	const src = join(fixtureRoot, 'src');
	await mkdir(src, { recursive: true });
	await writeFile(
		join(src, 'badge.tsrx'),
		'export default function Badge({ text }: { readonly text: string }) @{\n' +
			'\t<em>{text}</em>\n}\n',
	);
	const entry = join(src, 'card.tsrx');
	await writeFile(
		entry,
		"import { state } from '@markless/core';\n" +
			"import Badge from './badge.tsrx';\n\n" +
			'export function Card() @{\n' +
			'\tlet open = state(false);\n\n' +
			'\t<section>\n\t\t<button onClick={() => (open = !open)}>{open}</button>\n' +
			'\t\t<Badge text="new" />\n\t</section>\n}\n',
	);
	return { entry, root: fixtureRoot };
}

// The child's server transform waits for the test, as a transform caught in a wait cycle waits forever.
function heldChildTransform() {
	let release!: () => void;
	const held = new Promise<void>((resolve) => (release = resolve));
	const plugin = {
		name: 'test:held-child-transform',
		enforce: 'pre' as const,
		async transform(this: { environment?: { name?: string } }, _code: string, id: string) {
			if (this.environment?.name === 'ssr' && id.endsWith('/badge.tsrx')) await held;
			return null;
		},
	};
	return { plugin, release };
}

test('a dev transform Markless waits on that does not settle in time fails, naming it, instead of hanging its importer', async () => {
	vi.stubEnv('MARKLESS_DEV_TRANSFORM_STALL_MS', '300');
	const fixture = await createFixture();
	const child = heldChildTransform();
	const server = await createServer({
		configFile: false,
		root: fixture.root,
		logLevel: 'silent',
		environments: {
			ssr: {
				consumer: 'server',
				build: { rolldownOptions: { input: { prerender: fixture.entry } } },
			},
		},
		plugins: [child.plugin, markless({ executionLog: 'never' })],
		resolve: { alias: marklessSourceAliases(root) },
		server: { middlewareMode: true, ws: false },
	});
	try {
		const error = await server.environments.ssr.transformRequest('/src/card.tsrx').then(
			() => undefined,
			(caught: unknown) => caught,
		);
		expect(String(error)).toContain('MARKLESS_DEV_TRANSFORM_STALLED');
		expect(String(error)).toContain('badge.tsrx');
	} finally {
		child.release();
		await server.close();
	}
}, 60_000);

test('the guard names every other transform still waited on when one stalls', async () => {
	const guard = createDevTransformGuard(50);
	// Started first, so its deadline passes while the second is still waited on.
	const stalled = guard('/src/stuck.tsrx', 'server', () => new Promise<never>(() => {}));
	const other = guard('/src/other.tsrx', 'client', () => new Promise<never>(() => {}));
	other.catch(() => {});
	await expect(stalled).rejects.toThrow(
		/MARKLESS_DEV_TRANSFORM_STALLED: Markless waited 50 ms for the server transform of "\/src\/stuck\.tsrx"[\s\S]*also waiting on:\n {2}client \/src\/other\.tsrx/,
	);
});

test('the guard passes a settled transform through, result or error', async () => {
	const guard = createDevTransformGuard(1000);
	await expect(guard('/a.tsrx', 'server', () => 'code')).resolves.toBe('code');
	await expect(
		guard('/b.tsrx', 'server', () => Promise.reject(new Error('compile failed'))),
	).rejects.toThrow('compile failed');
});

test('the stall deadline reads a positive number of milliseconds and falls back otherwise', () => {
	expect(devTransformStallMs('1500')).toBe(1500);
	for (const value of [undefined, '', '0', '-5', 'soon'])
		expect(devTransformStallMs(value)).toBe(DEV_TRANSFORM_STALL_MS);
});
