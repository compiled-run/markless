import { state } from '@markless/core';

export default function App() @{
	let shown = state(true);
	<main>
		<h1>Masked mark</h1>
		@if (shown) {
			<svg viewBox="0 0 100 100" width="200" height="200" role="img" aria-label="Half disc">
				<defs>
					<mask id="left" mask-type="alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
						<rect width="50" height="100" fill="black" />
					</mask>
				</defs>
				<g mask="url(#left)">
					<circle cx="50" cy="50" r="40" fill="#2a9d8f" />
				</g>
			</svg>
		}
		<button onClick={() => (shown = !shown)}>Toggle mark</button>
	</main>
}
