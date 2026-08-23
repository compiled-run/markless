import { state } from '@markless/core';
import * as pagination from '../index.ts';

// No consumer callback at all. The pagination still moves; the call site simply
// has nothing to run. The counter next to it proves nothing fired.
export default function WithoutOnChange() @{
	const log = state({ calls: 0 });

	<section>
		<pagination.root count={4} data-testid="root">
			<pagination.backtrigger data-testid="backtrigger">Previous</pagination.backtrigger>
			<pagination.item value={1} data-testid="item-1">
				<pagination.itemtrigger data-testid="itemtrigger-1">1</pagination.itemtrigger>
			</pagination.item>
			<pagination.item value={2} data-testid="item-2">
				<pagination.itemtrigger data-testid="itemtrigger-2">2</pagination.itemtrigger>
			</pagination.item>
			<pagination.item value={3} data-testid="item-3">
				<pagination.itemtrigger data-testid="itemtrigger-3">3</pagination.itemtrigger>
			</pagination.item>
			<pagination.item value={4} data-testid="item-4">
				<pagination.itemtrigger data-testid="itemtrigger-4">4</pagination.itemtrigger>
			</pagination.item>
			<pagination.forwardtrigger data-testid="forwardtrigger">Next</pagination.forwardtrigger>
		</pagination.root>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
