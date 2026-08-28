import { computed, element, shared, state } from '@markless/core';

// Nothing writes this family's shared state from a component body, so the
// compiler hands its cells to every component that resolves it and designates
// only the first-declared one. `ArmedDialRoot` below is therefore a CARRIER
// that is nevertheless a root: it stands outside the parts projected into it.
export const dial = shared(
	() => {
		const s = state({ code: 'abcdef', armed: false });
		const memberEls = element<HTMLDivElement[]>();

		return {
			...s,
			memberEls,
			/** Show or hide the member an `@if` arm gates. */
			toggleArm() {
				s.armed = s.armed !== true;
			},
			shout() {
				s.code = s.code.toUpperCase();
			},
		};
	},
	{ scope: 'widget' },
);

/** The designated root: first resolver declared, so the compiler picks it. */
export function DialRoot({ children }) @{
	const w = dial();
	const total = computed(() => w.memberEls.length);

	<div
		data-testid="plain-root"
		ui-max={total}
	>{children}<button
		type="button"
		data-testid="plain-shout"
		onClick={() => {
			w.shout();
		}}
	>shout</button></div>
}

/**
 * The same root with its first roster member gated by an `@if` arm. An arm
 * cannot hold an attribute binding, so the gated member reports no position of
 * its own; the flat members behind it are what renumber.
 */
export function ArmedDialRoot({ children }) @{
	const w = dial();
	const total = computed(() => w.memberEls.length);

	<div
		data-testid="armed-root"
		ui-max={total}
	>@if (w.armed) {
			<div data-extra el={w.memberEls}>extra</div>
		}{children}<button
		type="button"
		data-testid="armed-shout"
		onClick={() => {
			w.shout();
		}}
	>shout</button></div>
}

export function DialToggle() @{
	const w = dial();

	<button
		type="button"
		data-testid="toggle"
		onClick={() => {
			w.toggleArm();
		}}
	>toggle</button>
}

export function DialMember({ children }) @{
	const w = dial();
	const mine = element<HTMLDivElement>();
	const pos = computed(() => w.memberEls.indexOf(mine as HTMLDivElement));
	// The dependent derivation: a place is worth nothing unless another
	// expression can use it, and this one reads the instance's own shared cell.
	const char = computed(() => w.code.slice(pos, pos + 1));

	<div data-member el={[w.memberEls, mine]} ui-pos={pos} ui-mine={char}>{children}</div>
}
