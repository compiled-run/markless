import type { EndpointHttpContext } from '@markless/router';
import { setFailing } from '../src/items.ts';

export default function mode({ request }: EndpointHttpContext) {
	const failing = new URL(request.url).searchParams.get('fail') === '1';
	setFailing(failing);
	return { failing };
}
