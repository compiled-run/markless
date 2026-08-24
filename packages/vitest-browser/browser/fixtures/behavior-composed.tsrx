import { state } from '@markless/core';

// The composition-shaped sibling of `behavior-page-scope.tsrx`: a child
// component that takes a LIVE graph-bound prop and carries an authored
// `attach=` behavior on its own element. CSR activates authored behaviors
// BEFORE it demand-loads the runtime graph, so this behavior reaches its symbol
// through a graph-less activation context, and the prop binding must survive
// the pass.
function ComposedChild({ label }) @{
	const data = state({ count: 0 });

	<button
		type="button"
		data-child-part
		data-label={label}
		attach={(element) => {
			element.setAttribute('data-attached', 'child');
		}}
		onClick={() => {
			data.count = data.count + 1;
		}}
	>{data.count}</button>
}

export default function BehaviorComposed() @{
	const page = state({ label: 'row' });

	<main data-behavior-composed>
		<ComposedChild label={page.label} />
		<button
			type="button"
			data-relabel
			onClick={() => {
				page.label = 'moved';
			}}
		>relabel</button>
	</main>
}
