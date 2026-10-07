import { state } from '@markless/core';

export default function IndexKeyed() @{
	let entries = state([{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }, { id: 'z', label: 'Z' }]);
	let picked = state('');
	<section>
		<button data-reverse onClick={() => (entries = [...entries].reverse())}>Reverse</button>
		<button data-drop onClick={() => (entries = entries.filter((entry) => entry.id !== 'x'))}>Drop</button>
		<button data-grow onClick={() => (entries = [...entries, { id: 'w', label: 'W' }])}>Grow</button>
		<p data-picked>{picked}</p>
		<ol>
			// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: index-keyed rows must still update
			@for (const entry of entries; index n; key n) {
				<li data-row onClick={() => (picked = entry.label)}>{entry.label}</li>
			}
		</ol>
	</section>
}
