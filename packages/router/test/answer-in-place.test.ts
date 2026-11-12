import { expect, test } from 'vitest';
import {
	IN_PLACE_LOCATION_HEADER,
	IN_PLACE_REQUEST_HEADER,
} from '@markless/web/fns/in-place-headers';
import { __marklessAnswerInPlace, __marklessRefuseCrossSiteWrite } from '../src/index.ts';

// A form Markless sends in place marks its request; the api/ wrapper answers that request's redirect without one.

const own = 'https://shop.example';
const event = (headers: Record<string, string>) => ({
	req: new Request(`${own}/api/cart`, { method: 'POST', headers }),
	url: new URL(`${own}/api/cart`),
});
const redirect = (status: number, location = '/cart') =>
	new Response(null, { status, headers: { location, 'set-cookie': 'flash=Added; Path=/' } });

test.each([301, 302, 303])(
	'a marked request’s %s becomes a body-less 200 with the location in a header and its cookies kept',
	async (status) => {
		const answer = __marklessAnswerInPlace(
			event({ [IN_PLACE_REQUEST_HEADER]: '1' }),
			redirect(status),
		) as Response;
		expect(answer.status).toBe(200);
		expect(answer.headers.get(IN_PLACE_LOCATION_HEADER)).toBe('/cart');
		expect(answer.headers.get('location')).toBeNull();
		expect(answer.headers.getSetCookie()).toEqual(['flash=Added; Path=/']);
		expect(await answer.text()).toBe('');
	},
);

test('an unmarked request, a 307 or 308 that repeats the POST, and an answer that is not a redirect are left as they are', () => {
	const unmarked = redirect(303);
	expect(__marklessAnswerInPlace(event({}), unmarked)).toBe(unmarked);
	for (const status of [307, 308]) {
		const repeats = redirect(status);
		expect(__marklessAnswerInPlace(event({ [IN_PLACE_REQUEST_HEADER]: '1' }), repeats)).toBe(
			repeats,
		);
	}
	const ok = new Response('saved');
	expect(__marklessAnswerInPlace(event({ [IN_PLACE_REQUEST_HEADER]: '1' }), ok)).toBe(ok);
	expect(
		__marklessAnswerInPlace(event({ [IN_PLACE_REQUEST_HEADER]: '1' }), { saved: true }),
	).toEqual({ saved: true });
});

test('the mark does not get a cross-site write past the guard, which runs first', () => {
	const marked = event({
		[IN_PLACE_REQUEST_HEADER]: '1',
		'sec-fetch-site': 'cross-site',
		origin: 'https://evil.example',
	});
	expect(__marklessRefuseCrossSiteWrite(marked)?.status).toBe(403);
});
