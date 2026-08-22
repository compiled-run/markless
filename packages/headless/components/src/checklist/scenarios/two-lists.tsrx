import { checkbox, checklist } from '../../index.ts';

// Two checklists on one page. Each root is its own instance boundary, so a
// select-all in one must leave the other's items exactly where they were.
export default function TwoLists() @{
	<section>
		<checklist.root values={['lettuce', 'tomato']} data-testid="left-root">
			<checklist.label data-testid="left-label">Sandwich Condiments</checklist.label>
			<checklist.selectall data-testid="left-selectall">
				<checkbox.trigger data-testid="left-selectall-trigger">
					<checkbox.indicator data-testid="left-selectall-indicator">Checked</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label data-testid="left-selectall-label">All condiments</checkbox.label>
			</checklist.selectall>
			<checklist.item value="lettuce" data-testid="left-lettuce">
				<checkbox.trigger data-testid="left-lettuce-trigger">
					<checkbox.indicator data-testid="left-lettuce-indicator">Checked</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label data-testid="left-lettuce-label">Lettuce</checkbox.label>
			</checklist.item>
			<checklist.item value="tomato" data-testid="left-tomato">
				<checkbox.trigger data-testid="left-tomato-trigger">
					<checkbox.indicator data-testid="left-tomato-indicator">Checked</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label data-testid="left-tomato-label">Tomato</checkbox.label>
			</checklist.item>
		</checklist.root>
		<checklist.root values={['sourdough', 'rye']} data-testid="right-root">
			<checklist.label data-testid="right-label">Breads</checklist.label>
			<checklist.selectall data-testid="right-selectall">
				<checkbox.trigger data-testid="right-selectall-trigger">
					<checkbox.indicator data-testid="right-selectall-indicator">Checked</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label data-testid="right-selectall-label">All breads</checkbox.label>
			</checklist.selectall>
			<checklist.item value="sourdough" data-testid="right-sourdough">
				<checkbox.trigger data-testid="right-sourdough-trigger">
					<checkbox.indicator data-testid="right-sourdough-indicator">Checked</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label data-testid="right-sourdough-label">Sourdough</checkbox.label>
			</checklist.item>
			<checklist.item value="rye" data-testid="right-rye">
				<checkbox.trigger data-testid="right-rye-trigger">
					<checkbox.indicator data-testid="right-rye-indicator">Checked</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label data-testid="right-rye-label">Rye</checkbox.label>
			</checklist.item>
		</checklist.root>
	</section>
}
