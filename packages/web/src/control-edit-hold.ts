/**
 * What a form control read like when the dispatch that is about to commit began.
 *
 * A dispatch is asynchronous, so a person typing fast lands more keystrokes
 * between the handler reading the field and the graph flush writing a bound
 * `value` back onto it. Those keystrokes are text the handler never saw: writing
 * the handler's answer over them rewinds the field and silently swallows what
 * was typed, and the events still queued behind it then read the rewound text.
 * The write is held instead, and the dispatch for the keystroke that moved the
 * control writes the settled answer.
 */

const EDITED_PROPERTIES = ['value', 'checked'] as const;

type ControlLike = Record<string, unknown>;

const EDITABLE_TAG = /^(?:input|textarea|select)$/i;

// One note per dispatch still running on the control, oldest first.
const noted = new WeakMap<ControlLike, Array<Map<string, unknown>>>();

export function marklessEditableControl(target: unknown): ControlLike | undefined {
	if (!target || typeof target !== 'object') return undefined;
	const element = target as ControlLike & {
		readonly tagName?: unknown;
		readonly isContentEditable?: unknown;
	};
	return element.isContentEditable === true ||
		(typeof element.tagName === 'string' && EDITABLE_TAG.test(element.tagName))
		? element
		: undefined;
}

/**
 * Remember what this dispatch's own control read like before its handlers run,
 * and hand back the release its commit closes with.
 */
export function marklessNoteControlEdits(target: unknown, event?: object): () => void {
	if (event && arrived.has(event)) return noRelease;
	const element = marklessEditableControl(target);
	if (!element) return noRelease;
	let properties: Map<string, unknown> | undefined;
	for (const name of EDITED_PROPERTIES) {
		const live = element[name];
		if (typeof live !== 'string' && typeof live !== 'boolean') continue;
		(properties ??= new Map()).set(name, live);
	}
	if (!properties) return noRelease;
	const notes = noted.get(element) ?? [];
	notes.push(properties);
	noted.set(element, notes);
	return () => {
		notes.splice(notes.indexOf(properties) >>> 0, 1);
		if (!notes.length) noted.delete(element);
	};
}

function noRelease(): void {}

// A note taken as its event arrives holds every write that changes the control until a handler reads the edit.
const arrived = new WeakMap<object, Map<string, unknown>>();
const unread = new WeakSet<Map<string, unknown>>();

export function marklessNoteArrivingControlEdits(event: { readonly target?: unknown }): () => void {
	const release = marklessNoteControlEdits(event.target);
	const properties = noted.get(event.target as ControlLike)?.at(-1);
	if (release === noRelease || !properties) return release;
	arrived.set(event, properties);
	unread.add(properties);
	return () => {
		arrived.delete(event);
		release();
	};
}

export function marklessControlEditsRead(event: object): void {
	const properties = arrived.get(event);
	if (properties) unread.delete(properties);
}

/**
 * Whether writing `name` would discard edits made since the handlers ran.
 *
 * A write that matches the newest dispatch's note is the ordinary case and
 * refreshes the note, so a second write in the same commit is judged against it.
 * One that changes the control while an earlier dispatch runs may answer older text.
 */
export function marklessControlWriteHeld(target: unknown, name: string, value: unknown): boolean {
	const notes = noted.get(target as ControlLike);
	const newest = notes?.[notes.length - 1];
	if (!newest?.has(name)) return false;
	const live = (target as ControlLike)[name];
	if (live !== newest.get(name)) return true;
	if (value !== live && unread.has(newest)) return true;
	if (
		value !== live &&
		notes!.some((note) => note !== newest && note.has(name) && note.get(name) !== live)
	)
		return true;
	newest.set(name, value);
	return false;
}
