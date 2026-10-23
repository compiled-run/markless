import type { PageProps } from '@markless/router';
import { count } from '../src/count.ts';

export default function Page({ http }: PageProps) @{
	http.response.headers.set('cache-control', 'no-store');
	const shown = String(count());
	<main data-page="live">
		<output data-count>{shown}</output>
		<a href="/" data-home>Home</a>
	</main>
}
