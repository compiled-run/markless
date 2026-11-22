// One DataTransfer per element, kept across presses: the element's proxy is the same object in every handler.
const stores = new WeakMap<object, DataTransfer>();

/** Adds a note file to the element's store and describes every file it holds. */
export function addNote(field: object): string {
	let held = stores.get(field);
	if (!held) {
		held = new DataTransfer();
		stores.set(field, held);
	}
	held.items.add(new File(['hello'], `note-${held.items.length + 1}.txt`, { type: 'Text/Plain' }));
	return [...held.files].map((file) => `${file.name} ${file.size} ${file.type}`).join(', ');
}
