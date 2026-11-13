import Card from './card.tsrx';
import Shell from './shell.tsrx';

export default function OneInShell() @{
	<Shell>
		<main>
			<h1>Revenue</h1>
			<Card label="revenue" ms={120} />
		</main>
	</Shell>
}
