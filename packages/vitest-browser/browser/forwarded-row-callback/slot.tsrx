import { computed } from '@markless/core';

export function Slot({ code, onPress }: { code: string; onPress: (code: string) => void }) @{
	const label = computed(async () => {
		await new Promise((done) => setTimeout(done, 15));
		return `take ${code}`;
	});

	<span>
		@try {
			<a href="#" data-slot={code} onClick={(event) => { event.preventDefault(); onPress(code); }}>{label}</a>
		} @pending {
			<em>loading</em>
		}
	</span>
}
