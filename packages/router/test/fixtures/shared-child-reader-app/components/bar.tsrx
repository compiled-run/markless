import { Link } from '@markless/router';
import { ui } from './ui.tsrx';

export default function Bar() @{
	const u = ui();

	<nav>
		<Link href="/" data-go-home>Home</Link>
		<Link href="/other" data-go-other>Other</Link>
		<button id="toggle" onClick={() => (u.open = !u.open)}>open: {u.open ? 'yes' : 'no'}</button>
		<button id="count" onClick={() => u.count++}>count: {u.count}</button>
	</nav>
}
