import { computed, shared, state, type Children } from '@markless/core';

// One member expression among literal seeds. The literal-seeded fields and the
// values the root writes from its props are the control: they must survive a
// property the evaluator has to treat on its own terms.
export const boxState = shared(
	() => {
		const box = state({
			name: '',
			disabled: false,
			x: 0,
			width: 40,
			maxWidth: Number.MAX_SAFE_INTEGER,
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

export type BoxRootProps = {
	readonly name?: string;
	readonly disabled?: boolean;
	readonly defaultX?: number;
	readonly defaultWidth?: number;
	readonly children?: Children;
};

export function BoxRoot({
	name = '',
	disabled = false,
	defaultX = 0,
	defaultWidth = 40,
	children,
}: BoxRootProps) @{
	const box = boxState();
	box.name = name;
	box.disabled = disabled;
	box.x = defaultX;
	box.width = defaultWidth;

	<div data-box-root>{children}</div>
}

export function BoxArea() @{
	const box = boxState();

	const tabStop = computed(() => (box.disabled ? -1 : 0));

	<div data-box-area tabindex={tabStop} ui-name={box.name} ui-x={box.x} ui-width={box.width} />
}

export function BoxReadout() @{
	const box = boxState();

	const span = computed(() => {
		const from = box.x;
		const wide = box.width;
		return `${from}-${from + wide}`;
	});

	<output data-box-readout>{span}</output>
}

export function BoxLimitReadout() @{
	const box = boxState();

	const limit = computed(() => `${box.maxWidth}`);

	<output data-box-limit-readout>{limit}</output>
}

export function BoxTrigger() @{
	const box = boxState();

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
