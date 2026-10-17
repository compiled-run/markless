import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';

// A built router app whose pages read the server-only `http` prop.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];
let origin = '';
let close: (() => void) | undefined;

async function fixtureCopy(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'markless-page-http-app-'));
	roots.push(root);
	await cp(resolve(import.meta.dirname, '../fixtures/page-http-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		resolve(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	return root;
}

async function build(root: string): Promise<void> {
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless(), router()],
	});
	await builder.buildApp();
}

beforeAll(async () => {
	const root = await fixtureCopy();
	await build(root);
	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	origin = server.origin;
	close = () => server.close();
}, 240_000);

afterAll(async () => {
	close?.();
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

test('a page for a missing record answers 404 with its own body and headers', async () => {
	const response = await fetch(`${origin}/invoices/missing`, {
		headers: { cookie: 'session=top-secret' },
	});
	const html = await response.text();

	expect(response.status).toBe(404);
	expect(response.headers.get('x-invoice')).toBe('missing');
	expect(response.headers.get('cache-control')).toBe('no-store');
	expect(html).toContain('No invoice missing');
	expect(html).toContain('<p data-request-id="">mw-1</p>');
	const payload = /<script type="markless\/state">(.*?)<\/script>/.exec(html)?.[1] ?? '';
	expect(payload).toContain('["params",');
	expect(payload).not.toContain('"http"');
	expect(html).not.toContain('top-secret');
});

test('a page for a present record answers 200 with the header it set', async () => {
	const response = await fetch(`${origin}/invoices/7`);

	expect(response.status).toBe(200);
	expect(response.headers.get('x-invoice')).toBe('7');
	expect(response.headers.get('cache-control')).toBeNull();
	expect(await response.text()).toContain('Invoice INV-0007');
});

test('a status write after the response started streaming raises the named error', async () => {
	const response = await fetch(`${origin}/late`);
	expect(response.status).toBe(200);
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let html = '';
	while (!html.includes('data-pending')) {
		const chunk = await reader.read();
		expect(chunk.done).toBe(false);
		html += decoder.decode(chunk.value, { stream: true });
	}

	expect(await (await fetch(`${origin}/api/release-late-write`)).json()).toEqual({
		released: true,
	});
	for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
		html += decoder.decode(chunk.value, { stream: true });

	expect(html).toContain('MARKLESS_ROUTER_RESPONSE_COMMITTED');
});

test('a page whose browser code reads http does not build', async () => {
	const root = await fixtureCopy();
	await writeFile(
		join(root, 'pages/leak.tsrx'),
		`import type { PageProps } from '@markless/router';

export default function Leak({ http }: PageProps) @{
	<button type="button" onClick={() => console.log(http.request.headers.get('cookie'))}>Leak</button>
}
`,
	);

	await expect(build(root)).rejects.toThrow(/MARKLESS_SERVER_ONLY_PROP_BROWSER_READ/);
}, 240_000);
