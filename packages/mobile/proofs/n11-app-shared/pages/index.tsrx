import { Link } from '@markless/router';
import { Bump, Tally } from '../lib/tally.tsrx';

export default function Home() @{
	<main>
		<title>Home</title>
		<h1>Home page</h1>
		<Tally label="Home sees" />
		<Bump label="Bump at home" />
		<Link href="/other">Open other</Link>
	</main>
}
