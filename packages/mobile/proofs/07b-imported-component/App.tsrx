import { state } from '@markless/core';
import { Stepper } from '../lib/Stepper.tsrx';

export default function App() @{
	let plums = state(1);
	let figs = state(0);
	<main>
		<h1>Imported parts</h1>
		<Stepper label="Plums" value={plums} onStep={() => plums++} />
		<Stepper label="Figs" value={figs} onStep={() => (figs = figs + 2)} />
		<p>Fruit {plums + figs}</p>
	</main>
}
