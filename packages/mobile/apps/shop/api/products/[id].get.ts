import type { EndpointHttpContext } from '@markless/router';
import { product } from '../../server/catalog.ts';

export default function one({ params }: EndpointHttpContext<{ id: string }>) {
	const found = product(params.id);
	return found ? Response.json(found) : new Response('No such product.', { status: 404 });
}
