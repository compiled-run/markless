import { barState } from './bar.tsrx';

// The third registering axis: a part that is its module's ONLY component, so the
// module partitions no payload nodes between components. It roots nothing, and
// the family it registers into is one it merely imported.
export function SolePart({ name }) @{
	const bar = barState();

	<button type="button" data-knob data-name={name} el={bar.itemEls} tabindex={0}>{name}</button>
}
