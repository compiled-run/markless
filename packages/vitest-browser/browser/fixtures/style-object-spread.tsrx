const KEY = 'letterSpacing';

export function App() @{
	const base = { color: 'rgb(255, 0, 0)', marginTop: 4, paddingLeft: 10 };

	<section data-style-spread>
		<div data-merged style={{ ...base, color: 'rgb(0, 0, 255)' }}>Merged</div>
		<div data-keyed style={{ [KEY]: 2, ['padding-top']: 6 }}>Keyed</div>
	</section>
}
