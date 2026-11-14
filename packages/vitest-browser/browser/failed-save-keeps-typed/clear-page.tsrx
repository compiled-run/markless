import { state } from '@markless/core';

export function ClearPage() @{
	let draft = state('');
	<main>
		<input name="draft" value={draft} onInput={(event) => (draft = event.currentTarget.value)} />
		<button type="button" data-clear onClick={() => (draft = '')}>Clear</button>
	</main>
}
