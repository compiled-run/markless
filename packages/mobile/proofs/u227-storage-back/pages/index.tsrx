import { computed, storage } from '@markless/core';
import { Link } from '@markless/router';

export default function Home() @{
	let kept = storage('ladder-kept-back', '0');
	const next = computed(() => Number(kept) + 1);
	<main>
		<title>Home</title>
		<h1>Home page</h1>
		<p>Home kept {kept}</p>
		<p>Next is {next}</p>
		@if (kept === '0') {
			<p>Nothing kept yet</p>
		}
		<Link href="/bump">Open bump</Link>
	</main>
}
