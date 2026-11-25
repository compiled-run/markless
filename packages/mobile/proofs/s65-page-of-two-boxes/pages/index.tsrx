import { Link } from '@markless/router';
import Frame from '../lib/Frame.tsrx';

export default function Home() @{
	<Frame>
		<h1>Field notes</h1>
		<Link href="/notes/[id]" params={{ id: 'first' }} class="open">Open the note</Link>
	</Frame>
}
