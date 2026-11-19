import { element, state } from '@markless/core';

function same(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	for (let at = 0; at < a.length; at++) if (a[at] !== b[at]) return false;
	return true;
}

export default function Commands() @{
	let list = state<readonly string[]>(['a']);
	let note = state('');
	const field = element<HTMLInputElement>();
	<main>
		<input el={field} value={note} onInput={(event) => (note = event.currentTarget.value)} />
		<p>{same(list, ['a']) ? 'Same' : 'Changed'}</p>
		<button onClick={() => {
			list = [...list, 'b'];
			field.focus();
		}}>Grow</button>
		<button onClick={() => {
			list = ['a'];
			field.scrollIntoView();
			field.focus({ preventScroll: true });
		}}>Reset</button>
	</main>
}
