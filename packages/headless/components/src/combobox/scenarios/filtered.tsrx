import { computed } from '@markless/core';
import { combobox } from '../../index.ts';

// The family ships NO filter. The consumer filters their own list from the text
// the field is carrying, and `@empty` is what they say when nothing matches -
// which is the whole reason the `combobox.empty` part was dropped.
//
// A component of the consumer's own, INSIDE the root, is what reads the
// instance: a widget-scoped shared definition is rooted by the module that
// declares it, so a consumer reading one is a part of that widget.
function Options() @{
	const c = combobox.state();
	// The list is written INSIDE the computed. A module-level const read from one
	// is not carried into the lowered symbol - `ReferenceError: FRUITS is not
	// defined` at the first refresh - so the data lives where it is read.
	const matches = computed(() =>
		['Apple', 'Banana', 'Cherry', 'Grape'].filter((fruit) =>
			fruit.toLowerCase().includes(c.input.toLowerCase()),
		),
	);

	// The wrapper is forced: a construct cannot open directly inside a component
	// tag. `role="presentation"` re-parents it out of the accessibility tree, so
	// the list still owns its options.
	<div role="presentation" data-testid="rows">
		<p role="presentation" data-testid="count">{matches.length}</p>
		@for (const fruit of matches; key fruit) {
			<combobox.item value={fruit} data-testid="row">
				<combobox.itemlabel data-testid="row-itemlabel">{fruit}</combobox.itemlabel>
			</combobox.item>
		} @empty {
			<p data-testid="empty">Nothing matches</p>
		}
	</div>
}

export function Filtered() @{
	<combobox.root open data-testid="root">
		<combobox.label data-testid="label">Favorite Fruit</combobox.label>
		<combobox.input data-testid="input" />
		<combobox.trigger data-testid="trigger">Show</combobox.trigger>
		<combobox.content data-testid="content">
			<Options />
		</combobox.content>
	</combobox.root>
}
