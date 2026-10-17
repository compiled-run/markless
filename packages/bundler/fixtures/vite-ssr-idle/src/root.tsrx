import { state } from '@markless/core';

export function App() @{
	let runs = state(0);

	<main>
		<section
			onIdle={() => {
				runs++;
				document.body.setAttribute('data-idle-ready-state', document.readyState);
				return import('./analytics.ts').then((analytics) => analytics.record());
			}}
		>
			idle
		</section>
		<output>{runs}</output>
		<button onClick={() => (runs += 10)}>Add ten</button>
	</main>
}
