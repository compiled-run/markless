import { checklist } from '../../index.ts';

export default function TwoLists() @{
	<section>
		<checklist.root values={['lettuce', 'tomato']} data-testid="left-root">
			<checklist.label data-testid="left-label">Sandwich Condiments</checklist.label>
			<checklist.selectall data-testid="left-selectall-trigger">
				<checklist.selectallindicator data-testid="left-selectall-indicator">Checked</checklist.selectallindicator>
			</checklist.selectall>
			<checklist.item value="lettuce" data-testid="left-lettuce">
				<checklist.itemtrigger data-testid="left-lettuce-trigger">
					<checklist.itemindicator data-testid="left-lettuce-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="left-lettuce-label">Lettuce</checklist.itemlabel>
			</checklist.item>
			<checklist.item value="tomato" data-testid="left-tomato">
				<checklist.itemtrigger data-testid="left-tomato-trigger">
					<checklist.itemindicator data-testid="left-tomato-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="left-tomato-label">Tomato</checklist.itemlabel>
			</checklist.item>
		</checklist.root>
		<checklist.root values={['sourdough', 'rye']} data-testid="right-root">
			<checklist.label data-testid="right-label">Breads</checklist.label>
			<checklist.selectall data-testid="right-selectall-trigger">
				<checklist.selectallindicator data-testid="right-selectall-indicator">Checked</checklist.selectallindicator>
			</checklist.selectall>
			<checklist.item value="sourdough" data-testid="right-sourdough">
				<checklist.itemtrigger data-testid="right-sourdough-trigger">
					<checklist.itemindicator data-testid="right-sourdough-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="right-sourdough-label">Sourdough</checklist.itemlabel>
			</checklist.item>
			<checklist.item value="rye" data-testid="right-rye">
				<checklist.itemtrigger data-testid="right-rye-trigger">
					<checklist.itemindicator data-testid="right-rye-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="right-rye-label">Rye</checklist.itemlabel>
			</checklist.item>
		</checklist.root>
	</section>
}
