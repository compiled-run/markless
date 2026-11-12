import type { EndpointHttpContext } from '@markless/router';
import { release } from '../src/gates.ts';

export default function open({ url }: EndpointHttpContext): Response {
	release(url.searchParams.get('gate') ?? '');
	return new Response('released');
}
