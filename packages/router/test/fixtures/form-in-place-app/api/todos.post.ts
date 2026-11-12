import type { EndpointHttpContext } from '@markless/router';
import { waitAt } from '../src/gates.ts';
import { addTodoOnServer, holdNextRead } from '../src/todos.ts';

// Works with JavaScript off: a form body in, 303 back to the page the form was on, or to `?to=`.
export default async function addTodo({ request, url }: EndpointHttpContext): Promise<Response> {
	const encoding = (request.headers.get('content-type') ?? '').split(';')[0];
	let title = '';
	let suffix = '';
	if (encoding === 'text/plain') title = await request.text();
	else {
		const form = await request.formData();
		const file = form.get('file');
		title =
			typeof file === 'object' && file
				? `${file.name} (${file.size} bytes)`
				: String(form.get('title') ?? '');
		if (form.get('action')) suffix = ` [${form.get('action')}]`;
		if (url.searchParams.has('list')) title = `${url.searchParams.get('list')}: ${title}`;
	}
	// Line breaks shown, so a test sees how the browser encoded them.
	title = title.trim().replace(/\r\n/g, '⏎').replace(/\n/g, '↵') + suffix;
	if (!title)
		return new Response('A title is required.', {
			status: 422,
			headers: { 'content-type': 'text/plain' },
		});
	if (title.includes('broken'))
		return Response.json({ message: 'The shelf is full.' }, { status: 500 });
	if (title.includes('slow')) await waitAt('post');
	if (title.includes('wait')) holdNextRead();
	const shown =
		url.searchParams.has('encoding') || url.searchParams.has('answer')
			? `${encoding}: ${title}`
			: title;
	addTodoOnServer(shown);
	if (url.searchParams.has('answer'))
		return new Response('saved', { status: 200, headers: { 'content-type': 'text/plain' } });
	const referer = request.headers.get('referer');
	const back =
		referer && new URL(referer).origin === url.origin ? new URL(referer).pathname : '/';
	const headers = new Headers({ location: url.searchParams.get('to') ?? back });
	if (title.includes('flash'))
		headers.append('set-cookie', `flash=${encodeURIComponent(`Added ${title}`)}; Path=/`);
	return new Response(null, { status: 303, headers });
}
