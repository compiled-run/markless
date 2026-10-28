import { state } from '@markless/core';

// A mixed checkbox inside an @if that first opens in the browser, and a mixed row added in the browser.
export default function ArmMixedPage() @{
	let open = state(false);
	let mixed = state(true);
	let folders = state([{ id: 'docs', partly: false }]);

	<main>
		<button id="open" onClick={() => (open = true)}>open</button>
		<button id="add" onClick={() => (folders = [...folders, { id: 'pics', partly: true }])}>add</button>
		@if (open) {
			<p>
				<input id="inner" type="checkbox" indeterminate={mixed} aria-label="Inner" />
				<input id="inner-fixed" type="checkbox" indeterminate aria-label="Inner fixed" />
			</p>
		}
		<ul>
			@for (const folder of folders; key folder.id) {
				<li>
					<input class="folder" type="checkbox" data-id={folder.id} indeterminate={folder.partly} />
					<input class="fixed" type="checkbox" data-id={folder.id} indeterminate />
				</li>
			}
		</ul>
	</main>
}
