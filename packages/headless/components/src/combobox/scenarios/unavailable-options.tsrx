import { combobox } from '../../index.ts';

// An option nobody may choose, and a whole combobox nobody may use. The arrow
// walk steps past the first; the second refuses every gesture.
export function UnavailableOptions() @{
	<div>
		<combobox.root open loop data-testid="root">
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
		<combobox.root open disabled data-testid="locked-root">
			<combobox.label data-testid="locked-label">Archived plan</combobox.label>
			<combobox.input data-testid="locked-input" />
			<combobox.trigger data-testid="locked-trigger">Show</combobox.trigger>
			<combobox.content data-testid="locked-content">
				<combobox.item value="legacy" label="Legacy" data-testid="locked-legacy">
					<combobox.itemlabel data-testid="locked-legacy-itemlabel">Legacy</combobox.itemlabel>
				</combobox.item>
			</combobox.content>
		</combobox.root>
	</div>
}
