import { element, state } from '@markless/core';
import { report } from './report.ts';

export default function EmptySetHandle() @{
	let tags = state(new Set<string>());
	const rows = element<HTMLElement[]>();
	const box = element<HTMLDivElement>();
	let seen = state('');

	function add(tag: string) {
		tags.add(tag);
		seen = `${tags.size}`;
		report(box!, rows);
	}

	<section>
		<div el={box}>
			@for (const tag of tags; key tag) {
				<i el={rows}>{tag}</i>
			}
		</div>
		<button data-op="add" onClick={() => add('a')}>a</button>
		<button onClick={() => add('b')}>b</button>
		<p>{seen}</p>
	</section>
}
