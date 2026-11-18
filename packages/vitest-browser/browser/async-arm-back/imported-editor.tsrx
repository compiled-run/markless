import { computed } from '@markless/core';
import { fetchTitle } from './fetch-title.ts';

export function Sheet({ id, round, close }: { id: number; round: number; close: (next: number | null) => void }) @{
	const title = computed(async () => fetchTitle(id, round));

	<section data-editor>
		@try {
			<>
				<button data-back onClick={() => close(null)}>Back</button> Sheet "{title}" (#{id})
			</>
		} @pending {} @catch {}
	</section>
}
