import { state } from '@markless/core';

// Every read on the host is over the same two cells. The three method calls sit
// in both template positions - text child and attribute - beside a property read
// that was already reactive, so a stale call is visible against a live neighbour
// on the same element.
export default function MethodReadPage() @{
	const box = state({ items: ['alpha', 'beta'] as readonly string[], label: 'ready' });

	<section data-page>
		<div
			data-testid="host"
			ui-joined={box.items.join('|')}
			ui-tail={box.items.slice(1)}
			ui-shout={box.label.toUpperCase()}
		>
			<span data-testid="joined">{box.items.join('|')}</span>
			<span data-testid="tail">{box.items.slice(1)}</span>
			<span data-testid="shout">{box.label.toUpperCase()}</span>
			<span data-testid="len">{box.items.length}</span>
		</div>
		<button
			type="button"
			data-testid="grow"
			onClick={() => {
				box.items = [...box.items, 'gamma'];
				box.label = 'grown';
			}}
		>grow</button>
	</section>
}
