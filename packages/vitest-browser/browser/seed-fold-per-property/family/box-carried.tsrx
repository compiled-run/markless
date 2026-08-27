import { computed, shared, state, type Children } from '@markless/core';

// A cap that has to be CARRIED rather than folded: JSON, which the render-data
// module is printed with, has no form for a non-finite number. A carried seed
// still loses the values the root writes from its props.
export const boxCarriedState = shared(
	() => {
		const box = state({
			name: '',
			disabled: false,
			x: 0,
			width: 40,
			maxWidth: Number.POSITIVE_INFINITY,
		});

		return {
			...box,

			grow() {
				const wide = box.width;
				box.width = wide + 1;
			},
		};
	},
	{ scope: 'widget' },
);

export type BoxCarriedRootProps = {
	readonly name?: string;
	readonly disabled?: boolean;
	readonly defaultX?: number;
	readonly defaultWidth?: number;
	readonly children?: Children;
};

export function BoxCarriedRoot({
	name = '',
	disabled = false,
	defaultX = 0,
	defaultWidth = 40,
	children,
}: BoxCarriedRootProps) @{
	const box = boxCarriedState();
	box.name = name;
	box.disabled = disabled;
	box.x = defaultX;
	box.width = defaultWidth;

	<div data-box-root>{children}</div>
}

export function BoxCarriedArea() @{
	const box = boxCarriedState();

	const tabStop = computed(() => (box.disabled ? -1 : 0));

	<div data-box-area tabindex={tabStop} ui-name={box.name} ui-x={box.x} ui-width={box.width} />
}

export function BoxCarriedReadout() @{
	const box = boxCarriedState();

	const span = computed(() => {
		const from = box.x;
		const wide = box.width;
		return `${from}-${from + wide}`;
	});

	<output data-box-readout>{span}</output>
}

export function BoxCarriedLimitReadout() @{
	const box = boxCarriedState();

	const limit = computed(() => `${box.maxWidth}`);

	<output data-box-limit-readout>{limit}</output>
}

export function BoxCarriedTrigger() @{
	const box = boxCarriedState();

	<button
		type="button"
		data-box-trigger
		onClick={() => {
			box.grow();
		}}
	>
		grow
	</button>
}
