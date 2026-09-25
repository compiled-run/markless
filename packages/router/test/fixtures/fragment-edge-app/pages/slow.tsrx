import { computed } from '@markless/core';
import { Link } from '@markless/router';

export default function Slow() @{
	const report = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 8000));
		return { text: 'ready' };
	});

	<main data-page="slow">
		<nav>
			<Link href="/slow?n=1" data-slow="1">1</Link>
			<Link href="/slow?n=2" data-slow="2">2</Link>
			<Link href="/slow?n=3" data-slow="3">3</Link>
			<Link href="/slow?n=4" data-slow="4">4</Link>
			<Link href="/slow?n=5" data-slow="5">5</Link>
			<Link href="/slow?n=6" data-slow="6">6</Link>
			<Link href="/item/1" data-slow="item">item</Link>
		</nav>
		@try {
			<p data-settled>{report.text}</p>
		} @pending {
			<p data-pending>loading</p>
		} @catch {
			<p>failed</p>
		}
	</main>
}
