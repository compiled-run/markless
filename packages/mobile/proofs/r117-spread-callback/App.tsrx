import { state } from '@markless/core';
import Chip from '../lib/Chip.tsrx';

export default function App() @{
	let picked = state('nothing');
	<main>
		<h1>Chips</h1>
		<Chip label="Red" onClick={() => (picked = 'red')} />
		<Chip label="Blue" onClick={() => (picked = JSON.stringify({ blue: picked }))} />
		<p>Picked {picked}</p>
	</main>
}
