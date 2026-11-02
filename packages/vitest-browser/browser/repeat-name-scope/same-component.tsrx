import { state } from '@markless/core';

function List(props: { lead: string }) @{
	let entries = state([
		{ id: 1, name: 'one' },
		{ id: 2, name: 'two' },
	]);
	const panel = { name: props.lead.toUpperCase() };
	<article>
		<h2 data-heading title={panel.name + '?'}>{panel.name + '!'}</h2>
		<ul>
			@for (const panel of entries; key panel.id) {
				<li data-entry={panel.id} title={panel.name + '#' + panel.id}>
					{panel.name}
					<em data-mixed>{panel.name + '!'}</em>
				</li>
			}
		</ul>
		<button type="button" data-add onClick={() => (entries = [...entries, { id: entries.length + 1, name: 'new' }])}>add</button>
	</article>
}

export default function SameComponent() @{
	<List lead="lead" />
}
