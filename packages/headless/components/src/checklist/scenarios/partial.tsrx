import { checklist } from '../../index.ts';

// One of three ticked, so the select-all is in the third state. The hidden field
// is here too: a mixed box carries the `indeterminate` property on the native
// input and `aria-checked="mixed"` on the ARIA element, never both on one.
export default function Partial() @{
	<checklist.root value={['tomato']} values={['lettuce', 'tomato', 'mustard']} data-testid="root">
		<checklist.label data-testid="label">Sandwich Condiments</checklist.label>
		<checklist.field data-testid="selectall-field" />
		<checklist.selectall data-testid="selectall-trigger">
			<checklist.selectallindicator data-testid="selectall-indicator">Checked</checklist.selectallindicator>
		</checklist.selectall>
		<checklist.item value="lettuce" data-testid="lettuce">
			<checklist.itemtrigger data-testid="lettuce-trigger">
				<checklist.itemindicator data-testid="lettuce-indicator">Checked</checklist.itemindicator>
			</checklist.itemtrigger>
			<checklist.itemlabel data-testid="lettuce-label">Lettuce</checklist.itemlabel>
		</checklist.item>
		<checklist.item value="tomato" data-testid="tomato">
			<checklist.itemtrigger data-testid="tomato-trigger">
				<checklist.itemindicator data-testid="tomato-indicator">Checked</checklist.itemindicator>
			</checklist.itemtrigger>
			<checklist.itemlabel data-testid="tomato-label">Tomato</checklist.itemlabel>
		</checklist.item>
		<checklist.item value="mustard" data-testid="mustard">
			<checklist.itemtrigger data-testid="mustard-trigger">
				<checklist.itemindicator data-testid="mustard-indicator">Checked</checklist.itemindicator>
			</checklist.itemtrigger>
			<checklist.itemlabel data-testid="mustard-label">Mustard</checklist.itemlabel>
		</checklist.item>
	</checklist.root>
}
