export default function App() @{
	<main>
		<h1>Shapes</h1>
		<svg role="img" aria-label="Shapes" viewBox="0 0 200 120" width="300" height="180">
			<rect x="10" y="10" width="60" height="40" rx="8" fill="#457b9d" />
			<circle cx="110" cy="30" r="20" fill="#e63946" stroke="#1d3557" stroke-width="4" />
			<ellipse cx="170" cy="30" rx="20" ry="12" fill="#a8dadc" />
			<line x1="10" y1="70" x2="190" y2="70" stroke="#1d3557" stroke-width="2" />
			<polyline points="10,110 40,80 70,110 100,80" fill="none" stroke="#2a9d8f" stroke-width="4" stroke-linejoin="round" />
			<g transform="translate(120 80) rotate(15)" opacity="0.5">
				<polygon points="0,0 40,0 20,30" fill="#f4a261" />
			</g>
		</svg>
		<p>Six shapes</p>
	</main>
}
