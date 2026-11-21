import { element, state } from '@markless/core';
import { report } from './report.ts';

export default function Order() @{
	let tags = state(['x', 'y']);
	const rows = element<HTMLElement[]>();
	const box = element<HTMLElement>();

	<section el={box}>
		@for (const tag of tags; key tag) {
			<i el={rows}>{tag}</i>
		}
		<p>end</p>
		<button data-op="unshift" onClick={() => { tags.unshift('w'); report(box!, rows); }}>unshift</button>
		<button data-op="reverse" onClick={() => { tags.reverse(); report(box!, rows); }}>reverse</button>
		<button data-op="sort" onClick={() => { tags.sort((a, b) => b.localeCompare(a)); report(box!, rows); }}>sort</button>
		<button data-op="assign" onClick={() => { tags = ['y', 'x']; report(box!, rows); }}>assign</button>
		<button data-op="splice" onClick={() => { tags.splice(1, 0, 'm'); report(box!, rows); }}>splice</button>
	</section>
}
