import { computed, state } from '@markless/core';

const catalog = [
	{ id: 'oak', label: 'Oak', kind: 'tree' },
	{ id: 'fern', label: 'Fern', kind: 'plant' },
	{ id: 'elm', label: 'Elm', kind: 'tree' },
];

export default function BoundaryRowAttributes() @{
	let kind = state('tree');
	const matches = computed(async () => {
		const wanted = kind;
		await Promise.resolve();
		return catalog.filter((entry) => entry.kind === wanted);
	});
	<section>
		<button data-plants onClick={() => (kind = 'plant')}>plants</button>
		<button data-trees onClick={() => (kind = 'tree')}>trees</button>
		@try {
			<ol>
				@for (const entry of matches; key entry.id) {
					<li id={entry.id} data-kind={entry.kind} title={entry.label}>{entry.label}</li>
				}
			</ol>
		} @pending {
			<p>loading</p>
		}
	</section>
}
