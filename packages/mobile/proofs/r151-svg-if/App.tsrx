import { state } from '@markless/core';

export default function App() @{
	let dark = state(false);
	<main>
		<h1>Theme: {dark ? 'dark' : 'light'}</h1>
		<button onClick={() => (dark = !dark)} aria-label="Switch theme">
			<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#1e3a8a" stroke-width="2">
				<rect x="1" y="1" width="22" height="22" rx="4" />
				@if (dark) {
					<path d="M15 4a8 8 0 1 0 5 13 7 7 0 0 1-5-13z" fill="#1e3a8a" />
				} @else {
					<g>
						<circle cx="12" cy="12" r="4" fill="hsl(40, 100%, 50%)" />
						<path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
					</g>
				}
			</svg>
		</button>
	</main>
}
