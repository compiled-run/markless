import { checklist } from '../../index.ts';

// A group that failed validation, written twice: the error after the items and
// the error before them. Every part of one instance seeds before any part
// renders, so document order does not decide what the group reads.
export default function WithError() @{
	<section>
		<checklist.root values={['lettuce']} data-testid="after-root">
			<checklist.label data-testid="after-label">Sandwich Condiments</checklist.label>
			<checklist.selectall data-testid="after-selectall-trigger">
				<checklist.selectallindicator data-testid="after-selectall-indicator">Checked</checklist.selectallindicator>
			</checklist.selectall>
			<checklist.item value="lettuce" data-testid="after-lettuce">
				<checklist.itemtrigger data-testid="after-lettuce-trigger">
					<checklist.itemindicator data-testid="after-lettuce-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="after-lettuce-label">Lettuce</checklist.itemlabel>
			</checklist.item>
			<checklist.error data-testid="after-error">Pick at least one condiment</checklist.error>
		</checklist.root>
		<checklist.root values={['tomato']} data-testid="before-root">
			<checklist.error data-testid="before-error">Pick at least one condiment</checklist.error>
			<checklist.label data-testid="before-label">Sandwich Condiments</checklist.label>
			<checklist.selectall data-testid="before-selectall-trigger">
				<checklist.selectallindicator data-testid="before-selectall-indicator">Checked</checklist.selectallindicator>
			</checklist.selectall>
			<checklist.item value="tomato" data-testid="before-tomato">
				<checklist.itemtrigger data-testid="before-tomato-trigger">
					<checklist.itemindicator data-testid="before-tomato-indicator">Checked</checklist.itemindicator>
				</checklist.itemtrigger>
				<checklist.itemlabel data-testid="before-tomato-label">Tomato</checklist.itemlabel>
			</checklist.item>
		</checklist.root>
	</section>
}
