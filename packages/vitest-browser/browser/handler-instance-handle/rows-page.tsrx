import { RowsWidget } from './rows.tsrx';

export default function RowsPage() @{
	<section data-rows-page>
		<RowsWidget name="left" />
		<RowsWidget name="right" />
	</section>
}
