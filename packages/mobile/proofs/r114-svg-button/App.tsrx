import { state } from '@markless/core';

export default function App() @{
	let open = state(false);
	<main>
		<h1>Menu</h1>
		<button aria-label="Toggle menu" aria-expanded={open} onClick={() => (open = !open)}>
			<svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true">
				<path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M4 7h22M4 15h22M4 23h22" />
			</svg>
		</button>
		<p>{open ? 'Menu open' : 'Menu closed'}</p>
	</main>
}
