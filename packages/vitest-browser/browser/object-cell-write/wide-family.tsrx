import { computed, element, shared, state } from '@markless/core';
import { movedRect, type Axis, type Rect } from './rect.ts';

interface WideInstanceState {
	own: Rect;
	given: Rect | undefined;
	list: number[];
	hasOwn: boolean;
	aspect: number | undefined;
	minWidth: number;
	maxWidth: number | undefined;
	fixed: boolean;
	step: number;
	disabled: boolean;
	moving: boolean;
	changed: boolean;
	keyAxis: Axis;
	areaInline: number;
	areaBlock: number;
	grabInline: number;
	grabBlock: number;
	pointerId: number;
	name: string;
}

// The crop shape, scaled down: a widget-scoped `shared()` whose `state()` seed
// mixes literals, `undefined` and `as` casts, with one field seeded a plain
// object. Methods hoist every cell read into a local before use.
export const wideState = shared(
	() => {
		const wide: WideInstanceState = state({
			own: { x: 1, y: 2, width: 10, height: 20 },
			given: undefined,
			list: [10, 20],
			hasOwn: false,
			aspect: undefined,
			minWidth: 40,
			maxWidth: undefined,
			fixed: false,
			step: 1,
			disabled: false,
			moving: false,
			changed: false,
			keyAxis: 'inline' as Axis,
			areaInline: 0,
			areaBlock: 0,
			grabInline: 0,
			grabBlock: 0,
			pointerId: -1,
			name: '',
		});
		const areaEl = element<HTMLDivElement>();

		return {
			...wide,
			areaEl,
			// Declared on the factory rather than in a part: the control that
			// separates "the write did not land" from "this reader is frozen".
			factoryOwnX: computed(() => wide.own.x),
			factoryAreaInline: computed(() => wide.areaInline),
			measure() {
				wide.areaInline = 42;
			},
			place() {
				const current = wide.own;
				const moved = movedRect(current, 4, 5);
				wide.own = moved;
				wide.hasOwn = true;
				wide.changed = true;
			},
			hand(rect: Rect) {
				wide.given = rect;
			},
			grow() {
				const next = wide.list;
				wide.list = [...next, 30];
			},
		};
	},
	{ scope: 'widget' },
);

export function WideRoot({ children }) @{
	const wide = wideState();

	<div data-ocww-root el={wide.areaEl}>{children}</div>
}

export function WideReadout() @{
	const wide = wideState();
	const shifted = computed(() => wide.own.x + 100);
	const rows = computed(() => wide.list.length);
	const handed = computed(() => (wide.given ? wide.given.x : -1));

	<div
		data-ocww-readout
		ui-own-x={wide.own.x}
		ui-own-width={wide.own.width}
		ui-changed={wide.changed}
	>
		<output data-ocww-x>{wide.own.x}</output>
		<output data-ocww-y>{wide.own.y}</output>
		<output data-ocww-shifted>{shifted}</output>
		<output data-ocww-rows>{rows}</output>
		<output data-ocww-handed>{handed}</output>
		<output data-ocww-factory-own-x>{wide.factoryOwnX}</output>
		<output data-ocww-factory-area>{wide.factoryAreaInline}</output>
	</div>
}

export function WideControls() @{
	const wide = wideState();

	<div data-ocww-controls>
		<button type="button" data-ocww-place onClick={() => wide.place()}>place</button>
		<button
			type="button"
			data-ocww-hand
			onClick={() => wide.hand({ x: 6, y: 7, width: 8, height: 9 })}
		>hand</button>
		<button type="button" data-ocww-grow onClick={() => wide.grow()}>grow</button>
		<button type="button" data-ocww-measure onClick={() => wide.measure()}>measure</button>
	</div>
}
