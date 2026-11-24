import { state } from '@markless/core';

export default function App() @{
	let slide = state(1);
	<main>
		<h1>Slides</h1>
		<div onWheel={() => (slide = slide + 1)}>
			<p>Slide {slide}</p>
		</div>
		<button onClick={() => (slide = slide + 1)}>Next slide</button>
	</main>
}
