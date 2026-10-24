import type { PageProps } from '@markless/router';
import { count } from '../src/count.ts';

export default function Page({ http }: PageProps) @{
	http.response.headers.set('cache-control', 'public, max-age=0, must-revalidate');
	const shown = String(count());
	<main data-page="edge">
		<output data-count>{shown}</output>
		<a href="/" data-home>Home</a>
	</main>
}
