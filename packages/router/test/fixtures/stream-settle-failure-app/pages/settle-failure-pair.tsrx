import { computed } from '@markless/core';
import NameList from '../components/name-list.tsrx';
import { together } from '../lib/together.ts';

export default function SettleFailurePair() @{
	const fine = computed(async () => together({ text: 'fine' }, 60));
	const broken = computed(async () => together({ title: 'Names' }, 60));
	<main>
		@try {
			<p id="fine">{fine.text}</p>
		} @pending {
			<p id="fine">loading fine</p>
		} @catch {
			<p id="fine">fine failed</p>
		}
		<section id="broken">
			@try {
				// @ts-expect-error names is left out on purpose
				<NameList title={broken.title} />
			} @pending {
				<p>loading broken</p>
			} @catch {
				<p>broken failed</p>
			}
		</section>
	</main>
}
