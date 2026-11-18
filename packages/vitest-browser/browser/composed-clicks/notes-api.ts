export type Note = { readonly id: string; readonly title: string; readonly likes: number };

const seed: ReadonlyArray<Note> = [
	{ id: 'a', title: 'Bake sale', likes: 1 },
	{ id: 'b', title: 'Lost cat', likes: 4 },
];
let notes: Note[] = [...seed];
const later = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 20));

export function resetNotes(): void {
	notes = [...seed];
}

export const loadNotes = () => later(notes.map((note) => ({ ...note })));

export function likeNote(id: string) {
	notes = notes.map((note) => (note.id === id ? { ...note, likes: note.likes + 1 } : note));
	return later(true);
}

export function addNote(title: string) {
	notes = [...notes, { id: 'n' + notes.length, title, likes: 0 }];
	return later(true);
}
