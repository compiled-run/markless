import { rm, writeFile } from 'node:fs/promises';
import { join } from 'pathe';
import { expect, test, vi } from 'vitest';
import { __marklessRefuseCrossSiteWrite } from '../src/index.ts';
import { transformRequestFileSource } from '../src/request-files.ts';

const own = 'https://shop.example';

const refused = (method: string, headers: Record<string, string>) =>
	__marklessRefuseCrossSiteWrite({
		req: new Request(`${own}/api/cart`, { method, headers }),
		url: new URL(`${own}/api/cart`),
	});

test.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
	'a %s the browser marks cross-site or same-site is refused with 403',
	async (method) => {
		for (const site of ['cross-site', 'same-site']) {
			const response = refused(method, { 'sec-fetch-site': site, origin: 'https://evil.example' });
			expect(response?.status).toBe(403);
			expect((await response?.text())?.startsWith('MARKLESS_ROUTER_CROSS_SITE_WRITE_REFUSED: ')).toBe(
				true,
			);
		}
	},
);

test.each(['POST', 'PUT', 'PATCH', 'DELETE'])('a %s the browser marks same-origin or none passes', (method) => {
	expect(refused(method, { 'sec-fetch-site': 'same-origin', origin: own })).toBeUndefined();
	expect(refused(method, { 'sec-fetch-site': 'none' })).toBeUndefined();
});

test('without Sec-Fetch-Site, Origin decides: another origin is refused, the own origin passes', () => {
	expect(refused('POST', { origin: 'https://evil.example' })?.status).toBe(403);
	expect(refused('POST', { origin: 'null' })?.status).toBe(403);
	expect(refused('POST', { origin: 'http://shop.example' })?.status).toBe(403);
	expect(refused('POST', { origin: own })).toBeUndefined();
});

test('a write with neither header, as curl or another server sends it, passes', () => {
	expect(refused('POST', {})).toBeUndefined();
	expect(refused('DELETE', {})).toBeUndefined();
});

test.each(['GET', 'HEAD', 'OPTIONS'])('a cross-site %s always passes', (method) => {
	expect(
		refused(method, { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }),
	).toBeUndefined();
	expect(refused(method, { origin: 'https://evil.example' })).toBeUndefined();
});

test('the own origin comes from the request when the event carries no parsed URL', () => {
	const request = new Request(`${own}/api/cart`, { method: 'POST', headers: { origin: own } });
	expect(__marklessRefuseCrossSiteWrite({ req: request })).toBeUndefined();
});

test('a cached endpoint refuses a cross-site write before its cache can answer', async () => {
	const stored = Response.json({ stored: true });
	vi.doMock('nitro', () => ({ defineHandler: (handler: unknown) => handler }));
	vi.doMock('nitro/cache', () => ({ defineCachedHandler: () => () => stored }));
	const wrapper = transformRequestFileSource(
		'api/tally.post.ts',
		'export const cache = { maxAge: 60 };\nexport default function tally() { return { live: true }; }',
	)!.code;
	const file = join(import.meta.dirname, `.cached-endpoint-${process.pid}.ts`);
	await writeFile(file, wrapper);
	try {
		const { default: handler } = (await import(/* @vite-ignore */ file)) as {
			default: (event: { req: Request; url: URL }) => Response;
		};
		const send = (headers: Record<string, string>) =>
			handler({
				req: new Request(`${own}/api/tally`, { method: 'POST', headers }),
				url: new URL(`${own}/api/tally`),
			});
		expect(send({ 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }).status).toBe(403);
		expect(send({ 'sec-fetch-site': 'same-origin', origin: own })).toBe(stored);
	} finally {
		await rm(file, { force: true });
		vi.doUnmock('nitro');
		vi.doUnmock('nitro/cache');
	}
});
