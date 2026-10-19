import { Link } from '@markless/router';

export default function Home() @{
	<main data-page="home">
		<Link href="/api" data-nav="api">API reference</Link>
		<Link href="/api/contact" data-nav="contact">Contact</Link>
	</main>
}
