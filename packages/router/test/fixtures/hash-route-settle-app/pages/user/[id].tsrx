import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import Shell from '../../components/shell.tsrx';
import Profile from '../../components/profile.tsrx';
import { slowValue } from '../../lib/value.ts';

export default function User({ params, url }: PageProps<{ id: string }>) @{
	const user = computed(async () => slowValue(params.id));

	<Shell path={url.pathname}>
		@try {
			<Profile user={user} />
		} @pending {
			<h1 class="page">loading</h1>
		} @catch {
			<h1 class="page">failed</h1>
		}
	</Shell>
}
