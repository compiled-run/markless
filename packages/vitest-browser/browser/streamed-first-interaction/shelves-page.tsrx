import { state } from '@markless/core';
import { Library } from './shelves.tsrx';

export default function ShelvesPage() @{
	let taps = state(0);

	<main>
		<button class="tap" onClick={() => taps++}>{taps}</button>
		<Library />
	</main>
}
