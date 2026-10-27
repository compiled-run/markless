// Type "xyz": three handler runs start as the keys land, each logging the text it read.
import { state } from '@markless/core';

export default function AsyncHandlerQueue() @{
	let log = state('');
	<main>
		<input onInput={async (event) => {
			const value = (event.currentTarget as HTMLInputElement).value;
			const started = Math.round(performance.now());
			await new Promise((resolve) => setTimeout(resolve, 400));
			log = `${log} ${value}@${started}`;
		}} />
		<p>{log}</p>
	</main>
}
