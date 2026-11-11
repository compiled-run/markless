import { computed } from '@markless/core';
import { load } from './gate.ts';

export default function ProfileCard() @{
	const profile = computed(async () => await load('profile', 'orders', { name: 'Ada' }));

	<aside>
		@try {
			<h2 data-profile>{profile.name}</h2>
		} @pending {
			<span data-profile-pending>Profile loading</span>
		} @catch {
			<span data-profile-failed>Profile failed</span>
		}
	</aside>
}
