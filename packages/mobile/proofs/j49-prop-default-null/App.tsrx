import { shared, state } from '@markless/core';

const meterState = shared(
	() => {
		const meter = state({ value: null as number | null });
		return meter;
	},
	{ scope: 'subtree' },
);

function Meter({ name, value = null }: { readonly name: string; readonly value?: number | null }) @{
	const meter = meterState();
	meter.value = value;
	<section>
		<p>{meter.value === null ? `${name}: no reading` : `${name}: reading ${meter.value}`}</p>
		<button onClick={() => (meter.value = meter.value === null ? 5 : null)}>{`Toggle ${name}`}</button>
	</section>
}

export default function App() @{
	<main>
		<h1>Meters</h1>
		<Meter name="Left" />
		<Meter name="Right" value={42} />
	</main>
}
