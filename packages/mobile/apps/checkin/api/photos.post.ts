import type { EndpointHttpContext } from '@markless/router';
import { keepPhoto } from '../server/photos.ts';

const MAX_BYTES = 5_000_000;

export default async function upload({ request }: EndpointHttpContext) {
	const type = request.headers.get('content-type') ?? '';
	if (!type.startsWith('image/'))
		return new Response('Only photos can be attached.', { status: 415 });
	const bytes = await request.arrayBuffer();
	if (bytes.byteLength > MAX_BYTES)
		return new Response('That photo is too large.', { status: 413 });
	return Response.json({ url: `/api/photos/${keepPhoto(type, bytes)}` }, { status: 201 });
}
