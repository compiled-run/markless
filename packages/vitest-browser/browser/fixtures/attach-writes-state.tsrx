import { state } from '@markless/core';

export function App() @{
	let measured = state('no');
	let count = state(0);
	let seenCount = state(-1);
	let label = state('none');

	<section>
		<div data-attach-writer attach={(element) => { measured = element.tagName.toLowerCase(); }} onVisible={() => {}}>Writer</div>
		<article data-name="card" attach={(node: HTMLElement) => { label = node.dataset.name ?? 'missing'; return () => { label = 'cleaned'; }; }} onVisible={() => {}}>Card</article>
		<aside attach={function (node) { seenCount = count + node.childElementCount; }} onVisible={() => {}}><i>a</i></aside>
		<output data-measured>{measured}</output>
		<output data-label>{label}</output>
		<output data-seen-count>{seenCount}</output>
		<button type="button" data-bump onClick={() => count++}>{count}</button>
	</section>
}
