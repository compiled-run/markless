import FixedPropChild from './k-fixed-prop-child.tsrx';

const SEARCH = '?q=ada&page=2';

export default function FixedPropPage() @{
	const search = SEARCH.slice(1);
	<main>
		<FixedPropChild q={new URLSearchParams(search).get('q') ?? ''} />
	</main>
}
