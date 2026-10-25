import { state } from '@markless/core';
import NavLink from './nav-link.tsrx';

export default function GraphEqualityGuardPage() @{
	let here = state('/show');
	let there = state('/news');

	<section>
		<NavLink to={here} />
		<NavLink to={there} />
	</section>
}
