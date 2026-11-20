import { state } from '@markless/core';

export default function App() @{
	let mode = state('stretch');
	<main>
		<h1>Banner fit</h1>
		<button onClick={() => (mode = mode === 'stretch' ? 'crop' : mode === 'crop' ? 'corner' : 'stretch')}>Change fit</button>
		@if (mode === 'stretch') {
			<svg viewBox="0 0 100 50" width="300" height="60" preserveAspectRatio="none">
				<rect x="0" y="0" width="100" height="50" fill="#9cf" />
				<text x="50" y="30" text-anchor="middle" font-size="12">Stretched</text>
			</svg>
		} @else if (mode === 'crop') {
			<svg viewBox="0 0 100 50" width="100" height="100" preserveAspectRatio="xMidYMid slice">
				<rect x="0" y="0" width="100" height="50" fill="#fc9" />
				<text x="50" y="30" text-anchor="middle" font-size="12">Cropped</text>
			</svg>
		} @else {
			<svg viewBox="0 0 100 50" width="300" height="100" preserveAspectRatio="xMinYMax meet">
				<rect x="0" y="0" width="100" height="50" fill="#cf9" />
				<text x="50" y="30" text-anchor="middle" font-size="12">Bottom left</text>
			</svg>
		}
	</main>
}
