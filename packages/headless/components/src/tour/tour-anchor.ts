/**
 * The family's imperative writes onto an element it did not render, reached
 * through the handle the consumer bound to it.
 *
 * A `<style>` block cannot do this: the scope class is minted only onto elements
 * the module renders, so no rule here reaches a consumer's button. An attribute
 * cannot either - nothing spreads props into a page element the family never
 * wrote. A write through a handle the consumer handed over is not a lookup, and
 * it is what Fluent UI's tooltip does for its own anchor element.
 *
 * `setProperty` rather than `style.anchorName`, because the DOM lib in this tree
 * does not declare the typed property yet.
 */

/** The one anchor name the card and the spotlight both point at. */
export const TOUR_ANCHOR = '--tour-target';

/**
 * What each named element carried before, so leaving a step can put it back.
 * Keyed by the element, so two tours on one page never read each other's record
 * - though see the note: they still collide on the name itself.
 */
const restore = new WeakMap<HTMLElement, string>();

/**
 * Name the current step's target.
 *
 * The existing value is kept in front of ours rather than clobbered: `anchor-name`
 * takes a list, so a consumer who already anchored their own button keeps that
 * anchor working and the card still finds `--tour-target`.
 */
export function nameTarget(target: HTMLElement | undefined): void {
	if (!(target instanceof HTMLElement)) return;
	if (restore.has(target)) return;

	const existing = target.style.getPropertyValue('anchor-name').trim();
	restore.set(target, existing);
	const kept = existing !== '' && existing !== 'none';
	target.style.setProperty('anchor-name', kept ? `${existing}, ${TOUR_ANCHOR}` : TOUR_ANCHOR);
}

/** Put back whatever the target carried before the step named it. */
export function releaseTarget(target: HTMLElement | undefined): void {
	if (!(target instanceof HTMLElement)) return;

	const before = restore.get(target);
	if (before === undefined) return;
	restore.delete(target);
	if (before === '') target.style.removeProperty('anchor-name');
	else target.style.setProperty('anchor-name', before);
}

/**
 * Bring the target on screen.
 *
 * `instant` because a smooth scroll racing a step change leaves the spotlight
 * chasing, and `nearest` twice because a target already on screen must not be
 * yanked to the middle. On the anchored path the order against the anchor write
 * does not matter: the engine re-resolves `anchor()` after the scroll.
 */
export function revealTarget(target: HTMLElement | undefined): void {
	if (!(target instanceof HTMLElement)) return;
	target.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' });
}

/** Where a step lands after `direction`, clamped at the ends unless the tour loops. */
export function stepAfter(step: number, direction: number, count: number, loop: boolean): number {
	const last = count - 1;
	if (last < 0) return 0;
	const next = step + direction;
	if (next > last) return loop ? 0 : last;
	if (next < 0) return loop ? last : 0;
	return next;
}
