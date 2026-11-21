import { state } from '@markless/core';

export default function App() @{
	let across = state(true);
	<main>
		<h1>Route map</h1>
		<button onClick={() => (across = !across)}>Turn route</button>
		@if (across) {
			<svg viewBox="0 0 160 60" width="320" height="120">
				<defs>
					<marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
						<path d="M0 0 L10 5 L0 10 z" fill="#c33" />
					</marker>
				</defs>
				<line x1="10" y1="40" x2="150" y2="40" stroke="#333" stroke-width="2" marker-start="url(#head)" marker-end="url(#head)" />
				<text x="80" y="20" text-anchor="middle" font-size="12">Both ways</text>
			</svg>
		} @else {
			<svg viewBox="0 0 160 60" width="320" height="120">
				<defs>
					<marker id="dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4">
						<circle cx="5" cy="5" r="5" fill="#36c" />
					</marker>
				</defs>
				<polyline points="10,50 60,10 110,50 150,10" fill="none" stroke="#333" stroke-width="2" marker-start="url(#dot)" marker-mid="url(#dot)" marker-end="url(#dot)" />
				<text x="80" y="58" text-anchor="middle" font-size="10">Four stops</text>
			</svg>
		}
	</main>
}
