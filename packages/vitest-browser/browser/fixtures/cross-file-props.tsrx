import { state } from '@markless/core';
import { Gauge, Row } from './cross-file-row.tsrx';

export default function CrossFileProps() @{
	let count = state(0);

	<section>
		<button type="button" data-add onClick={() => count++}>Add</button>
		<Row hot={count > 0}>{count}</Row>
		<Row><span>{count}</span></Row>
		<Gauge level={count * 3} unit="pts" />
	</section>
}
