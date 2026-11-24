import { computed, state } from '@markless/core';
import { Link, navigate, type PageProps } from '@markless/router';

export default function Home({ url }: PageProps) @{
	let next = state(8);
	const tab = computed(() => url.searchParams.get('tab') ?? 'no tab');
	<main>
		<title>Home</title>
		<p>Home path {url.pathname}</p>
		<p>Home search [{url.search}]</p>
		<p>Home tab {tab}</p>
		<Link href="/notes/7?tab=done">Open note 7</Link>
		<button onClick={() => navigate(`/notes/${next}?tab=new&sort=old#top`)}>Open note 8</button>
	</main>
}
