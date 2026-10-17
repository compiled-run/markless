import type { PageProps } from '@markless/router';
import PathEcho from '../src/path-echo.tsrx';

export default function EchoPage({ url }: PageProps) @{
	<main>
		<PathEcho where={url.pathname} query={url.search} />
	</main>;
}
