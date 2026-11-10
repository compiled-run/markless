import type { PageProps } from '@markless/router';
import { viewer } from '../../src/viewer.tsrx';

function LocalBadge() @{
	const v = viewer();
	<p data-badge>{v.name}</p>
}

export default function SameFile({ params }: PageProps<{ name: string }>) @{
	const v = viewer();
	v.name = params.name;

	<main>
		<h1 data-heading>{v.name}</h1>
		<LocalBadge />
	</main>
}
