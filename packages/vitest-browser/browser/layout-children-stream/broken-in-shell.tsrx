import Card from './card.tsrx';
import Shell from './shell.tsrx';

export default function BrokenInShell() @{
	<Shell>
		<main>
			<Card label="broken invoices" ms={120} />
		</main>
	</Shell>
}
