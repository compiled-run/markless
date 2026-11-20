import { element, state } from '@markless/core';
import { report } from './report.ts';

export default function SetHandle() @{
	let tags = state(new Set<string>(['x', 'y']));
	const rows = element<HTMLElement[]>();
	const box = element<HTMLDivElement>();

	<section>
		<div el={box}>
			@for (const tag of tags; key tag) {
				<i el={rows}>{tag}</i>
			}
		</div>
		<button data-op="add" onClick={() => { tags.add(`t${tags.size}`); report(box!, rows); }}>add</button>
		<button data-op="del" onClick={() => { tags.delete([...tags][0]!); report(box!, rows); }}>del</button>
		<button
			data-op="move"
			onClick={() => {
				const first = [...tags][0]!;
				tags.delete(first);
				tags.add(first);
				report(box!, rows);
			}}
		>move</button>
	</section>
}
