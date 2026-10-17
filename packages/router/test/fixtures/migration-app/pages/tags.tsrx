import { computed } from '@markless/core';
import TagShelf from '../src/tag-shelf.tsrx';

export default function TagsPage() @{
	const shelf = computed(async () => ({ heading: 'Shelf' }));
	<main>
		@try {
			<TagShelf heading={shelf.heading} />;
		} @pending {
			<p>loading shelf</p>;
		}
	</main>;
}
