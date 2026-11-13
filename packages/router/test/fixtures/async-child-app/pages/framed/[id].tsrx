import type { PageProps } from '@markless/router';
import Frame from '../../components/frame.tsrx';
import RouteDetail from '../../components/route-detail.tsrx';

export default function Framed({ params, url }: PageProps<{ id: string }>) @{
	<main>
		<Frame>
			<RouteDetail id={params.id} url={url} />
		</Frame>
	</main>
}
