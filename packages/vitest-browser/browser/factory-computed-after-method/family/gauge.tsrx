import { computed, shared, state, type Children } from '@markless/core';

// The shape the crop rectangle has: scalar cells, a computed over them declared
// beside them in the factory, and a factory method that writes one of the cells.
export const gaugeState = shared(
	() => {
		const rect = state({ x: 2, width: 3 });

		const right = computed(() => {
			const at = rect.x;
			const span = rect.width;
			return at + span;
		});

		return {
			...rect,
			right,

			grow() {
				const at = rect.x;
				rect.x = at + 1;
			},
		};
	},
	{ scope: 'widget' },
);

export function GaugeRoot({ children }: { children?: Children }) @{
	const gauge = gaugeState();

	<div data-gauge-root>{children}</div>
}

// `ui-right` is the factory computed on an attribute; `ui-x` is the raw cell the
// method writes, so a frozen `ui-right` beside a moving `ui-x` names the seam.
export function GaugeArea() @{
	const gauge = gaugeState();

	<div data-gauge-area ui-right={gauge.right} ui-x={gauge.x} />
}

export function GaugeReadout() @{
	const gauge = gaugeState();

	<output data-gauge-readout>{gauge.right}</output>
}

export function GaugeMethodTrigger() @{
	const gauge = gaugeState();

	<button
		type="button"
		data-gauge-method
		onClick={() => {
			gauge.grow();
		}}
	>
		grow via method
	</button>
}

export function GaugeHandlerTrigger() @{
	const gauge = gaugeState();

	<button
		type="button"
		data-gauge-handler
		onClick={() => {
			const at = gauge.x;
			gauge.x = at + 1;
		}}
	>
		grow via handler
	</button>
}
