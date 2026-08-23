import type { AnyNode } from '../../ast/nodes.ts';

/**
 * The DOM spelling of the `overlay` mark.
 *
 * The authored word is the emitted word: `<div overlay>` renders `<div
 * overlay>`. Two consumers need it there. Elevation is CSS the consumer writes,
 * and `[overlay]` is the selector they would guess; and the overlay behaviour
 * module reads stack membership off the element itself rather than off a payload
 * record, which is what lets one document observer serve a client render and a
 * resumed server render through the same code.
 *
 * Emitted only for the true spellings. `overlay={false}` is the absent case and
 * writes nothing, which is the difference between this deliberate lowering and
 * the accidental fall-through the MARKLESS_OVERLAY_VALUE_UNSUPPORTED diagnostic
 * exists to stop.
 */
export const OVERLAY_DOM_ATTRIBUTE = 'overlay';

/**
 * `true` for bare `overlay` and `overlay={true}`, `false` for `overlay={false}`,
 * and `null` for anything else - a non-literal the caller must refuse rather
 * than lower.
 */
export function overlayLiteralValue(
	value: AnyNode | undefined,
	expression: AnyNode | undefined,
): boolean | null {
	if (!value) return true;
	const literal = expression ?? value;
	if (literal.type === 'Literal' && typeof literal.value === 'boolean') return literal.value;
	return null;
}
