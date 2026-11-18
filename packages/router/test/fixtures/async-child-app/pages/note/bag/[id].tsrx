import type { PageProps } from '@markless/router';
import BagDetail from '../../../components/bag-detail.tsrx';

export default function NoteBag({ params, url }: PageProps<{ id: string }>) @{
	<main>
		<BagDetail id={params.id} url={url} />
	</main>
}
