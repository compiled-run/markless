import { state } from '@markless/core';

function Tabs(props: { tabs: ReadonlyArray<{ key: string; label: string }> }) @{
	let picked = state('');
	<div>
		@for (const panel of props.tabs; key panel.key) {
			<button type="button" data-tab={panel.key} onClick={() => (picked = panel.key)}>{panel.label}</button>
		}
		<output data-picked>{picked}</output>
	</div>
}

function Cards(props: { cards: ReadonlyArray<{ slug: string; heading: string; body: string }> }) @{
	<ol>
		@for (const panel of props.cards; key panel.slug) {
			<li data-card={panel.slug} title={panel.body}>{panel.heading}</li>
		}
	</ol>
}

export default function TwoLoops() @{
	<section>
		<Tabs tabs={[{ key: 'x', label: 'Ex' }, { key: 'y', label: 'Why' }]} />
		<Cards cards={[{ slug: 'p', heading: 'Pea', body: 'green' }]} />
	</section>
}
