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

const noted = new WeakMap<ControlLike, Map<string, unknown>>();

function editableControl(target: unknown): ControlLike | undefined {
	if (!target || typeof target !== 'object') return undefined;
	const element = target as ControlLike & {
		readonly tagName?: unknown;
		readonly isContentEditable?: unknown;
	};
	const tagName = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
	if (
		element.isContentEditable !== true &&
		tagName !== 'INPUT' &&
		tagName !== 'TEXTAREA' &&
		tagName !== 'SELECT'
	)
		return undefined;
	return element;
}

/**
 * Remember what this dispatch's own control read like before its handlers run,
 * and hand back the release its commit closes with. Overlapping dispatches each
 * release only what they noted, so one ending does not drop another's note.
 */
export function marklessNoteControlEdits(target: unknown): () => void {
	const element = editableControl(target);
	if (!element) return noRelease;
	let properties: Map<string, unknown> | undefined;
	for (const name of EDITED_PROPERTIES) {
		const live = element[name];
		if (typeof live !== 'string' && typeof live !== 'boolean') continue;
		(properties ??= new Map()).set(name, live);
	}
	if (!properties) return noRelease;
	const held = noted.get(element);
	noted.set(element, properties);
	return () => {
		if (noted.get(element) !== properties) return;
		if (held) noted.set(element, held);
		else noted.delete(element);
	};
}

function noRelease(): void {}

/**
 * Whether writing `name` would discard edits made since the handlers ran.
 *
 * A write that matches what was noted is the ordinary case and refreshes the
 * note, so a second write in the same commit is judged against it.
 */
export function marklessControlWriteHeld(target: unknown, name: string, value: unknown): boolean {
	const properties = noted.get(target as ControlLike);
	if (!properties?.has(name)) return false;
	const live = (target as ControlLike)[name];
	if (live !== properties.get(name)) return true;
	properties.set(name, value);
	return false;
}
