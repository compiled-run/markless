export default function App() @{
	<main>
		<h1>See-through ink</h1>
		<svg role="img" aria-label="Quarter ink square" viewBox="0 0 24 24" width="96" height="96" fill="currentColor">
			<rect width="24" height="24" opacity=".25" />
			<rect x="8" y="8" width="8" height="8" />
		</svg>
		<svg role="img" aria-label="Faded ring" viewBox="0 0 24 24" width="96" height="96" opacity="0.5">
			<g opacity=".5"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="4" /></g>
			<circle cx="12" cy="12" r="4" fill="currentColor" fill-opacity="0.5" />
		</svg>
		<p>Ink seen through its opacity</p>
	</main>
}
