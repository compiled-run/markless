import { state } from '@markless/core';

export default function PerformanceNow() @{
	let first = state(-1);
	let shown = state('No reading yet');
	<main>
		<button
			onClick={() => {
				const now = performance.now();
				const again = performance.now();
				if (typeof now !== 'number' || now < 0 || again < now) shown = 'Clock went back';
				else if (first < 0) shown = 'First reading';
				else shown = now >= first ? 'Later reading' : 'Clock went back';
				if (first < 0) first = now;
			}}
		>
			Read the clock
		</button>
		<p>{shown}</p>
	</main>
}
