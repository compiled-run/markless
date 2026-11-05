import { state } from '@markless/core';
import Press from './press.tsrx';

function Tally({ name }: { readonly name: string }) @{
	const tally = state({ count: 1 });
	<p>
		<Press label={name + '-add'} onPress={() => { tally.count += 1; }}>add</Press>
		<Press label={name + '-double'} onPress={() => { tally.count *= 2; }}>double</Press>
		<b data-count={name}>{tally.count}</b>
	</p>
}

export default function ParentState() @{
	<article>
		<Tally name="apples" />
		<Tally name="pears" />
	</article>
}
