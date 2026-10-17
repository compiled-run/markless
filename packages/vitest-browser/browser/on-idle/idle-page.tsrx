import { state } from '@markless/core';

export function App() @{
	let runs = state(0);

	<main>
		<section
			data-idle
			onIdle={(event) => {
				runs++;
				(event.target as HTMLElement).setAttribute('data-ready-state', document.readyState);
				return import('./idle-analytics.ts').then((analytics) => analytics.record('idle-page'));
			}}
		>
			idle
		</section>
		<output data-runs>{runs}</output>
	</main>
}
