import { state } from '@markless/core';

// A data handler beside an engine handler in one payload: the compiler decides per handler.
export function App() @{
	let count = state(0);
	let timer = state(0);
	let phase = state('idle');
	<main>
		<button onClick={() => count++}>{`Count ${count}`}</button>
		<button
			onClick={() => {
				window.clearTimeout(timer);
				phase = 'waiting';
				timer = window.setTimeout(() => {
					phase = 'done';
				}, 3000);
			}}
		>
			{`Phase ${phase}`}
		</button>
	</main>
}
