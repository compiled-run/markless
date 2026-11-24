import { element, state } from '@markless/core';
import { report } from './report.ts';

export default function Between() @{
	let tags = state(['x', 'y']);
	const rows = element<HTMLElement[]>();
	const box = element<HTMLElement>();

	<section el={box}>
		<h2>head</h2>
		@for (const tag of tags; key tag) {
			<i el={rows}>{tag}</i>
		}
		<p>end</p>
		<button data-op="add" onClick={() => { tags.push(`t${tags.length}`); report(box!, rows); }}>add</button>
	</section>
}
