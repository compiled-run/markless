import { state } from '@markless/core';

export default function DestructuredLet() @{
	let obj = state({ a: 1, b: 10, tags: ['x'] });
	let shown = state('');
	const { a } = obj;
	<main>
		<output data-a>{a}</output>
		<output data-b>{obj.b}</output>
		<output data-tags>{obj.tags.join(',')}</output>
		<output data-local>{shown}</output>
		<button data-source onClick={() => { obj.a++; }}>source</button>
		<button
			data-copy
			onClick={() => {
				let { b } = obj;
				b++;
				let [first] = obj.tags;
				first = first + '!';
				shown = `${b} ${first}`;
			}}
		>copy</button>
		<button data-through onClick={() => { const { tags } = obj; tags.push('y'); }}>through</button>
	</main>
}
