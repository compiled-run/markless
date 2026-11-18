import { computed } from '@markless/core';
import Tag from './tag.tsrx';

export default function AsyncIfConst() @{
	const value = computed(async () => { await new Promise((r) => setTimeout(r, 5)); return { odd: false }; });
	<main>
		@try {
			@if (value.odd) {
				<Tag kind="odd" value={value} />
			} @else {
				<Tag kind="even" value={value} />
			}
		} @pending {
			<p>loading</p>
		}
	</main>
}
