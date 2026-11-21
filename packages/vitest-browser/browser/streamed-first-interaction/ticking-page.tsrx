import { state } from '@markless/core';
import { Library } from './shelves.tsrx';

export default function TickingPage() @{
	let ticks = state(0);

	<main>
		<output class="ticks" onIdle={() => setInterval(() => ticks++, 100)}>{ticks}</output>
		<Library />
	</main>
}
