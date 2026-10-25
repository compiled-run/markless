import { computed } from '@markless/core';
import NameList from '../components/name-list.tsrx';
import { slow } from '../lib/slow.ts';

export default function SettleFailure() @{
	const data = computed(async () => slow({ title: 'Names' }, 60));
	<main>
		@try {
			// @ts-expect-error names is left out on purpose
			<NameList title={data.title} />
		} @pending {
			<p>loading</p>
		} @catch {
			<p>failed</p>
		}
	</main>
}
