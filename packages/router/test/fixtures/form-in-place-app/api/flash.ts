import type { EndpointHttpContext } from '@markless/router';

// A one-time message: read once, then cleared.
export default function flash({ request }: EndpointHttpContext): Response {
	const cookie = /(?:^|;\s*)flash=([^;]*)/.exec(request.headers.get('cookie') ?? '');
	return new Response(cookie ? decodeURIComponent(cookie[1]!) : '', {
		headers: {
			'content-type': 'text/plain',
			'cache-control': 'no-store',
			'set-cookie': 'flash=; Path=/; Max-Age=0',
		},
	});
}
