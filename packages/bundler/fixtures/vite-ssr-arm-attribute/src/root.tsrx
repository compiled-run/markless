import { state } from '@markless/core';

export function App() @{
	let open = state(false);
	let draft = state('');

	<main>
		<button id="fresh" onClick={() => {
			if (!open) draft = '';
			open = !open;
		}}>Write a fresh note</button>
		<button id="peek" onClick={() => (open = !open)}>Peek</button>
		<button id="fill" onClick={() => (draft = 'from "fill" & <co>')}>Fill</button>
		@if (open) {
			<label>
				Note
				<input id="draft" value={draft} title={draft} onInput={(event) => (draft = event.currentTarget.value)} />
			</label>
			<p id="echo">Draft: {draft}</p>
		}
	</main>
}
