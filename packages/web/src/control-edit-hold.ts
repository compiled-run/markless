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
export function marklessNoteControlEdits(target: unknown): () => void {
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

// Edit events no handler has read yet, per control: a write that changes the control would rewind their text, so it is held.
const arrived = new WeakMap<object, ControlLike>();
const unread = new WeakMap<ControlLike, Set<object>>();
// What each control last took from a flush, which tells a person's edit from an event that replays nothing.
const written = new WeakMap<ControlLike, Map<string, unknown>>();

export function marklessNoteArrivingControlEdits(event: {
	readonly type?: string;
	readonly target?: unknown;
}): () => void {
	const element =
		/^(?:input|change)$/.test(event.type ?? '') && marklessEditableControl(event.target);
	if (!element || !edited(element)) return noRelease;
	arrived.set(event, element);
	unread.set(element, (unread.get(element) ?? new Set()).add(event));
	return () => marklessControlEditsRead(event);
}

export function marklessControlEditsRead(event: object): void {
	const element = arrived.get(event);
	const events = element && unread.get(element);
	if (events?.delete(event) && !events.size) unread.delete(element!);
}

// What the control last took from the page: its last flush write, or the markup it was drawn with.
function settledValue(element: ControlLike, name: string): unknown {
	const last = written.get(element);
	return last?.has(name)
		? last.get(name)
		: element[name === 'value' ? 'defaultValue' : 'defaultChecked'];
}

function edited(element: ControlLike): boolean {
	return EDITED_PROPERTIES.some((name) => {
		const live = element[name];
		return (
			(typeof live === 'string' || typeof live === 'boolean') &&
			live !== settledValue(element, name)
		);
	});
}

/**
 * Whether writing `name` would discard edits made since the handlers ran.
 *
 * A write that matches the newest dispatch's note is the ordinary case and
 * refreshes the note, so a second write in the same commit is judged against it.
 * One that changes the control while an earlier dispatch runs may answer older text.
 */
export function marklessControlWriteHeld(target: unknown, name: string, value: unknown): boolean {
	// A value the control already took is no change, and writing it again would undo what was typed since.
	if (
		(name === 'value' || name === 'checked') &&
		Object.is(value, settledValue(target as ControlLike, name))
	)
		return true;
	if (heldForUnread(target as ControlLike, name, value)) return true;
	const notes = noted.get(target as ControlLike);
	const newest = notes?.[notes.length - 1];
	if (!newest?.has(name)) return false;
	const live = (target as ControlLike)[name];
	if (live !== newest.get(name)) return true;
	if (
		value !== live &&
		notes!.some((note) => note !== newest && note.has(name) && note.get(name) !== live)
	)
		return true;
	newest.set(name, value);
	return false;
}

function heldForUnread(target: ControlLike, name: string, value: unknown): boolean {
	if (unread.get(target)?.size && target[name] !== value) return true;
	if ((EDITED_PROPERTIES as ReadonlyArray<string>).includes(name))
		(written.get(target) ?? written.set(target, new Map()).get(target)!).set(name, value);
	return false;
}
