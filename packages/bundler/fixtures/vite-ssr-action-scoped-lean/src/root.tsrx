import { element, state } from '@markless/core';

export function App() @{
	let taps = state(0);
	let open = state(false);
	let picks = state(0);
	let marks = state(0);
	const field = element();

	<main>
		<button data-tap onClick={() => taps++}>Tap</button>
		<output data-taps>{taps}</output>
		<button data-toggle onClick={() => (open = !open)}>Toggle</button>
		@if (open) {
			<p data-shown>Shown</p>
		}
		<section data-panel onClick={() => marks++}>
			<button data-pick onClick={() => picks++}>Pick</button>
			<output data-picks>{picks}</output>
			<output data-marks>{marks}</output>
		</section>
		<input el={field} data-field />
	</main>
}
