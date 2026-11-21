import { Link } from '@markless/router';
import { PlayerLine } from '../lib/player.tsrx';

export default function Home() @{
	<main>
		<title>Home</title>
		<h1>Player</h1>
		<PlayerLine label="Play or pause" />
		<Link href="/now">Now playing</Link>
	</main>
}
