import { computed } from '@markless/core';
import Tag from './tag.tsrx';

export default function AsyncCaseConst() @{
	const value = computed(async () => { await new Promise((r) => setTimeout(r, 5)); return { odd: false }; });
	<main>
		@try {
			@switch (true) {
				@case value.odd: {
					<Tag kind="odd" value={value} />
				}
				@default: {
					<Tag kind="even" value={value} />
				}
			}
		} @pending {
			<p>loading</p>
		}
	</main>
}
