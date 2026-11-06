import type { PageProps } from '@markless/router';
import VisibleLabel from '../src/visible-label.tsrx';
import VisibleRegion from '../src/visible-region.tsrx';

export default function AttachProps({ url }: PageProps) @{
	<main>
		<VisibleLabel label="apples" />
		<VisibleRegion id={url.pathname} tag="plum" />
	</main>
}
