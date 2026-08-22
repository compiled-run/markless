import { checkbox, checklist } from '../../index.ts';

// A group that failed validation, written twice: the error after the items and
// the error before them. Every part of one instance seeds before any part
// renders, so document order does not decide what the root reads.
export default function WithError() @{
	<section>
		<checklist.root values={['lettuce']} data-testid="after-root">
			<checklist.label data-testid="after-label">Sandwich Condiments</checklist.label>
			<checklist.item value="lettuce" data-testid="after-lettuce">
				<checkbox.trigger data-testid="after-lettuce-trigger">
					<checkbox.indicator data-testid="after-lettuce-indicator">Checked</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label data-testid="after-lettuce-label">Lettuce</checkbox.label>
			</checklist.item>
			<checklist.error data-testid="after-error">Pick at least one condiment</checklist.error>
		</checklist.root>
		<checklist.root values={['tomato']} data-testid="before-root">
			<checklist.error data-testid="before-error">Pick at least one condiment</checklist.error>
			<checklist.label data-testid="before-label">Sandwich Condiments</checklist.label>
			<checklist.item value="tomato" data-testid="before-tomato">
				<checkbox.trigger data-testid="before-tomato-trigger">
					<checkbox.indicator data-testid="before-tomato-indicator">Checked</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label data-testid="before-tomato-label">Tomato</checkbox.label>
			</checklist.item>
		</checklist.root>
	</section>
}
