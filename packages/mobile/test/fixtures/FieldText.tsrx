import { element, state } from '@markless/core';

export default function FieldText() @{
	const name = element<HTMLInputElement>();
	let shown = state('nothing');
	<main>
		<input
			el={name}
			aria-label="Name"
			value="Ada"
			onKeyDown={(event) => {
				if (event.key === 'Enter') shown = `entered ${(event.target as HTMLInputElement).value}`;
			}}
			onFocus={() => (shown = 'typing')}
			onBlur={(event) => (shown = `left ${(event.currentTarget as HTMLInputElement).value}`)}
		/>
		<button onClick={() => (shown = `read ${name.value}`)}>Read</button>
		<p>{shown}</p>
	</main>
}
