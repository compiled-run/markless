export type Draft = { id: string; title: string };
export type NestedDraft = { id: string; payload: { title: string } };

const saveLog: { id: string; title: string | undefined }[] = [];

export function resetSaveApi() {
	saveLog.length = 0;
}

export function saveCalls(id?: string) {
	return id ? saveLog.filter((call) => call.id === id) : saveLog.slice();
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function saveTodo(draft: { id: string; title: string } | undefined): Promise<{ id: string; title: string }> {
	saveLog.push({ id: draft?.id ?? '(no id)', title: draft?.title });
	await wait(5);
	if (!draft) throw new Error('saveTodo received no draft');
	return { id: draft.id, title: draft.title };
}
