// Stand-ins: the list answers on the server after its first flush, so the @try streams; the save waits for the test.
export type Todo = { id: string; text: string };

const realm = globalThis as { __savingRow?: Array<() => void> };
const STREAMED_AFTER_MS = 60;

export async function loadTodos(): Promise<Todo[]> {
	await new Promise((resolve) => setTimeout(resolve, typeof window === 'undefined' ? STREAMED_AFTER_MS : 5));
	return [{ id: 'a', text: 'Buy milk' }];
}

export function saveTodo(text: string): Promise<Todo> {
	return new Promise((resolve) => {
		(realm.__savingRow ??= []).push(() => resolve({ id: text, text }));
	});
}

export function answerSaves(): void {
	for (const settle of realm.__savingRow?.splice(0) ?? []) settle();
}
