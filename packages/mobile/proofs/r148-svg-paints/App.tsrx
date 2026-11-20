export default function App() @{
	<main>
		<h1>Paints</h1>
		<svg width="240" height="120" viewBox="0 0 120 60">
			<title>Sunrise</title>
			<defs>
				<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stop-color="#1e3a8a" />
					<stop offset="100%" stop-color="hsl(30, 100%, 60%)" />
				</linearGradient>
				<radialGradient id="sun" cx="50%" cy="50%" r="50%" fx="40%" fy="40%">
					<stop offset="0%" stop-color="#fff7ae" />
					<stop offset="1" stop-color="#f59e0b" stop-opacity="0.8" />
				</radialGradient>
			</defs>
			<rect width="120" height="60" fill="url(#sky)" />
			<circle cx="60" cy="40" r="16" fill="url(#sun)" stroke="hsl(0 0% 100%)" stroke-width="2" />
		</svg>
		<p>Sunrise drawn</p>
	</main>
}
