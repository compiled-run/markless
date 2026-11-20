import { state } from '@markless/core';
import { addSite } from '../lib/site-log.ts';

export default function App() @{
	let log = state('[]');
	let last = state('none');
	let line = state('empty');
	<main>
		<h1>Site log</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const added = addSite(log, String(new FormData(event.currentTarget).get('site')));
				log = added.log;
				last = added.id;
				line = added.line;
			}}
		>
			<input aria-label="Site" name="site" value="North yard" />
			<button type="submit">Add</button>
		</form>
		<p>Last: {last}</p>
		<p>Log: {line}</p>
	</main>
}
