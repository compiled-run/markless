import { state } from '@markless/core';

export default function App() @{
	let note = state('Nothing picked');
	<main>
		<h1>Upload</h1>
		<div
			onDragOver={(event) => event.preventDefault()}
			onDrop={(event) => {
				event.preventDefault();
				note = 'Dropped';
			}}
		>
			<p>{note}</p>
		</div>
		<button onClick={() => (note = 'Picked a photo')}>Pick a photo</button>
	</main>
}
