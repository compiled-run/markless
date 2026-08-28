import { computed, element, shared, state } from '@markless/core';
import { orderedRoster, readPositions } from './ic-order.ts';

// A widget family reduced to the one thing under test: a root and a repeated
// part whose position is the family's own business. No part takes an index
// prop - the item asks the family's roster where it stands, and `survey()`
// walks the same roster from a handler so the two readings can be compared.
//
// The root also SPENDS its count: `ui-last`, the `next` gate and the "n left"
// text are arithmetic a render cannot do, because the count is a placeholder
// until the page has composed. Those slots defer, and the page answers them.
export const ic = shared(
	() => {
		const s = state({ seen: 'unread', count: 0, code: 'abcdef', armed: false, step: 0 });
		const itemEls = element<HTMLDivElement[]>();

		return {
			...s,
			itemEls,
			/** Report what the roster holds, in this instance's document order. */
			survey() {
				const bound = itemEls;
				const roster = orderedRoster(bound);
				s.seen = readPositions(roster);
				s.count = roster.length;
			},
			/** Show or hide the member an `@if` arm gates. */
			toggleArm() {
				s.armed = s.armed !== true;
			},
			/** Walk forward one step, which is what the forward gate is measured against. */
			next() {
				s.step = s.step + 1;
			},
		};
	},
	{ scope: 'widget' },
);

export function IcRoot({ children }) @{
	const w = ic();
	// The count the family owes its own markup: nobody authors it, and the root
	// asks for it before a single item has rendered.
	const total = computed(() => w.itemEls.length);

	<div
		data-ic-root
		ui-max={total}
		ui-label={`of ${total}`}
		ui-last={total - 1}
		ui-count={w.count}
		ui-seen={w.seen}
		onClick={() => {
			w.survey();
		}}
	>{children}<span data-ic-total>{total}</span><span data-ic-left>{`${total - w.step - 1} left`}</span><button
		type="button"
		data-ic-next
		disabled={w.step >= total - 1}
		onClick={(event) => {
			event.stopPropagation();
			w.next();
		}}
	>next</button><button
		type="button"
		data-ic-write
		onClick={(event) => {
			event.stopPropagation();
			w.code = w.code.toUpperCase();
		}}
	>write</button></div>
}

export function IcItem({ children }) @{
	const w = ic();
	const mine = element<HTMLDivElement>();
	const pos = computed(() => w.itemEls.indexOf(mine as HTMLDivElement));
	// The second derivation, and the one every real family actually writes: a
	// place is worth nothing unless another expression can USE it. It has to
	// answer after a write to `code`, not only at first paint.
	// Guarded because a widget instance rooting a flippable arm registers no
	// widget scope, so its own shared cells read undefined after resume.
	const char = computed(() => w.code?.slice(pos, pos + 1) ?? '');
	// tour's "2 of 5": the count asked by a part standing IN the roster it is
	// counting, so no forward pass can answer it - and printed into surrounding
	// text, which is the one shape a resolved-after-composition count survives.
	const total = computed(() => w.itemEls.length);

	<div
		data-ic-item
		el={[w.itemEls, mine]}
		ui-pos={pos}
		ui-mine={char}
		ui-label={`${pos + 1} of ${total}`}
	>{children}</div>
}

// The same root, with its FIRST roster member gated by an `@if` arm. An arm
// cannot hold an attribute binding, so this member joins the roster without
// reporting a position of its own - the flat items behind it are what renumber,
// and applying or dropping the arm is the only thing that moves the collection.
export function IcArmRoot({ children }) @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div
		data-ic-root
		ui-max={total}
		ui-count={w.count}
		ui-seen={w.seen}
		onClick={() => {
			w.survey();
		}}
	>@if (w.armed) {
			<div data-ic-extra el={w.itemEls}>extra</div>
		}{children}<span data-ic-total>{total}</span></div>
}

export function IcArmToggle() @{
	const w = ic();

	<button
		type="button"
		data-ic-arm-toggle
		onClick={() => {
			w.toggleArm();
		}}
	>toggle</button>
}
