import type { PageProps } from '@markless/router';
import Nav from '../../lib/Nav.tsrx';

export default function Note({ params }: PageProps<{ id: string }>) @{
	<Nav>
		<title>Note</title>
		<h1>{params.id}</h1>
		<p>Edit</p>
	</Nav>
}
