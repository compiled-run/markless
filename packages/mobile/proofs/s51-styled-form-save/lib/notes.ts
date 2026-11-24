export type Note = { readonly id: string; readonly title: string };

export function readNotes(saved: string): ReadonlyArray<Note> {
	return JSON.parse(saved) as ReadonlyArray<Note>;
}

export function addNote(saved: string, title: string): string {
	const notes = readNotes(saved);
	return JSON.stringify([{ id: `n${notes.length + 1}`, title }, ...notes]);
}
