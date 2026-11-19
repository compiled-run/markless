import { state } from '@markless/core';
import { modal, popover } from '@markless/ui';

export default function Index() @{
	let changes = state(0);
	<main>
		<p data-changes>Changes {changes}</p>
		<popover.root onChange={() => (changes = changes + 1)}>
			<popover.trigger data-popover-trigger>Filters</popover.trigger>
			<popover.content data-popover>
				<popover.title>Show only</popover.title>
			</popover.content>
		</popover.root>
		<modal.root>
			<modal.trigger data-modal-trigger>Delete draft</modal.trigger>
			<modal.backdrop data-modal>
				<modal.content>
					<modal.title>Delete this draft?</modal.title>
					<modal.close>Delete</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</main>
}
