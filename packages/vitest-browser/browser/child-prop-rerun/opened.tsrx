import { state } from '@markless/core';
import { OpenedPage } from './pages.tsrx';

// The route the page is handed; "Next" stands in for a client navigation to another id.
export default function Opened() @{
	let route = state({ params: { id: 'abc' }, url: { search: '?tab=info' } });
	<div>
		<button data-next onClick={() => (route = { params: { id: 'xyz' }, url: { search: '?tab=more' } })}>Next</button>
		<OpenedPage params={route.params} url={route.url} />
	</div>
}
