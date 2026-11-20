export default function App() @{
	<main>
		<h1>Dashes</h1>
		<svg width="240" height="120" viewBox="0 0 120 60" stroke="#1e3a8a" stroke-width="3" fill="none">
			<title>Three lines and a ring</title>
			<path d="M10 10h100" />
			<path d="M10 25h100" stroke-dasharray="8 4" />
			<g stroke-dasharray="0, 6" stroke-linecap="round">
				<path d="M10 40h100" />
			</g>
			<circle cx="100" cy="48" r="8" stroke="hsl(30, 100%, 45%)" stroke-dasharray="5" stroke-dashoffset="2" />
		</svg>
		<p>Dashes drawn</p>
	</main>
}
