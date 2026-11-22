import { state } from '@markless/core';

export default function App() @{
	let shown = state(true);
	<main>
		<h1>Outlined card</h1>
		@if (shown) {
			<svg viewBox="0 0 100 100" width="200" height="200" role="img" aria-label="Card outline">
				<defs>
					<mask id="outside" maskUnits="userSpaceOnUse" x="10" y="10" width="80" height="80" fill="black">
						<rect fill="white" x="10" y="10" width="80" height="80" />
						<path d="M25 20L75 25L80 75L20 80Z" />
					</mask>
					<mask id="ring" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100" fill="black">
						<rect fill="white" width="100" height="100" />
						<path fill-rule="evenodd" d="M40 40H60V60H40ZM45 45V55H55V45Z" />
					</mask>
				</defs>
				<path d="M25 20L75 25L80 75L20 80Z" stroke="#264653" stroke-width="12" fill="none" mask="url(#outside)" />
				<g mask="url(#ring)">
					<circle cx="50" cy="50" r="18" fill="#e9c46a" />
				</g>
			</svg>
		}
		<button onClick={() => (shown = !shown)}>Toggle card</button>
	</main>
}
