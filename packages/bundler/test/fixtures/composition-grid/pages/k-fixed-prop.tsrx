import { Link } from '@markless/router';
import type { PageProps } from '@markless/router';
import FixedPropChild from '../../../../../vitest-browser/browser/composition-grid/k-fixed-prop-child.tsrx';
import FixedPropKept from '../k-fixed-prop-kept.tsrx';

export default function Page({ url }: PageProps) @{
	<main>
		<Link data-to-bob href="/k-fixed-prop?q=bob">bob</Link>
		<FixedPropChild q={new URLSearchParams(url.search).get('q') ?? ''} />
		<FixedPropKept q={new URLSearchParams(url.search).get('q') ?? ''} />
	</main>
}
