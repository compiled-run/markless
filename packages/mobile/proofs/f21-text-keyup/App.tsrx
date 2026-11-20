import { state } from '@markless/core';

export default function App() @{
	let seen = state('No keys yet');
	let wasEmpty = state(true);
	let removed = state(0);
	let typedOnce = state(false);
	<main>
		<h1>Chips</h1>
		<input
			aria-label="Chip"
			onKeyDown={(event) => {
				wasEmpty = (event.target as HTMLInputElement).value === '';
			}}
			onKeyUp={(event) => {
				const text = (event.target as HTMLInputElement).value;
				if (text !== '') typedOnce = true;
				if (event.key === 'Backspace' || event.key === 'Enter') seen = `${event.key} left [${text}]`;
				if (event.key === 'Backspace' && typedOnce && wasEmpty && text === '') {
					removed = removed + 1;
					typedOnce = false;
				}
			}}
		/>
		<p>{seen}</p>
		<p>Removed {removed}</p>
	</main>
}
