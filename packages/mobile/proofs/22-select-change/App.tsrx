import { state } from '@markless/core';

function shout(text: string): string {
	let out = '';
	for (const letter of text) out += letter.toUpperCase();
	return out;
}

export default function App() @{
	let make = state('none');
	let changes = state(0);
	let size = state('none');
	<main>
		<h1>Pick a car</h1>
		<select
			name="make"
			aria-label="Make"
			onChange={(event) => {
				make = (event.target as HTMLSelectElement).value;
				changes++;
			}}
		>
			<option value="audi">Audi</option>
			<option value="toyota">Toyota</option>
			<option value="bmw">BMW</option>
		</select>
		<select aria-label="Size" onChange={(event) => (size = shout(event.currentTarget.value))}>
			<option>small</option>
			<option>large</option>
		</select>
		<p>{`Make ${make}`}</p>
		<p>{`Changes ${changes}`}</p>
		<p>{`Size ${size}`}</p>
	</main>
}
