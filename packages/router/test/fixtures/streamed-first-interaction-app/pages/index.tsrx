import { state } from '@markless/core';
import { Library } from '../lib/shelves.tsrx';

export default function Home() @{
	let taps = state(0);

	<main data-page="home">
		<button class="tap" onClick={() => taps++}>{taps}</button>
		<a class="away" href="/away">away</a>
		<Library />
	</main>
}
