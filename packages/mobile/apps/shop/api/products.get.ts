import type { EndpointHttpContext } from '@markless/router';
import { productsIn } from '../server/catalog.ts';

export default function list({ url }: EndpointHttpContext) {
	try {
		return Response.json(productsIn(url.searchParams.get('category')));
	} catch (error) {
		return new Response((error as Error).message, { status: 503 });
	}
}
