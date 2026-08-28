/**
 * The roster is a plural `element()` handle the bar binds and every registering
 * control writes into, so the order it reads back is registration order, not
 * necessarily page order: a control of another family binds it from that
 * family's own component. `compareDocumentPosition` on the registered handles
 * is what turns it back into document order - a predicate over elements the
 * family already holds, never a lookup.
 */

const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING

type Roster = ReadonlyArray<HTMLElement>;

/** The registered controls in document order. */
export function orderedRoster(items: Roster | undefined | unknown): HTMLElement[] {
	if (!Array.isArray(items) || items.length === 0) return [];
	const registered = items.filter((one): one is HTMLElement => one instanceof HTMLElement);
	return registered.sort((left, right) => {
		if (left === right) return 0;
		return (left.compareDocumentPosition(right) & FOLLOWING) !== 0 ? -1 : 1;
	});
}

/**
 * Whether an arrow may land here. A natively disabled control cannot take focus
 * at all, so walking onto it would swallow the key; one that is only
 * `aria-disabled` stays a destination, which is the APG toolbar rule and what
 * `toolbar.item disabled` renders.
 */
export function isWalkable(control: HTMLElement): boolean {
	return (control as Partial<HTMLButtonElement>).disabled !== true;
}

/** Where the bar's tab stop sits: the active position, clamped onto a walkable control. */
export function stopIndex(roster: readonly HTMLElement[], active: number): number {
	if (roster.length === 0) return -1;
	const at = active >= 0 && active < roster.length ? active : 0;
	if (isWalkable(roster[at] as HTMLElement)) return at;
	const firstWalkable = roster.findIndex(isWalkable);
	return firstWalkable === -1 ? at : firstWalkable;
}

/**
 * Write the roving tab stop across the roster. The bar does this from its own
 * handlers because a handle cannot be read while deriving
 * (MARKLESS_ELEMENT_HANDLE_UNBOUND), so no control can render the stop itself:
 * a control has no way to compare itself to the roster at render time. Setting
 * `tabIndex` on elements the family already holds is a write, not a lookup.
 */
export function applyStops(roster: readonly HTMLElement[], active: number): void {
	const stop = stopIndex(roster, active);
	for (let index = 0; index < roster.length; index++)
		(roster[index] as HTMLElement).tabIndex = index === stop ? 0 : -1;
}

/**
 * The bar's answer to a movement key: the position the stop moves to, or
 * `undefined` for "not ours, or nowhere to go". Off the ends the walk stays put
 * - the bar does not wrap, following `tabs` and `buttongroup`.
 */
export function nextStop(
	roster: readonly HTMLElement[],
	from: HTMLElement | null | undefined,
	key: string,
	isHorizontal: boolean,
): number | undefined {
	const isForward = key === (isHorizontal ? 'ArrowRight' : 'ArrowDown');
	const isStep = isForward || key === (isHorizontal ? 'ArrowLeft' : 'ArrowUp');
	if (!isStep && key !== 'Home' && key !== 'End') return undefined;

	const walkable: number[] = [];
	for (let index = 0; index < roster.length; index++)
		if (isWalkable(roster[index] as HTMLElement)) walkable.push(index);
	if (walkable.length === 0) return undefined;

	if (key === 'Home') return walkable[0];
	if (key === 'End') return walkable[walkable.length - 1];

	const here = from ? roster.indexOf(from) : -1;
	// The key was pressed somewhere the bar does not own - inside an open surface
	// a control of its own rendered, say. The bar leaves it alone.
	if (here === -1) return undefined;
	const at = walkable.indexOf(here);
	if (at === -1) return undefined;
	return isForward ? walkable[at + 1] : walkable[at - 1];
}
