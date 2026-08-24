import { checklist } from '../../index.ts';

export default function UnavailableOptions() @{
	<section>
		<checklist.root value={['tomato']} values={['tomato', 'caviar']} data-testid="root">
			<checklist.label data-testid="label">Sandwich Condiments</checklist.label>
			<checklist.selectall data-testid="selectall-trigger">
				<checklist.selectallindicator data-testid="selectall-indicator">Checked</checklist.selectallindicator>
			</checklist.selectall>
			<checklist.item value="tomato" data-testid="tomato">
				<checklist.itemtrigger data-testid="tomato-trigger">
					<checklist.itemindicator data-testid="tomato-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="tomato-label">Tomato</checklist.itemlabel>
			</checklist.item>
			<checklist.item value="caviar" disabled data-testid="caviar">
				<checklist.itemtrigger data-testid="caviar-trigger">
					<checklist.itemindicator data-testid="caviar-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="caviar-label">Not available on your plan</checklist.itemlabel>
			</checklist.item>
		</checklist.root>
		<checklist.root disabled values={['mustard']} data-testid="locked-root">
			<checklist.label data-testid="locked-label">Fixed by your plan</checklist.label>
			<checklist.selectall data-testid="locked-selectall-trigger">
				<checklist.selectallindicator data-testid="locked-selectall-indicator">Checked</checklist.selectallindicator>
			</checklist.selectall>
			<checklist.item value="mustard" data-testid="locked-mustard">
				<checklist.itemtrigger data-testid="locked-mustard-trigger">
					<checklist.itemindicator data-testid="locked-mustard-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="locked-mustard-label">Mustard</checklist.itemlabel>
			</checklist.item>
		</checklist.root>
	</section>
}
