import type { PageProps } from '@markless/router';
import BackLink from '../../lib/BackLink.tsrx';
import Tabs from '../../lib/Tabs.tsrx';

export default function Item({ params }: PageProps<{ id: string }>) @{
	<main>
		<title>Item</title>
		<Tabs tab="item" />
		<p>Item {params.id}</p>
		<BackLink to="/" label="Back home" />
	</main>
}
