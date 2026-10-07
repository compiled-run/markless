import { state } from '@markless/core';
import Card, { Act, Band } from './lkd-card.tsrx';

const seed = (count: number): readonly string[] => ['a', 'b', 'c', 'd'].slice(0, count);

export default function ProjectedCallback() @{
	let names = state(seed(3));
	let last = state('');
	<Card>
		<Band>
			<Act
				disabled={names.length === 0}
				onPress={() => {
					last = 'drop';
					names = names.slice(1);
				}}
			>
				Drop
			</Act>
		</Band>
		<p data-count>{names.length}</p>
		<p>{last}</p>
	</Card>
}
