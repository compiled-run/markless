import { state } from '@markless/core';

export default function App() @{
	let half = state(true);
	<main>
		<h1>Moon phase</h1>
		<button onClick={() => (half = !half)}>Next phase</button>
		@if (half) {
			<svg viewBox="0 0 120 50" width="240" height="100">
				<defs>
					<clipPath id="left-half"><rect x="0" y="0" width="25" height="50" /></clipPath>
				</defs>
				<g clip-path="url(#left-half)" transform="translate(0 0)">
					<circle cx="25" cy="25" r="24" fill="#cc9" />
				</g>
				<text x="58" y="30" font-size="12">Half moon</text>
			</svg>
		} @else {
			<svg viewBox="0 0 120 50" width="240" height="100">
				<circle cx="25" cy="25" r="24" fill="#cc9" />
				<text x="58" y="30" font-size="12">Full moon</text>
			</svg>
		}
	</main>
}
