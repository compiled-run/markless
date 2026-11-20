import { element, shared, state, type Children } from '@markless/core';

const boxState = shared(
	() => {
		const box = state({ note: 'unchecked' });
		const fieldEl = element<HTMLInputElement>();
		return {
			...box,
			fieldEl,
			check() {
				if (!fieldEl) {
					box.note = 'no field';
					return;
				}
				box.note = 'has field';
			},
		};
	},
	{ scope: 'subtree' },
);

function Field() @{
	const box = boxState();
	<input aria-label="Field" el={box.fieldEl} />
}

function Box({ children }: { readonly children?: Children }) @{
	const box = boxState();
	<div>
		{children}
		<button onClick={() => box.check()}>{box.note}</button>
	</div>
}

export default function FactoryHandles() @{
	<main>
		<Box>
			<Field />
		</Box>
		<Box />
	</main>
}
