import { readGate, todosOnServer } from '../src/todos.ts';

export default async function todos(): Promise<Response> {
	await readGate();
	return Response.json(todosOnServer(), { headers: { 'cache-control': 'no-store' } });
}
