import Card from './card.tsrx';
import Shell from './shell.tsrx';

export default function ThreeInShell() @{
	<Shell>
		<main>
			<Card label="cards" ms={120} />
			<Card label="chart" ms={240} />
			<Card label="latest" ms={360} />
		</main>
	</Shell>
}
