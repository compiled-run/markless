import type { PageProps } from '@markless/router';
import Shell from '../../components/shell.tsrx';

export default function Story({ params, url }: PageProps<{ id: string }>) @{
	<main>
		<Shell path={url.pathname}>
			<h1 class="page">story {params.id}</h1>
			<p class="address">{url.pathname}</p>
		</Shell>
		<a class="home-link" href="/">home</a>
	</main>
}
