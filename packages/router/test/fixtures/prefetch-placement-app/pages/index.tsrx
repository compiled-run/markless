import { NavLink } from '../src/parts.tsrx';

const choice = 'viewport';

export default function First() @{
	<main data-page="first">
		<a href="/second" prefetch={choice} data-dynamic>Dynamic</a>
		<a href="/second" prefetch={false} data-plain>Plain</a>
		<NavLink href="/second" prefetch={false}>Forwarded</NavLink>
	</main>
}
