/**
 * The family's own parts, handed in as `element<T[]>()` members, answer every
 * question the keyboard used to ask the DOM. Members come back live and in
 * document order, so "which one am I" is the deepest member holding the event
 * target and "which set do I walk" is a containment test against the panels.
 */

type Parts = ReadonlyArray<HTMLElement> | undefined;

function isWalkable(part: HTMLElement): boolean {
	if (part.tagName === 'A') return part.hasAttribute('href');
	if (part.tagName !== 'BUTTON') return false;
	return (part as HTMLButtonElement).disabled !== true;
}

function isInsideAny(panels: Parts, part: HTMLElement): boolean {
	for (const panel of panels ?? []) if (panel !== part && panel.contains(part)) return true;
	return false;
}

/** The controls a person reaches with ArrowLeft/ArrowRight along the bar. */
export function topLevelControls(controls: Parts, panels: Parts): HTMLElement[] {
	const walk: HTMLElement[] = [];
	for (const control of controls ?? [])
		if (isWalkable(control) && !isInsideAny(panels, control)) walk.push(control);
	return walk;
}

/** One dropdown's own controls, in document order. */
export function controlsInside(controls: Parts, panel: HTMLElement | undefined): HTMLElement[] {
	const walk: HTMLElement[] = [];
	if (!panel) return walk;
	for (const control of controls ?? [])
		if (isWalkable(control) && panel.contains(control)) walk.push(control);
	return walk;
}

/**
 * Which control the event happened on: the DEEPEST holder, because a consumer
 * may put an icon or a span inside a trigger and the event lands on that.
 */
export function controlAt(controls: Parts, target: Node | null): HTMLElement | undefined {
	if (target === null) return undefined;
	let found: HTMLElement | undefined;
	for (const control of controls ?? [])
		if (isWalkable(control) && control.contains(target)) found = control;
	return found;
}

/** Which dropdown the event happened inside, or `undefined` at the top level. */
export function panelAt(panels: Parts, target: Node | null): HTMLElement | undefined {
	if (target === null) return undefined;
	let found: HTMLElement | undefined;
	for (const panel of panels ?? []) if (panel.contains(target)) found = panel;
	return found;
}

export type Step = 'next' | 'previous' | 'first' | 'last';

/**
 * Where a movement key lands, or `undefined` for "leave focus where it is".
 * The walk wraps at both ends; a `here` that is not in the set moves nothing.
 */
export function stepTo(
	walk: readonly HTMLElement[],
	here: HTMLElement | undefined,
	step: Step,
): HTMLElement | undefined {
	const last = walk.length - 1;
	if (last < 0 || here === undefined) return undefined;

	const at = walk.indexOf(here);
	if (at < 0) return undefined;
	if (step === 'first') return walk[0];
	if (step === 'last') return walk[last];

	const raw = at + (step === 'next' ? 1 : -1);
	if (raw < 0) return walk[last];
	if (raw > last) return walk[0];
	return walk[raw];
}
