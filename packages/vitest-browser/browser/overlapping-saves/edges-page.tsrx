import { computed, state } from '@markless/core';
import { flip, loadBoard } from './server.ts';

function Tag({ label }: { label: string }) @{
	let mine = state(label);
	<li data-tag>{mine}</li>
}

export default function EdgesPage() @{
	const board = computed(async () => await loadBoard());
	let label = state('ready');
	let tags = state<string[]>(['t0']);

	<main>
		@try {
			<section>
				<button
					data-add-tag
					onClick={async () => {
						label = 'saving';
						await flip('a');
						label = 'saved';
						tags = [...tags, 't1'];
					}}
				>
					Tag
				</button>
				<p data-label>{label}</p>
				<p data-flags>{board.flags.length}</p>
				<ul>
					@for (const tag of tags; key tag) {
						<Tag label={label} />
					}
				</ul>
			</section>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
