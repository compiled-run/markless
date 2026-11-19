import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { buildFixture } from '../support/fixture-build.ts';

// Three components on every page import three stylesheets that share a font face, keyframes and rules.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-css-repeats-'));
	await cp(resolve(import.meta.dirname, '../fixtures/css-repeats-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const nodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = 'production';
	try {
		await buildFixture({ root });
	} finally {
		if (nodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = nodeEnv;
	}
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
});

afterAll(async () => {
	server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

const count = (text: string, mark: string) => text.split(mark).length - 1;

async function clientStylesheets(): Promise<string[]> {
	const files = await readdir(join(root, '.output/public'), { recursive: true });
	return Promise.all(
		files
			.filter((file) => file.endsWith('.css'))
			.map((file) => readFile(join(root, '.output/public', file), 'utf8')),
	);
}

test('the stylesheet the shared components merge into holds each repeated block once', async () => {
	const merged = (await clientStylesheets()).filter((css) => css.includes('repeat-probe.woff2'));
	expect(merged.length).toBeGreaterThan(0);
	for (const css of merged) {
		for (const mark of ['--alpha-mark', '--beta-mark', '--gamma-mark']) expect(count(css, mark)).toBe(1);
		expect(count(css, 'repeat-probe.woff2')).toBe(1);
		expect(count(css, '@keyframes repeat-probe-spin')).toBe(1);
		expect(count(css, '--repeat-probe-mark')).toBe(1);
		expect(count(css, '--repeat-probe-rule')).toBe(1);
		// Alpha's and Beta's sheets both @import it.
		expect(count(css, '--imported-mark')).toBe(1);
		// Alpha's and Beta's scoped .badge rules are the same text under different scope classes.
		expect(count(css, '--badge-mark')).toBe(2);
	}
});

test('a page carries each repeated block once', async () => {
	for (const path of ['/', '/other']) {
		const html = await (await fetch(`${server!.origin}${path}`)).text();
		expect(count(html, 'repeat-probe.woff2')).toBe(1);
		expect(count(html, '@keyframes repeat-probe-spin')).toBe(1);
		expect(count(html, '--badge-mark')).toBe(2);
	}
});
