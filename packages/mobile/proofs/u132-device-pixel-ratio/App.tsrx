import { state } from '@markless/core';

export default function App() @{
	let read = state('Ratio unknown');
	let width = state('');
	<main>
		<h1>Screen check</h1>
		<button
			onClick={() => {
				const ratio = window.devicePixelRatio;
				read = typeof ratio === 'number' && ratio >= 1 ? 'Ratio read' : 'No ratio';
				width = `${Math.ceil(101.3 * ratio) / ratio}px at ${ratio}x`;
			}}
		>
			Check screen
		</button>
		<p>{read}</p>
		<p>{width}</p>
	</main>
}
