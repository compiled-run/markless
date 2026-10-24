import type { PageProps } from '@markless/router';
import { count } from '../src/count.ts';

// What Vercel sends on every function and ISR response: it rules the browser's HTTP cache, not a page fetched for a click.
export default function Page({ http }: PageProps) @{
	http.response.headers.set('cache-control', 'public, max-age=0, must-revalidate');
	const shown = String(count());
	<main data-page="hosted">
		<output data-count>{shown}</output>
		<a href="/" data-home>Home</a>
	</main>
}
