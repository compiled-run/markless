import { state } from '@markless/core';

const panels = [
	{ id: 'a', title: 'Alpha' },
	{ id: 'b', title: 'Beta' },
];

function Menu(props: { items: typeof panels }) @{
	let open = state('');
	<nav>
	<ul>
		@for (const panel of props.items; key panel.id) {
			<li data-panel={panel.id}>
				<button type="button" data-toggle={panel.id} onClick={() => (open = panel.id)}>{panel.title}</button>
			</li>
		}
	</ul>
	<output data-open>{open}</output>
	</nav>
}

function Detail(props: { items: typeof panels; id: string }) @{
	const panel = props.items.find((candidate) => candidate.id === props.id)!;
	<section data-detail title={panel.id}>{panel.title}</section>
}

export default function Page() @{
	<main>
		<Menu items={panels} />
		<Detail items={panels} id="b" />
	</main>
}
