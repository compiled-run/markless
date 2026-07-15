import { Nav } from './Nav.tsrx';

function LocalBadge({ text }: { text: string }) @{
	<strong>{text}</strong>
}

export function ComponentNavigation() @{
	<section>
		<Nav label="paired" active={true}>content</Nav>
		<LocalBadge text="local" />
	</section>
}
