import type { PageProps } from '@markless/router';
import RouteDetail from '../../components/route-detail.tsrx';

export default function Direct({ params, url }: PageProps<{ id: string }>) @{
	<main>
		<div class="frame">
			<RouteDetail id={params.id} url={url} />
		</div>
	</main>
}
