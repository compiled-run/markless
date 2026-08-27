import { computed, element, shared, state, type Children } from '@markless/core';

// A widget family in the shape the ink drawing surface has: cells seeded from a
// prop, a computed over those cells, and factory methods that append to the list.
// `addViaComputed` reads the computed declared beside it; `addViaCells` rebuilds
// the same list from the cells and is the control.
export const tallyState = shared(
	() => {
		const board = state({
			seed: [] as readonly string[],
			own: null as readonly string[] | null,
			busy: false,
		});
		const areaEl = element<HTMLDivElement>();

		const marks = computed(() => {
			const own = board.own;
			const seed = board.seed;
			return own === null ? seed : own;
		});
		const label = computed(() => {
			const own = board.own;
			const seed = board.seed;
			return (own === null ? seed : own).join('|');
		});
		const count = computed(() => {
			const own = board.own;
			const seed = board.seed;
			return (own === null ? seed : own).length;
		});

		return {
			...board,
			areaEl,
			marks,
			label,
			count,

			addViaComputed(mark: string) {
				const before = marks;
				board.own = before.concat(mark);
			},

			addViaCells(mark: string) {
				const own = board.own;
				const seed = board.seed;
				const before = own === null ? seed : own;
				board.own = before.concat(mark);
			},
		};
	},
	{ scope: 'widget' },
);

export function TallyRoot({
	marks = [] as readonly string[],
	children,
}: {
	marks?: readonly string[];
	children?: Children;
}) @{
	const board = tallyState();
	board.seed = marks;

	<div data-tally-root>{children}</div>
}

export function TallyArea({ children }: { children?: Children }) @{
	const board = tallyState();
	const areaTabStop = computed(() => (board.busy ? -1 : 0));

	<div
		data-tally-area
		el={board.areaEl}
		tabindex={areaTabStop}
		ui-count={board.count}
		onClick={() => {
			board.addViaComputed('x');
		}}
	>
		{children}
	</div>
}

export function TallyControl() @{
	const board = tallyState();

	<button
		type="button"
		data-tally-control
		onClick={() => {
			board.addViaCells('y');
		}}
	>
		add
	</button>
}

export function TallyReadout() @{
	const board = tallyState();

	<output data-tally-readout>{board.label}</output>
}
