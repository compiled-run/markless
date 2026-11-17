import { state } from '@markless/core';

export default function App() @{
	let step = state(0);
	let tab = state('list');
	<main>
		<h1>Choices</h1>
		<button onClick={() => step++}>Step</button>
		@if (step === 0) {
			<p>Not started</p>
		} @else if (step === 1) {
			<p>Halfway</p>
		} @else {
			<p>Done</p>
		}
		<button onClick={() => (tab = tab === 'list' ? 'grid' : 'map')}>Switch view</button>
		@switch (tab) {
			@case 'list': {
				<p>List view</p>
			}
			@case 'grid': {
				<p>Grid view</p>
			}
			@default: {
				<p>Other view</p>
			}
		}
	</main>
}
