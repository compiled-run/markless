/**
 * The attribute positions where the platform expects an IDREF - an id string
 * naming another element - and where an element() handle is therefore valid.
 *
 * markless has no useId: an id has no render lifecycle to hook into, so there
 * is nothing to give the author. The author names the relationship instead
 * (`<span el={label}>` over there, `aria-labelledby={label}` over here) and the
 * consuming emitter mints the id. That is why this is a set of positions rather
 * than a value type: the same handle is a DOM locator in `attach=` and an
 * identity here, and only the position tells them apart.
 *
 * One constant so the set can grow in one edit. `aria-activedescendant` is
 * deliberately absent: it names one row of a live collection, which needs
 * per-row identity that this slice does not build. Adding it here without that
 * work would resolve one authored handle to N row elements.
 */
export const IDREF_ATTRIBUTES: ReadonlySet<string> = new Set([
	'aria-labelledby',
	'aria-controls',
	'aria-describedby',
	'popovertarget',
	'for',
]);

export function isIdrefAttribute(attributeName: string): boolean {
	return IDREF_ATTRIBUTES.has(attributeName);
}

/**
 * The IDREF positions HTML defines as a space-separated LIST of ids, so a static
 * array of handles is a richer relationship there rather than a broken value. A
 * description and an error are separate elements, and one control has to be able
 * to name both.
 *
 * `popovertarget` and `for` are deliberately absent: both take exactly one id,
 * and a list written there is a dangling attribute no browser resolves.
 */
export const IDREF_LIST_ATTRIBUTES: ReadonlySet<string> = new Set([
	'aria-labelledby',
	'aria-controls',
	'aria-describedby',
]);

export function acceptsIdrefList(attributeName: string): boolean {
	return IDREF_LIST_ATTRIBUTES.has(attributeName);
}

/**
 * Attribute spellings of CSS anchor positioning. They are not HTML attributes,
 * so they are refused rather than written: the set exists to name what the
 * compiler must reject, not a position it fills.
 */
export const CSS_ANCHOR_ATTRIBUTES: ReadonlySet<string> = new Set([
	'anchorName',
	'positionAnchor',
]);

export function isCssAnchorAttribute(attributeName: string): boolean {
	return CSS_ANCHOR_ATTRIBUTES.has(attributeName);
}
