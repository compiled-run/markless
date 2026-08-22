import { state } from '@markless/core';
import { checkbox, checklist } from '../../index.ts';

// The consumer's handler writes what it was called with into page state the page
// renders, so what the DOM shows is the whole new ticked set the checklist
// handed over, and how many times it handed one over.
export default function WithOnChange() @{
	const log = state({ value: '', calls: 0 });

	<section>
		<checklist.root
			values={['lettuce', 'tomato']}
			data-testid="root"
			onChange={(next: readonly string[]) => {
				log.value = next.join(',');
				log.calls = log.calls + 1;
			}}
		>
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
		</checklist.root>
		<p data-testid="value">{log.value}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
