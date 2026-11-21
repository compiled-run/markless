import { shared, state } from '@markless/core';

const barState = shared(
	() => {
		const bar = state({ value: null as number | null });
		return { ...bar };
	},
	{ scope: 'subtree' },
);

function BarRoot({ value = null, children }: { value?: number | null; children?: unknown }) @{
	const bar = barState();
	bar.value = value;
	<section>{children}</section>
}

function BarText({ label }: { label: string }) @{
	const bar = barState();
	<div>
		<p>{bar.value === null ? `${label} waiting` : `${label} at ${bar.value}`}</p>
		<button onClick={() => (bar.value = (bar.value === null ? 0 : bar.value) + 10)}>{`${label} +10`}</button>
	</div>
}

export default function AbsentDefault() @{
	<main>
		<BarRoot><BarText label="Upload" /></BarRoot>
	</main>
}
