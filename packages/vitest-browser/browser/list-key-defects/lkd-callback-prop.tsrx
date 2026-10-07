import { state } from '@markless/core';
import Trigger from './lkd-trigger.tsrx';

const seed = (count: number): readonly string[] => ['a', 'b', 'c', 'd'].slice(0, count);

export default function CallbackProp() @{
	let names = state(seed(3));
	<div>
		<Trigger onPress={() => (names = names.slice(1))} />
		<p data-count>{names.length}</p>
	</div>
}
