import { readDelay, todosOnServer } from '../src/todos.ts';

export default async function todos(): Promise<Response> {
	await readDelay();
	return Response.json(todosOnServer(), { headers: { 'cache-control': 'no-store' } });
}
