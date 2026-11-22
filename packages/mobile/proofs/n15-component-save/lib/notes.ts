export const TAGS = ['Personal', 'Work', 'Ideas', 'Shopping'] as const;
export type NoteDraft = { readonly title: string; readonly body: string; readonly tag: string; readonly pinned: boolean };
export type Note = NoteDraft & { readonly id: string };

export function parseNotes(text: string): Note[] {
	const parsed: unknown = JSON.parse(text);
	return Array.isArray(parsed) ? (parsed as Note[]) : [];
}

export function draftFrom(form: HTMLFormElement): NoteDraft {
	const data = new FormData(form);
	return {
		title: String(data.get('title') ?? '').trim(),
		body: String(data.get('body') ?? ''),
		tag: String(data.get('tag') ?? TAGS[0]),
		pinned: data.get('pinned') === 'on',
	};
}

export function addNote(saved: string, draft: NoteDraft): { saved: string; id: string } {
	const notes = parseNotes(saved);
	const id = `n${notes.length + 1}`;
	return { saved: JSON.stringify([{ ...draft, id }, ...notes]), id };
}
