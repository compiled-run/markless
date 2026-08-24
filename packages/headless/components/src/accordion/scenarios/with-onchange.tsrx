import { state } from '@markless/core';
import { accordion } from '../../index.ts';

// The consumer's own handlers. Each writes into page state the page renders, so
// what the DOM shows is what the callback was actually called with, how often,
// and in what order relative to the consumer's own click handler on a trigger.
export default function WithOnChange() @{
	const log = state({ last: '', calls: 0, order: '' });

	<section>
		<accordion.root
			data-testid="root"
			onChange={(next: string | readonly string[]) => {
				log.last = String(next);
				log.calls = log.calls + 1;
				log.order = log.order + 'change';
			}}
		>
			<accordion.item value="first" data-testid="first-item">
				<accordion.itemlabel data-testid="first-label">
					<accordion.itemtrigger
						data-testid="first-trigger"
						onClick={() => {
							log.order = log.order + '-click';
						}}
					>First</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="first-content">
					The first answer.
				</accordion.itemcontent>
			</accordion.item>
			<accordion.item value="second" data-testid="second-item">
				<accordion.itemlabel data-testid="second-label">
					<accordion.itemtrigger data-testid="second-trigger">Second</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="second-content">
					The second answer.
				</accordion.itemcontent>
			</accordion.item>
		</accordion.root>
		<p data-testid="last">{log.last}</p>
		<p data-testid="calls">{log.calls}</p>
		<p data-testid="order">{log.order}</p>
	</section>
}
