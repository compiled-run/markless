import { state } from '@markless/core';
import { modal } from '@markless/ui';

export default function App() @{
	let deleted = state(0);
	let changes = state(0);
	<main>
		<h1>Modal</h1>
		<p>Deleted {deleted}</p>
		<p>Changes {changes}</p>
		<modal.root onChange={() => (changes = changes + 1)}>
			<modal.trigger>Delete draft</modal.trigger>
			<modal.backdrop>
				<modal.content>
					<modal.title>Delete this draft?</modal.title>
					<modal.description>It cannot be undone</modal.description>
					<modal.close onClick={() => deleted++}>Delete</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
		<modal.root alert>
			<modal.trigger>Sign out</modal.trigger>
			<modal.backdrop>
				<modal.content>
					<modal.title>Sign out now?</modal.title>
					<modal.close>Stay</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</main>
}
