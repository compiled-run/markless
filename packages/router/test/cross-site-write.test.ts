import { expect, test } from 'vitest';
import { __marklessRefuseCrossSiteWrite } from '../src/index.ts';

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
