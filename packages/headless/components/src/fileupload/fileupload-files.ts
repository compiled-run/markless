import type { FileRecord } from './fileupload-types.ts';

// The `File` objects live here, not in the graph: a File is not a plain value and
// cannot be written into the page. One store per real `<input type="file">`, keyed
// by that element, so every handler on the same upload shares it and it goes away
// with the page. The graph keeps a mirror of plain records; this module is the
// only place that writes the DOM.

type Store = {
	transfer: DataTransfer;
	/** One id per file in `transfer`, same order. */
	ids: string[];
	minted: number;
};

const stores = new WeakMap<HTMLInputElement, Store>();

function storeFor(field: HTMLInputElement): Store {
	let store = stores.get(field);
	if (!store) {
		store = { transfer: new DataTransfer(), ids: [], minted: 0 };
		stores.set(field, store);
	}
	return store;
}

function recordsOf(store: Store): FileRecord[] {
	return [...store.transfer.files].map((file, index) => ({
		id: store.ids[index] ?? '',
		name: file.name,
		size: file.size,
		type: file.type,
		lastModified: file.lastModified,
	}));
}

// Assigning the input's own FileList is what makes a drop-only upload submit
// anything: files added by drop are never in `input.files` on their own.
function publish(field: HTMLInputElement, store: Store): FileRecord[] {
	field.files = store.transfer.files;
	return recordsOf(store);
}

function rebuild(store: Store, keep: readonly number[]): void {
	const files = [...store.transfer.files];
	const ids = store.ids;
	const transfer = new DataTransfer();
	const nextIds: string[] = [];
	for (const index of keep) {
		const file = files[index];
		if (!file) continue;
		transfer.items.add(file);
		nextIds.push(ids[index] ?? '');
	}
	store.transfer = transfer;
	store.ids = nextIds;
}

/**
 * Whether a file passes an `accept` list. The browser applies `accept` to the
 * picker but never to a drop, so a dropped file is filtered here or not at all.
 */
export function matchesAccept(file: File, accept: string): boolean {
	const patterns = accept
		.split(',')
		.map((one) => one.trim().toLowerCase())
		.filter(Boolean);
	if (patterns.length === 0) return true;

	const type = file.type.toLowerCase();
	const name = file.name.toLowerCase();
	return patterns.some((pattern) => {
		if (pattern.startsWith('.')) return name.endsWith(pattern);
		if (pattern.endsWith('/*')) return type.startsWith(`${pattern.slice(0, -1)}`);
		return type === pattern;
	});
}

/**
 * Takes files onto the upload and hands back the new record list. Appends when
 * `multiple`, replaces otherwise. Everything the `accept` list rejects is
 * dropped. Every argument is a plain value or the field itself, so a part's
 * handler can call it with what it read off the graph.
 */
export function addFiles(
	field: HTMLInputElement,
	incoming: readonly File[],
	multiple: boolean,
	accept: string,
): FileRecord[] {
	const store = storeFor(field);
	const allowed = incoming.filter((file) => matchesAccept(file, accept));
	// Still published: a picker choice the accept list rejected is on the field and
	// has to come back off it.
	if (allowed.length === 0) return publish(field, store);

	if (!multiple) {
		store.transfer = new DataTransfer();
		store.ids = [];
	}

	for (const file of multiple ? allowed : allowed.slice(0, 1)) {
		store.minted = store.minted + 1;
		store.transfer.items.add(file);
		store.ids.push(`file-${store.minted}`);
	}

	return publish(field, store);
}

/**
 * Takes whatever the picker just put on the field. The picker replaces the
 * field's own list wholesale, so it is read before anything is written back; the
 * store still holds what came before, which is what keeps an appending upload
 * appending.
 */
export function takePicked(
	field: HTMLInputElement,
	multiple: boolean,
	accept: string,
): FileRecord[] {
	return addFiles(field, [...(field.files ?? [])], multiple, accept);
}

/** Takes one file off the upload by its record id and hands back what is left. */
export function removeFile(field: HTMLInputElement, id: string): FileRecord[] {
	const store = storeFor(field);
	const keep = store.ids.map((one, index) => (one === id ? -1 : index)).filter((one) => one >= 0);
	if (keep.length === store.ids.length) return recordsOf(store);
	rebuild(store, keep);
	return publish(field, store);
}

/** Whether a pointer at these viewport coordinates is outside the element's box. */
export function pointerOutside(
	element: HTMLElement | undefined,
	clientX: number,
	clientY: number,
): boolean {
	if (!element) return true;
	const box = element.getBoundingClientRect();
	return (
		clientX < box.left || clientX >= box.right || clientY < box.top || clientY >= box.bottom
	);
}

/** Opens the OS file picker. `showPicker` is the modern route; older engines take the click. */
export function openPicker(field: HTMLInputElement): void {
	if (typeof field.showPicker === 'function') {
		field.showPicker();
		return;
	}
	field.click();
}
