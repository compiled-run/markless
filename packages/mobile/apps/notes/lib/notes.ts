export type Note = {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly tag: string;
	readonly pinned: boolean;
	readonly updated: string;
};

export type NoteDraft = Pick<Note, 'title' | 'body' | 'tag' | 'pinned'>;

export const TAGS = ['Personal', 'Work', 'Ideas', 'Shopping'] as const;

export function parseNotes(text: string): Note[] {
	try {
		const value: unknown = JSON.parse(text);
		return Array.isArray(value) ? (value as Note[]) : [];
	} catch {
		return [];
	}
}

export function sortNotes(notes: readonly Note[]): Note[] {
	return [...notes].sort(
		(a, b) => Number(b.pinned) - Number(a.pinned) || b.updated.localeCompare(a.updated),
	);
}

export function matches(note: Note, query: string): boolean {
	const needle = query.trim().toLowerCase();
	return (
		needle === '' ||
		note.title.toLowerCase().includes(needle) ||
		note.body.toLowerCase().includes(needle)
	);
}

export function excerpt(body: string | undefined): string {
	const line = (body ?? '').trim().split('\n')[0] ?? '';
	return line.length > 90 ? `${line.slice(0, 90)}…` : line;
}

export function paragraphs(body: string | undefined): string[] {
	return (body ?? '')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '');
}

export function formatDate(iso: string | undefined): string {
	const date = new Date(iso ?? '');
	return Number.isNaN(date.getTime())
		? ''
		: new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
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
	const id = Date.now().toString(36);
	const note: Note = { ...draft, id, updated: new Date().toISOString() };
	return { saved: JSON.stringify([note, ...parseNotes(saved)]), id };
}

export function updateNote(saved: string, id: string, draft: NoteDraft): string {
	return JSON.stringify(
		parseNotes(saved).map((note) =>
			note.id === id ? { ...note, ...draft, updated: new Date().toISOString() } : note,
		),
	);
}

export function removeNote(saved: string, id: string): string {
	return JSON.stringify(parseNotes(saved).filter((note) => note.id !== id));
}
