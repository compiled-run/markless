import { state } from '@markless/core';

function Badge(props: { id: string; all: ReadonlyArray<{ id: string; tone: string }> }) @{
	const panel = props.all.find((entry) => entry.id === props.id)!;
	<span data-badge={panel.id}>{panel.tone}</span>
}

export default function RowChild() @{
	let hits = state(0);
	const tones = [
		{ id: 'k1', tone: 'warm' },
		{ id: 'k2', tone: 'cool' },
	];
	<ul>
		@for (const panel of tones; key panel.id) {
			<li data-item={panel.id}>
				<Badge id={panel.id} all={tones} />
			</li>
		}
		<button type="button" data-hit onClick={() => (hits = hits + 1)}>{hits}</button>
	</ul>
}
