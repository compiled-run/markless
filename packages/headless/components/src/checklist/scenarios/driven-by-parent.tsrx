import { state } from '@markless/core';
import { checklist } from '../../index.ts';

// The page owns the lock: flipping it after the page is live has to reach every item.
export default function DrivenByParent() @{
	let locked = state(false);

	<section>
		<button type="button" data-testid="lock" onClick={() => { locked = !locked; }}>Lock</button>
		<checklist.root disabled={locked} values={['lettuce', 'tomato']} data-testid="root">
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
		</checklist.root>
	</section>
}
