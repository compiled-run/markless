import { state } from '@markless/core';

export default function App() @{
	let searched = state('No search yet');
	let place = state('No place yet');
	let presses = state(0);
	<main>
		<h1>Find</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				searched = `Searched for ${String(new FormData(event.currentTarget).get('q'))}`;
			}}
		>
			<input aria-label="Search" name="q" />
		</form>
		<p>{searched}</p>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				place = `Going to ${String(data.get('city'))}, ${String(data.get('country'))}`;
			}}
		>
			<input aria-label="City" name="city" />
			<input aria-label="Country" name="country" />
			<button type="submit" onClick={() => (presses = presses + 1)}>
				Go
			</button>
		</form>
		<p>{place}</p>
		<p>Go pressed {presses} times</p>
	</main>
}
