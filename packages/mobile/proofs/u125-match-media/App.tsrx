import { state } from '@markless/core';

export default function App() @{
	let motion = state('Motion unknown');
	let scheme = state('Scheme unknown');
	let checks = state(0);
	<main>
		<h1>Settings check</h1>
		<button
			onClick={() => {
				motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
					? 'Motion reduced'
					: 'Motion full';
				scheme = matchMedia('screen and (prefers-color-scheme: dark)').matches
					? 'Scheme dark'
					: 'Scheme light';
				checks = checks + 1;
			}}
		>
			{`Checked ${checks}`}
		</button>
		<p>{motion}</p>
		<p>{scheme}</p>
	</main>
}
