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
 * The attribute positions that name an element() handle as a CSS anchor, and
 * the inline style property each one lowers to.
 *
 * Same identity as an IDREF, second rendering: an IDREF spells the handle as
 * `mx-<slug>` in an id attribute, an anchor position spells the SAME slug as
 * the `--mx-<slug>` dashed-ident CSS anchor positioning needs. Neither is a
 * string the author ever writes.
 *
 * The value has to reach CSS as a dashed-ident, which rules out both other
 * carriers: a custom property inherits, so a select nested in a modal would
 * pick up the outer widget's anchor, and CSS cannot cast an attribute string to
 * a dashed-ident (`attr()` with a type argument is Values 5 and Chromium-only).
 * An inline style declaration applies to exactly one element and needs no
 * consumer plumbing, so that is what these lower to.
 */
export const ANCHOR_STYLE_ATTRIBUTES: ReadonlyMap<string, string> = new Map([
	['anchorName', 'anchor-name'],
	['positionAnchor', 'position-anchor'],
]);

export function anchorStyleProperty(attributeName: string): string | undefined {
	return ANCHOR_STYLE_ATTRIBUTES.get(attributeName);
}
