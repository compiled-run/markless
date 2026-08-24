import { checklist } from '../../index.ts';

export default function Basic() @{
	<checklist.root values={['lettuce', 'tomato', 'mustard']} data-testid="root">
		<checklist.label data-testid="label">Sandwich Condiments</checklist.label>
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
