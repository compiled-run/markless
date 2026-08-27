import { state } from '@markless/core';
import { checklist } from '../../index.ts';

// The consumer's handler writes what it was called with into page state the page
// renders, so what the DOM shows is the whole new ticked set the checklist
// handed over, and how many times it handed one over. `String` rather than
// `join` so a wrong argument is reported rather than thrown; for a list of
// strings the two spell the same thing.
export default function WithOnChange() @{
	const log = state({ value: '', calls: 0 });

	<section>
		<checklist.root
			values={['lettuce', 'tomato']}
			data-testid="root"
			onChange={(next: readonly string[]) => {
				log.value = String(next);
				log.calls = log.calls + 1;
			}}
		>
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
		<p data-testid="value">{log.value}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
