import type { PageProps } from '@markless/router';
import FixedPropChild from '../../../../../vitest-browser/browser/composition-grid/k-fixed-prop-child.tsrx';

export default function Page({ url }: PageProps) @{
	<main>
		<FixedPropChild q={new URLSearchParams(url.search).get('q') ?? ''} />
	</main>
}
