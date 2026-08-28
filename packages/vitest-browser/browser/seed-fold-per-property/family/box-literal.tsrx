import { computed, shared, state, type Children } from '@markless/core';

// The same shape spelled with a numeric literal that denotes Infinity: the
// control that shows the fold, not the value, is what the other family trips on.
export const boxLiteralState = shared(
	() => {
		const box = state({
			name: '',
			disabled: false,
			x: 0,
			width: 40,
			maxWidth: 9007199254740991,
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

export type BoxLiteralRootProps = {
	readonly name?: string;
	readonly disabled?: boolean;
	readonly defaultX?: number;
	readonly defaultWidth?: number;
	readonly children?: Children;
};

export function BoxLiteralRoot({
	name = '',
	disabled = false,
	defaultX = 0,
	defaultWidth = 40,
	children,
}: BoxLiteralRootProps) @{
	const box = boxLiteralState();
	box.name = name;
	box.disabled = disabled;
	box.x = defaultX;
	box.width = defaultWidth;

	<div data-box-root>{children}</div>
}

export function BoxLiteralArea() @{
	const box = boxLiteralState();

	const tabStop = computed(() => (box.disabled ? -1 : 0));

	<div data-box-area tabindex={tabStop} ui-name={box.name} ui-x={box.x} ui-width={box.width} />
}

export function BoxLiteralReadout() @{
	const box = boxLiteralState();

	const span = computed(() => {
		const from = box.x;
		const wide = box.width;
		return `${from}-${from + wide}`;
	});

	<output data-box-readout>{span}</output>
}

export function BoxLiteralLimitReadout() @{
	const box = boxLiteralState();

	const limit = computed(() => `${box.maxWidth}`);

	<output data-box-limit-readout>{limit}</output>
}

export function BoxLiteralTrigger() @{
	const box = boxLiteralState();

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
