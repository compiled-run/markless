import { state } from '@markless/core';

const START_SPEED = 0.4;
const waitOf = (speed: number) => 1200 / speed;

// website/components/figures/stream/stream-anatomy.tsrx:74, the reload button: a timer that a second press replaces.
export function App() @{
	let timer = state(0);
	let phase = state('done');
	let speed = state(START_SPEED);
	let reloads = state(0);
	<main>
		<button
			onClick={() => {
				window.clearTimeout(timer);
				phase = 'loading';
				reloads++;
				timer = window.setTimeout(() => {
					phase = 'done';
				}, waitOf(speed));
			}}
		>
			{`Reload ${reloads}`}
		</button>
		<p>{`Page ${phase}`}</p>
	</main>
}
