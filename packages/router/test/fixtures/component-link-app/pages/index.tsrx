import { state } from '@markless/core';
import Menu from '../src/menu.tsrx';

export default function First() @{
	let clicks = state(0);

	<main data-page="first">
		<Menu />
		<button type="button" data-click onClick={() => clicks++}>{clicks}</button>
	</main>
}
