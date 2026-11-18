import { state } from '@markless/core';
import { popover } from '@markless/ui';

export default function App() @{
	let changes = state(0);
	<main>
		<h1>Popover</h1>
		<p>Changes {changes}</p>
		<popover.root onChange={() => (changes = changes + 1)}>
			<popover.trigger>Filters</popover.trigger>
			<popover.content>
				<popover.title>Show only</popover.title>
				<popover.description>Pick what the list shows</popover.description>
				<popover.close>Done</popover.close>
			</popover.content>
		</popover.root>
	</main>
}
