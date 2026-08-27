import { computed, shared, state, type Children } from '@markless/core';
import { START_WIDTH } from './limits.ts';

// Three seed shapes in one `state()`: a same-module const, a member expression on
// a global, an imported const, and a bare literal as the control. Any one of the
// first three unregistering the shape takes the literal-seeded fields with it.
const MIN_WIDTH = 1;

export const gateState = shared(
	() => {
		const gate = state({
			minWidth: MIN_WIDTH,
			maxWidth: Number.POSITIVE_INFINITY,
			width: START_WIDTH,
			x: 2,
		});

		const right = computed(() => {
			const at = gate.x;
			const span = gate.width;
			return at + span;
		});

		return {
			...gate,
			right,

			grow() {
				const span = gate.width;
				gate.width = span + 1;
			},
		};
	},
	{ scope: 'widget' },
);

export function GateRoot({ children }: { children?: Children }) @{
	const gate = gateState();

	<div data-gate-root>{children}</div>
}

export function GateArea() @{
	const gate = gateState();

	<div
		data-gate-area
		ui-min-width={gate.minWidth}
		ui-max-width={gate.maxWidth}
		ui-width={gate.width}
		ui-x={gate.x}
	/>
}

// A part-level computed over the family: it stops lowering when the shape loses
// its fields, so a missing readout names the same seam from the part side.
export function GateReadout() @{
	const gate = gateState();

	const span = computed(() => {
		const from = gate.x;
		const wide = gate.width;
		return `${from}-${from + wide}`;
	});

	<output data-gate-readout>{span}</output>
}

export function GateFactoryReadout() @{
	const gate = gateState();

	<output data-gate-factory-readout>{gate.right}</output>
}

export function GateTrigger() @{
	const gate = gateState();

	<button
		type="button"
		data-gate-trigger
		onClick={() => {
			gate.grow();
		}}
	>
		grow
	</button>
}

export function GateWriteTrigger() @{
	const gate = gateState();

	<button
		type="button"
		data-gate-write
		onClick={() => {
			gate.minWidth = 5;
		}}
	>
		raise the floor
	</button>
}
