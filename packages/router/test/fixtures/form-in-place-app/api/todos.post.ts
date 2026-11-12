import type { EndpointHttpContext } from '@markless/router';
import { addTodoOnServer, slowNextRead } from '../src/todos.ts';

// Works with JavaScript off: a form body in, 303 back to the page the form was on, or to `?to=`.
export default async function addTodo({ request, url }: EndpointHttpContext): Promise<Response> {
	const type = request.headers.get('content-type') ?? '';
	const encoding = type.split(';')[0];
	let title = '';
	if (encoding === 'text/plain') title = (await request.text()).trim();
	else {
		const form = await request.formData();
		const file = form.get('file');
		title = typeof file === 'object' && file ? `${file.name} (${file.size} bytes)` : String(form.get('title') ?? '').trim();
	}
	if (!title) return new Response('A title is required.', { status: 422, headers: { 'content-type': 'text/plain' } });
	if (title.includes('broken')) return Response.json({ message: 'The shelf is full.' }, { status: 500 });
	if (url.searchParams.has('answer')) {
		addTodoOnServer(`${encoding}: ${title}`);
		return new Response('saved', { status: 200, headers: { 'content-type': 'text/plain' } });
	}
	if (title.includes('slow')) await new Promise((resolve) => setTimeout(resolve, 600));
	if (title.includes('wait')) slowNextRead();
	addTodoOnServer(url.searchParams.has('encoding') ? `${encoding}: ${title}` : title);
	const referer = request.headers.get('referer');
	const back = referer && new URL(referer).origin === url.origin ? new URL(referer).pathname : '/';
	return new Response(null, { status: 303, headers: { location: url.searchParams.get('to') ?? back } });
}
