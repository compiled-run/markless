import { state } from '@markless/core';

// Checkboxes that are "mixed" before anything happens on the page: from state, from a constant, and in a row.
export default function ServedMixedPage() @{
	let mixed = state(true);
	let folders = state([
		{ id: 'docs', partly: true },
		{ id: 'pics', partly: false },
	]);
	let level = state(0.5);

	<main>
		<label>
			<input id="all" type="checkbox" indeterminate={mixed} onChange={() => (mixed = false)} />
			All files
		</label>
		<input id="fixed" type="checkbox" indeterminate aria-label="Always mixed" />
		<ul>
			@for (const folder of folders; key folder.id) {
				<li>
					<input class="folder" type="checkbox" data-id={folder.id} indeterminate={folder.partly} aria-label={folder.id} />
				</li>
			}
		</ul>
		<audio id="sound" volume={level} />
		<p>The volume and the scrollTop are words here, not attributes.</p>
	</main>
}
