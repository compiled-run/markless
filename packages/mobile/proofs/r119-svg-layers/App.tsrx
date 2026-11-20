const SCENES = {
	noon: {
		size: 48,
		layers: [
			{ name: 'sky', kind: 'fill', d: 'M0 0h48v30H0z', color: '#a8dadc' },
			{ name: 'sun', kind: 'fill', d: 'M30 10a6 6 0 1 0 12 0a6 6 0 1 0-12 0z', color: '#e9c46a' },
			{ name: 'hill', kind: 'fill', d: 'M0 30Q24 14 48 30v18H0z', color: '#2a9d8f', trees: [8, 16, 38] },
			{ name: 'track', kind: 'line', d: 'M10 48Q20 36 30 30', color: '#264653' },
		],
	},
	dusk: {
		size: 48,
		layers: [
			{ name: 'sky', kind: 'fill', d: 'M0 0h48v30H0z', color: '#e76f51' },
			{ name: 'hill', kind: 'fill', d: 'M0 30Q24 14 48 30v18H0z', color: '#264653', trees: [24] },
		],
	},
};

function Scene({ time, label }: { readonly time: 'noon' | 'dusk'; readonly label: string }) @{
	const scene = time === 'noon' ? SCENES.noon : SCENES.dusk;
	<svg role="img" aria-label={label} viewBox={'0 0 ' + scene.size + ' ' + scene.size} width="144" height="144">
		@for (const layer of scene.layers; key layer.name) {
			@if (layer.kind === 'line') {
				<path d={layer.d} fill="none" stroke={layer.color} stroke-width="2" stroke-linecap="round" />
			} @else {
				<>
					<path d={layer.d} fill={layer.color} />
					@for (const x of layer.trees ?? []; key x) {
						<circle cx={x} cy="30" r="3" fill="#1d3557" />
					}
				</>;
			}
		}
	</svg>
}

export default function App() @{
	<main>
		<h1>Layers</h1>
		<Scene time="noon" label="Hill at noon" />
		<Scene time="dusk" label="Hill at dusk" />
		<p>Two scenes drawn from one list of layers</p>
	</main>
}
