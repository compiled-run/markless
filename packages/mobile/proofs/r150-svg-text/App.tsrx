export default function App() @{
	<main>
		<h1>Diagram</h1>
		<svg width="240" height="120" viewBox="0 0 120 60">
			<title>Dev server to runtime</title>
			<rect x="4" y="8" width="112" height="24" fill="#f2ecfc" stroke="#c2c2c4" />
			<text x="60" y="20" text-anchor="middle" dominant-baseline="central" font-family="Arial" font-size="9" fill="#3c3c43">Vite Dev Server</text>
			<text fill="#15505C" {...{ 'xml:space': 'preserve' }} style="white-space: pre" font-size="6" font-weight="600" letter-spacing="0.1em">
				<tspan x="78" y="50">module</tspan>
				<tspan x="78" y="57">graph</tspan>
			</text>
			<text x="60" y="40" fill="#3c3c43" style="text-anchor: middle; font-size: 6px; font-weight: 400;">mermaid label</text>
			<g transform="translate(4 48)" font-size="8" font-style="italic" fill="hsl(30, 100%, 40%)">
				<text dominant-baseline="middle">runs code</text>
			</g>
		</svg>
		<p>Diagram drawn</p>
	</main>
}
