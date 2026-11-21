import { element, state } from '@markless/core';
import { report } from './report.ts';

export default function FromEnd() @{
	let lead = state(true);
	let tags = state(['x', 'y']);
	const rows = element<HTMLElement[]>();
	const box = element<HTMLElement>();

	<section el={box}>
		@if (lead) {
			<h2>lead</h2>
		}
		<h3>head</h3>
		@for (const tag of tags; key tag) {
			<i el={rows}>{tag}</i>
		}
		<p>end</p>
		<button data-op="add" onClick={() => { tags.push(`t${tags.length}`); report(box!, rows); }}>add</button>
		<button data-op="del" onClick={() => { tags.shift(); report(box!, rows); }}>del</button>
	</section>
}
