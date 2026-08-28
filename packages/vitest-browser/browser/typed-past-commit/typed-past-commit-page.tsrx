import { state } from '@markless/core';

// A field whose text is the page's own cell: the handler reads the element and
// writes the cell, and the cell is bound back onto the element's `value`. The
// handler waits before it writes, which is what every dispatch does for real -
// it loads its symbol, settles the graph's write observers and then commits -
// only here the wait is long enough to type through on purpose.
export default function TypedPastCommitPage() @{
	const own = state({ text: '' });

	<main>
		<input
			data-testid="field"
			type="text"
			value={own.text}
			onInput={async (event) => {
				const next = (event.target as HTMLInputElement).value;
				await new Promise((resolve) => setTimeout(resolve, 60));
				own.text = next;
			}}
		/>
		<output data-testid="text">{own.text}</output>
	</main>
}
