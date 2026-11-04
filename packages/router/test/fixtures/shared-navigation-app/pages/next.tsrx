import { Link } from '@markless/router';
import { ChoiceButtons, choice } from '../lib/choice.tsrx';

export default function Next() @{
	const c = choice();
	<main>
		<h1 data-title>{'Next'}</h1>
		<p data-shown>{c.value}</p>
		<p data-mode={c.value === 'cli' ? 'default' : 'chosen'}>{c.value === 'cli' ? 'default' : 'chosen'}</p>
		<ChoiceButtons />
		<Link href="/" data-go-home>home</Link>
	</main>
}
