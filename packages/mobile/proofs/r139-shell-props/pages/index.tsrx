import { Link } from '@markless/router';
import Shell from '../lib/Shell.tsrx';

export default function Home() @{
	<Shell title="Topics" note="Pick a topic" count={0}>
		<Link href="/topics/[topic]" params={{ topic: 'fruit' }}>Open fruit</Link>
	</Shell>
}
