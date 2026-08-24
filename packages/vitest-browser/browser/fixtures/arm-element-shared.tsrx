import { shared, state } from '@markless/core';

const armShared = shared(
	() => {
		const s = state({ value: 0 });

		return { ...s };
	},
	{ scope: 'widget' },
);

function Root({ children }) @{
	const s = armShared();

	<div data-root ui-value={s.value}>{children}</div>
}

function Label({ children }) @{
	const s = armShared();

	<output data-out ui-value={s.value}>
		@if (children) {
			{children}
		} @else {
			<span data-own>{s.value}</span>
		}
	</output>
}

function Bump() @{
	const s = armShared();

	<button type="button" data-bump onClick={() => s.value = s.value + 1}>bump</button>
}

export default function ArmElementShared() @{
	<main>
		<Root>
			<Label />
			<Bump />
		</Root>
	</main>
}
