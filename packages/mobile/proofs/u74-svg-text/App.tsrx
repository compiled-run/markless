import { state } from '@markless/core';

export default function App() @{
	let quarter = state(3);
	<main>
		<h1>Sales chart</h1>
		<button onClick={() => (quarter = quarter === 3 ? 4 : 3)}>Next quarter</button>
		@if (quarter === 3) {
			<svg viewBox="0 0 200 80" width="200" height="80">
				<rect x="0" y="0" width="200" height="80" fill="#eef" />
				<text x="100" y="45" text-anchor="middle" dominant-baseline="middle" font-size="18" fill="#225">
					Sales up <tspan font-weight="bold" fill="#080">12%</tspan>
				</text>
			</svg>
		} @else {
			<svg viewBox="0 0 200 80" width="200" height="80">
				<rect x="0" y="0" width="200" height="80" fill="#fee" />
				<text x="10" y="50" font-size="16" font-family="Georgia, serif" fill="#522">Q4 forecast</text>
			</svg>
		}
	</main>
}
