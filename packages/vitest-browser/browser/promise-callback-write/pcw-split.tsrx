import { state } from '@markless/core';
import Opener from './pcw-opener.tsrx';
import Results from './pcw-results.tsrx';

export default function SplitPage() @{
	const search = state({ open: false, ready: false });
	<section>
		<Opener
			onOpen={() => {
				search.open = true;
			}}
			onReady={() => {
				search.ready = true;
			}}
		/>
		<output data-opened>{search.open ? 'open' : 'closed'}</output>
		<Results ready={search.ready} />
	</section>
}
