import type { EndpointHttpContext } from '@markless/router';

// Answers as the phones' echo server does (`<method> <path and query> <content type> <body>`), so both columns read the same.
export default function greeting({ request }: EndpointHttpContext) {
	const url = new URL(request.url);
	return new Response(`${request.method} ${url.pathname}${url.search} - `);
}
