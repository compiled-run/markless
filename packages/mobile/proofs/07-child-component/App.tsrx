import { state } from '@markless/core';

function Stepper({ label, value, onStep }: { label: string; value: number; onStep: () => void }) @{
	<section>
		<p>{label} {value}</p>
		<button onClick={() => onStep()}>Add one {label}</button>
	</section>
}

export default function App() @{
	let apples = state(0);
	let pears = state(0);
	<main>
		<h1>Basket</h1>
		<Stepper label="Apples" value={apples} onStep={() => apples++} />
		<Stepper label="Pears" value={pears} onStep={() => pears++} />
		<p>Total {apples + pears}</p>
	</main>
}
