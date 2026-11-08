import { NavLink } from '../src/parts.tsrx';

export default function First() @{
	<main data-page="first">
		<a href="/second" prefetch={false} data-plain>Plain</a>
		<NavLink href="/second" prefetch={false}>Forwarded</NavLink>
	</main>
}
