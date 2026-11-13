import { state } from '@markless/core';
import { RowsPage } from './pages.tsrx';

// The route the page is handed; "Next" stands in for a client navigation to another id.
export default function Rows() @{
	let route = state({ params: { id: 'abc' }, url: { search: '?tab=info' } });
	<div>
		<button data-next onClick={() => (route = { params: { id: 'xyz' }, url: { search: '?tab=more' } })}>Next</button>
		<RowsPage params={route.params} url={route.url} />
	</div>
}
