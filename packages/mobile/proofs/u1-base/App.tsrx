import { state } from '@markless/core';
import { base } from '@markless/ui';

export default function App() @{
	let saved = state(false);
	<main>
		<h1>Base parts</h1>
		<base.button pressed={false} onChange={(next) => (saved = next)}>Save</base.button>
		<p>{saved ? 'Saved' : 'Not saved'}</p>
		<base.separator />
		<base.label>Draft</base.label>
		<base.button disabled={true}>Send</base.button>
	</main>
}
