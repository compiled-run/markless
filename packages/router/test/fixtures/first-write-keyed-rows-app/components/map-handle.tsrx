import { element, state } from '@markless/core';
import { report } from './report.ts';

export default function MapHandle() @{
	let tags = state(
		new Map<string, string>([
			['x', 'x'],
			['y', 'y'],
		]),
	);
	const rows = element<HTMLElement[]>();
	const box = element<HTMLDivElement>();

	<section>
		<div el={box}>
			@for (const [tag] of tags; key tag) {
				<i el={rows}>{tag}</i>
			}
		</div>
		<button data-op="add" onClick={() => { tags.set(`t${tags.size}`, 'n'); report(box!, rows); }}>add</button>
		<button data-op="del" onClick={() => { tags.delete([...tags.keys()][0]!); report(box!, rows); }}>del</button>
		<button
			data-op="move"
			onClick={() => {
				const first = [...tags.keys()][0]!;
				tags.delete(first);
				tags.set(first, first);
				report(box!, rows);
			}}
		>move</button>
	</section>
}
