import { Link } from '@markless/router';
import { choice } from '../lib/choice.tsrx';
import { Badge } from '../lib/badge.tsrx';

export default function Plain() @{
	const c = choice();
	<main>
		<h1 data-title>{'Plain'}</h1>
		<p data-shown>{c.value}</p>
		<p data-mode={c.value === 'cli' ? 'default' : 'chosen'}>{c.value === 'cli' ? 'default' : 'chosen'}</p>
		<Badge label={c.value} />
		<Link href="/" data-go-home>home</Link>
	</main>
}
