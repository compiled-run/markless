import { state } from '@markless/core';
import { Panel } from './prop-mixed-parts.tsrx';

function Pane({ title }: { readonly title?: string }) @{
	let shown = state(true);
	<p data-pane data-title={shown ? (title ?? 'none') + '!' : '-'} onClick={() => shown = !shown}>pane</p>
}

export default function PropMixed() @{
	let name = state('alpha');

	<section>
		<button type="button" data-rename onClick={() => name = name + '+'}>rename</button>
		<Panel label={name} />
		<Panel label="fixed" />
		<Pane title={name} />
		<Pane title="still" />
		<Pane />
	</section>
}
