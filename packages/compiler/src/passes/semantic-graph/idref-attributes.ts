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
