import { state } from '@markless/core';
import { buttongroup } from '@markless/ui';

export default function App() @{
	let align = state('left');
	let style = state('plain');
	<main>
		<h1>Format</h1>
		<buttongroup.root value="left" required onChange={(next) => (align = String(next))}>
			<buttongroup.label>Alignment</buttongroup.label>
			<buttongroup.item value="left">Left</buttongroup.item>
			<buttongroup.item value="center">Center</buttongroup.item>
			<buttongroup.item value="right">Right</buttongroup.item>
		</buttongroup.root>
		<buttongroup.root multiple onChange={(next) => (style = String(next) || 'plain')}>
			<buttongroup.label>Style</buttongroup.label>
			<buttongroup.item value="bold">Bold</buttongroup.item>
			<buttongroup.item value="italic">Italic</buttongroup.item>
		</buttongroup.root>
		<p>{`Aligned ${align}`}</p>
		<p>{`Styled ${style}`}</p>
	</main>
}
