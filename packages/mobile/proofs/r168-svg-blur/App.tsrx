import { state } from '@markless/core';

export default function App() @{
	let shown = state(true);
	<main>
		<h1>Glowing mark</h1>
		@if (shown) {
			<svg viewBox="0 0 100 100" width="200" height="200" role="img" aria-label="Soft glow">
				<defs>
					<filter id="glow" x="10" y="10" width="80" height="80" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
						<feFlood flood-opacity="0" result="BackgroundImageFix" />
						<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
						<feGaussianBlur stdDeviation="8" result="effect1_foregroundBlur" />
					</filter>
					<mask id="left" mask-type="alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
						<rect width="70" height="100" fill="black" />
					</mask>
				</defs>
				<g mask="url(#left)">
					<g filter="url(#glow)">
						<ellipse cx="50" cy="50" rx="25" ry="18" fill="#e76f51" />
					</g>
				</g>
			</svg>
		}
		<button onClick={() => (shown = !shown)}>Toggle glow</button>
	</main>
}
