import { state } from '@markless/core';

export default function VisibleRegion({ id, tag }: { id: string; tag: string }) @{
	let seen = state('nothing yet');
	let clicked = state('not clicked');
	<div attach={() => void (seen = `attach read id ${String(id)}`)} onVisible={() => {}}>
		<p data-region-probe>{seen}</p>
		<button type="button" data-region-click onClick={() => (clicked = `click read ${tag}`)}>{clicked}</button>
	</div>
}
