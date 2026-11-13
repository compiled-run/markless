import { state } from '@markless/core';
import { Library } from '../lib/shelves.tsrx';

export default function Ticking() @{
	let ticks = state(0);

	<main data-page="ticking">
		<output class="ticks" onIdle={() => setInterval(() => ticks++, 200)}>{ticks}</output>
		<Library />
	</main>
}
