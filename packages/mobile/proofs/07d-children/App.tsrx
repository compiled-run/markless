import { state } from '@markless/core';
import { Card } from '../lib/Card.tsrx';

export default function App() @{
	let cups = state(0);
	<main>
		<h1>Wrapped</h1>
		<Card title="Coffee">
			<p>Cups {cups}</p>
			<button onClick={() => cups++}>Pour</button>
		</Card>
	</main>
}
