import { element, state } from '@markless/core';
import { report } from './report.ts';

export default function Unwrapped() @{
	let tags = state(['x', 'y']);
	const rows = element<HTMLElement[]>();
	const box = element<HTMLElement>();

	<section el={box}>
		@for (const tag of tags; key tag) {
			<i el={rows}>{tag}</i>
		}
		<button data-op="add" onClick={() => { tags.push(`t${tags.length}`); report(box!, rows); }}>add</button>
		<button data-op="del" onClick={() => { tags.shift(); report(box!, rows); }}>del</button>
		<button data-op="move" onClick={() => { tags.push(tags.shift()!); report(box!, rows); }}>move</button>
		<p>end</p>
	</section>
}
