import { computed } from '@markless/core';
import { location } from '@markless/device';

export function Here() @{
	const here = computed(async () => location.current());
	@try {
		<p>{here.latitude}, {here.longitude}</p>
	} @catch (error) {
		<p>{error.name}</p>
	}
}
