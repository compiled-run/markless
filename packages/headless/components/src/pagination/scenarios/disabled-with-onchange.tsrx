import { state } from '@markless/core';
import { pagination } from '../../index.ts';

// A pagination nobody may move, with a consumer listening. An anchor has no
// native `disabled`, so the link is the control the family alone has to refuse -
// and counting the calls is the only way to see it refused rather than merely
// looked shut.
export default function DisabledWithOnChange() @{
	const log = state({ last: 0, calls: 0 });

	<section style="padding: 40px">
		<pagination.root
			count={5}
			page={3}
			disabled
			data-testid="root"
			onChange={(next: number) => {
				log.last = next;
				log.calls = log.calls + 1;
			}}
		>
			<pagination.backtrigger data-testid="backtrigger">Previous</pagination.backtrigger>
			<pagination.item value={2} data-testid="item-2">
				<pagination.itemlink href="#page-2" data-testid="itemlink-2">2</pagination.itemlink>
			</pagination.item>
			<pagination.item value={3} data-testid="item-3">
				<pagination.itemlink href="#page-3" data-testid="itemlink-3">3</pagination.itemlink>
			</pagination.item>
			<pagination.item value={4} data-testid="item-4">
				<pagination.itemtrigger data-testid="itemtrigger-4">4</pagination.itemtrigger>
			</pagination.item>
			<pagination.forwardtrigger data-testid="forwardtrigger">Next</pagination.forwardtrigger>
		</pagination.root>
		<p data-testid="last">{log.last}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
