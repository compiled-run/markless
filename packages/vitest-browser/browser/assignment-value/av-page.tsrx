import { state } from '@markless/core';
import { Picker } from './av-picker.tsrx';
import { record } from './record.ts';

export default function AssignmentValuePage() @{
	let count = state(0);
	let other = state(0);
	let label = state<string | null>(null);
	let seen = state('');
	const list = state<number[]>([]);

	<section>
		<button data-case="argument" type="button" onClick={() => (seen = record('argument', (count = 5)))}>argument</button>
		<button data-case="compound" type="button" onClick={() => { seen = record('compound', (count += 2)); }}>compound</button>
		<button data-case="nullish" type="button" onClick={() => { seen = record('nullish', (label ??= 'set')); }}>nullish</button>
		<button data-case="chained" type="button" onClick={() => { seen = record('chained', (other = count = 7)); }}>chained</button>
		<button data-case="condition" type="button" onClick={() => {
			if ((count = 3) > 1) seen = 'condition:3';
		}}>condition</button>
		<button data-case="shadow" type="button" onClick={() => {
			const value = 4;
			seen = record('shadow', (count += value));
		}}>shadow</button>
		<button data-case="push" type="button" onClick={() => {
			list.push((count = 9));
		}}>push</button>
		<button data-case="returned" type="button" onClick={() => {
			const read = () => (count = 11);
			seen = record('returned', read());
		}}>returned</button>
		<Picker onPick={() => (count = 12)} />
		<output data-seen>{seen}</output>
		<output data-count>{count}</output>
		<output data-other>{other}</output>
		<output data-list>{list.join(',')}</output>
	</section>
}
