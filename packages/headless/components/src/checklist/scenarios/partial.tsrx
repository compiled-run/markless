import { checkbox, checklist } from '../../index.ts';

// One of three ticked, so the select-all is in the third state. The hidden fields
// are here too: a mixed box carries the `indeterminate` property on the native
// input and `aria-checked="mixed"` on the ARIA element, never both on one.
export default function Partial() @{
	<checklist.root value={['tomato']} values={['lettuce', 'tomato', 'mustard']} data-testid="root">
		<checklist.label data-testid="label">Sandwich Condiments</checklist.label>
		<checklist.selectall data-testid="selectall">
			<checkbox.field data-testid="selectall-field" />
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
