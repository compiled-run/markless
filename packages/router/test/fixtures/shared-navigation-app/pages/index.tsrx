import { Link } from '@markless/router';
import { ChoiceButtons, choice } from '../lib/choice.tsrx';

export default function Home() @{
	const c = choice();
	<main>
		<h1 data-title>{'Home'}</h1>
		<p data-shown>{c.value}</p>
		<p data-mode={c.value === 'cli' ? 'default' : 'chosen'}>{c.value === 'cli' ? 'default' : 'chosen'}</p>
		<ChoiceButtons />
		<Link href="/next" data-go-next>next</Link>
		<Link href="/async" data-go-async>async</Link>
	</main>
}
