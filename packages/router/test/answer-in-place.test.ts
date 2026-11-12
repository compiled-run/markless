import { expect, test } from 'vitest';
import {
	IN_PLACE_LOCATION_HEADER,
	IN_PLACE_REQUEST_HEADER,
} from '@markless/web/fns/in-place-headers';
import { __marklessAnswerInPlace, __marklessRefuseCrossSiteWrite } from '../src/index.ts';

// A form Markless sends in place marks its request; the api/ wrapper answers that request's redirect without one.

const own = 'https://shop.example';
const event = (headers: Record<string, string>, method = 'POST') => ({
	req: new Request(`${own}/api/cart`, { method, headers }),
	url: new URL(`${own}/api/cart`),
});
const marked = { [IN_PLACE_REQUEST_HEADER]: '1' };
const redirect = (status: number, location = '/cart') =>
	new Response('<a href="/cart">moved</a>', {
		status,
		headers: {
			location,
			'set-cookie': 'flash=Added; Path=/',
			'cache-control': 'public, max-age=600',
			'content-length': '25',
			'content-encoding': 'identity',
			vary: 'accept',
		},
	});

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

test('a GET, HEAD or OPTIONS with the mark gets the redirect untouched: only the POST Markless sends is answered', () => {
	for (const method of ['GET', 'HEAD', 'OPTIONS']) {
		const moved = redirect(303);
		expect(__marklessAnswerInPlace(event(marked, method), moved)).toBe(moved);
	}
});

test('a location that is not a web address keeps its redirect, so no javascript: or data: address reaches the page', () => {
	for (const location of ['javascript:alert(1)', 'data:text/html,<p>hi</p>', 'JavaScript:void(0)']) {
		const moved = redirect(303, location);
		expect(__marklessAnswerInPlace(event(marked), moved)).toBe(moved);
	}
	const elsewhere = __marklessAnswerInPlace(event(marked), redirect(303, 'https://pay.example/checkout')) as Response;
	expect(elsewhere.headers.get(IN_PLACE_LOCATION_HEADER)).toBe('https://pay.example/checkout');
});

test('h3’s redirect(), which answers with its own response class, is answered in place too', () => {
	// The shape h3 2's redirect() returns: a status, a Headers object and a string body, not a Response.
	const h3Redirect = { status: 302, statusText: 'Found', body: '<html></html>', headers: new Headers({ location: '/cart' }) };
	const answer = __marklessAnswerInPlace(event(marked), h3Redirect) as Response;
	expect(answer).toBeInstanceOf(Response);
	expect(answer.status).toBe(200);
	expect(answer.headers.get(IN_PLACE_LOCATION_HEADER)).toBe('/cart');
});
