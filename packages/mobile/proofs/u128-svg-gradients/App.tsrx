import { state } from '@markless/core';

export default function App() @{
	let shown = state(true);
	<main>
		<h1>Gradients</h1>
		@if (shown) {
			<svg viewBox="0 0 200 110" width="300" height="165" role="img" aria-label="Gradient swatches">
				<defs>
					<linearGradient id="sunrise" gradientTransform="rotate(30)">
						<stop offset="0" stop-color="#ff9f1c" />
						<stop offset="0.6" stop-color="#e71d36" />
						<stop offset="1" stop-color="#5f0f99" />
					</linearGradient>
					<linearGradient id="fade" href="#sunrise" x1="0" y1="0" x2="0" y2="1" />
					<radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="150" cy="40" r="32" fx="140" fy="30" fr="2">
						<stop offset="10%" stop-color="#ffffff" />
						<stop offset="70%" stop-color="#2ec4b6" />
						<stop offset="100%" stop-color="#011627" stop-opacity="0" />
					</radialGradient>
					<linearGradient id="rim" gradientUnits="userSpaceOnUse" x1="10" y1="0" x2="190" y2="0">
						<stop stop-color="#3a86ff" />
						<stop offset="1" stop-color="#ffbe0b" />
					</linearGradient>
				</defs>
				<rect x="8" y="8" width="84" height="64" rx="6" fill="url(#sunrise)" />
				<circle cx="150" cy="40" r="32" fill="url(#glow)" />
				<rect x="12" y="86" width="176" height="14" rx="7" fill="url(#fade)" stroke="url(#rim)" stroke-width="4" />
			</svg>
		}
		<img src="/static/vite.svg" alt="Vite logo" width="120" />
		<button onClick={() => (shown = !shown)}>Toggle swatches</button>
	</main>
}
