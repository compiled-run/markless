import { checkbox, checklist } from '../../index.ts';

// The starter a consumer copies: a select-all over three condiments, none ticked.
// The checkbox parts are written directly inside each item, because an item roots
// a real checkbox instance and those parts resolve their own family's root.
export default function Basic() @{
	<checklist.root values={['lettuce', 'tomato', 'mustard']} data-testid="root">
		<checklist.label data-testid="label">Sandwich Condiments</checklist.label>
		<checklist.selectall data-testid="selectall">
			<checkbox.trigger data-testid="selectall-trigger">
				<checkbox.indicator data-testid="selectall-indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="selectall-label">All condiments</checkbox.label>
		</checklist.selectall>
		<checklist.item value="lettuce" data-testid="lettuce">
			<checkbox.trigger data-testid="lettuce-trigger">
				<checkbox.indicator data-testid="lettuce-indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="lettuce-label">Lettuce</checkbox.label>
		</checklist.item>
		<checklist.item value="tomato" data-testid="tomato">
			<checkbox.trigger data-testid="tomato-trigger">
				<checkbox.indicator data-testid="tomato-indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="tomato-label">Tomato</checkbox.label>
		</checklist.item>
		<checklist.item value="mustard" data-testid="mustard">
			<checkbox.trigger data-testid="mustard-trigger">
				<checkbox.indicator data-testid="mustard-indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="mustard-label">Mustard</checkbox.label>
		</checklist.item>
	</checklist.root>
}
