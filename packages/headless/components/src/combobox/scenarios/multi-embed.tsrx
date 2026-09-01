import { combobox } from '../../index.ts';

// One embed's worth of page, mounted twice as two islands. Closed at rest, unlike
// the select scenario beside it: this family's list is an overlay, and two showing
// overlays on one page dismiss each other, which would drown the isolation reds in
// stacking behaviour. So the gesture under test is the one that opens.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<combobox.root data-testid="root">
			<combobox.label data-testid="label">Membership</combobox.label>
			<combobox.input data-testid="input" />
			<combobox.trigger data-testid="trigger">Show</combobox.trigger>
			<combobox.content data-testid="content">
				<combobox.item value="basic" label="Basic" data-testid="basic">
					<combobox.itemlabel data-testid="basic-itemlabel">Basic</combobox.itemlabel>
				</combobox.item>
				<combobox.item value="premium" label="Premium" disabled data-testid="premium">
					<combobox.itemlabel data-testid="premium-itemlabel">Premium</combobox.itemlabel>
				</combobox.item>
				<combobox.item value="ultra" label="Ultra" data-testid="ultra">
					<combobox.itemlabel data-testid="ultra-itemlabel">Ultra</combobox.itemlabel>
				</combobox.item>
			</combobox.content>
		</combobox.root>
	</section>
}
