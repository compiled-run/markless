import { state } from '@markless/core';
import * as pagination from '../index.ts';

// One pagination with a consumer handler. The handler writes into page state the
// page renders, so what the DOM shows is what the consumer's callback was
// actually called with, how often, and in what order relative to the consumer's
// own click handler on the trigger.
export default function WithOnChange() @{
	const log = state({ page: '', calls: 0, order: '' });

	<section>
		<pagination.root
			count={4}
			data-testid="root"
			onChange={(next: number) => {
				log.page = String(next);
				log.calls = log.calls + 1;
				log.order = log.order + 'change';
			}}
		>
			<pagination.backtrigger data-testid="backtrigger">Previous</pagination.backtrigger>
			<pagination.item value={1} data-testid="item-1">
				<pagination.itemtrigger data-testid="itemtrigger-1">1</pagination.itemtrigger>
			</pagination.item>
			<pagination.item value={2} data-testid="item-2">
				<pagination.itemtrigger
					data-testid="itemtrigger-2"
					onClick={() => {
						log.order = log.order + '-click';
					}}
				>2</pagination.itemtrigger>
			</pagination.item>
			<pagination.item value={3} data-testid="item-3">
				<pagination.itemtrigger data-testid="itemtrigger-3">3</pagination.itemtrigger>
			</pagination.item>
			<pagination.item value={4} data-testid="item-4">
				<pagination.itemtrigger data-testid="itemtrigger-4">4</pagination.itemtrigger>
			</pagination.item>
			<pagination.forwardtrigger data-testid="forwardtrigger">Next</pagination.forwardtrigger>
		</pagination.root>
		<p data-testid="page">{log.page}</p>
		<p data-testid="calls">{log.calls}</p>
		<p data-testid="order">{log.order}</p>
	</section>
}
