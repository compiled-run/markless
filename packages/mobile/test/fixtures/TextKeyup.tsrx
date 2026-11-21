import { state } from '@markless/core';

export default function TextKeyup() @{
	let wasEmpty = state(true);
	let removed = state(0);
	let last = state('none');
	<main>
		<input
			aria-label="Chip"
			onKeyDown={(event) => {
				wasEmpty = (event.target as HTMLInputElement).value === '';
			}}
			onKeyUp={(event) => {
				const text = (event.target as HTMLInputElement).value;
				last = `${event.key} [${text}]`;
				if (event.key === 'Backspace' && wasEmpty && text === '') removed = removed + 1;
			}}
		/>
		<p>{last}</p>
		<p>Removed {removed}</p>
	</main>
}
