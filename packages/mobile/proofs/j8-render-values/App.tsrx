import { state } from '@markless/core';
import { initials } from '../lib/names.ts';

function vowels(text: string): number {
	return text.replace(/[^aeiou]/gi, '').length;
}

export default function App() @{
	let name = state('Ada Lovelace');
	<main>
		<h1>Render</h1>
		<p>Initials: {initials(name)}</p>
		<p>Vowels: {vowels(name)}</p>
		<button aria-label={`Rename ${initials(name)}`} onClick={() => (name = 'Grace Hopper')}>
			Rename
		</button>
	</main>
}
