import { state } from '@markless/core';

export default function SeeThrough() @{
	let dark = state(false);
	<main>
		<button onClick={() => (dark = !dark)}>{dark ? 'Ink' : 'Paper'}</button>
		<svg viewBox="0 0 4 4" width="40" height="40" fill="currentColor" opacity=".25" aria-label="Mark">
			<rect width="4" height="4" />
			<g opacity="0.5"><circle cx="2" cy="2" r="1" stroke="currentColor" stroke-opacity=".5" fill="none" /></g>
		</svg>
	</main>
}
