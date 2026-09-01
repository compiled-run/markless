import { select } from '../../index.ts';

// One embed's worth of page, mounted twice as two islands. The listbox is handed
// over open so the option roster is reachable at rest: a merged `optionEls` handle
// only shows itself once a walk can start inside one embed. `banana` is locked in
// the middle so the walk steps past it, and `cherry` is last so ArrowDown from
// there either stays put or escapes into the next embed.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<select.root open data-testid="root">
			<select.label data-testid="label">Favorite Fruit</select.label>
			<select.trigger data-testid="trigger">Choose a Fruit</select.trigger>
			<select.content data-testid="content">
				<select.item value="apple" data-testid="apple">
					<select.itemlabel data-testid="apple-itemlabel">Apple</select.itemlabel>
				</select.item>
				<select.item value="banana" disabled data-testid="banana">
					<select.itemlabel data-testid="banana-itemlabel">Banana</select.itemlabel>
				</select.item>
				<select.item value="cherry" data-testid="cherry">
					<select.itemlabel data-testid="cherry-itemlabel">Cherry</select.itemlabel>
				</select.item>
			</select.content>
		</select.root>
	</section>
}
