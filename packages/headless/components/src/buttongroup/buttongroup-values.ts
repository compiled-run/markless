import type { ButtonGroupValue } from './buttongroup-types.ts';

/**
 * What is pressed, as a list, out of the raw cell the root seeded and a press
 * wrote over. The cell holds whichever shape the call site wrote because a
 * shared cell is seeded from a bare prop and nothing else, so every read
 * normalises here rather than trusting a shape.
 */
export function heldValues(held: ButtonGroupValue | undefined): readonly string[] {
	if (held === undefined) return [];
	if (typeof held === 'string') return held === '' ? [] : [held];
	return held;
}

/**
 * What is pressed after a press lands, or `undefined` when the press must not
 * land at all - a required group refuses to give up its last pressed value,
 * which is the segmented-control shape.
 */
export function nextHeld(
	held: readonly string[],
	pressed: string,
	multiple: boolean,
	required: boolean,
): readonly string[] | undefined {
	const wasPressed = held.indexOf(pressed) !== -1;
	if (!wasPressed) return multiple ? [...held, pressed] : [pressed];
	if (required && (!multiple || held.length === 1)) return undefined;
	return multiple ? held.filter((one) => one !== pressed) : [];
}
