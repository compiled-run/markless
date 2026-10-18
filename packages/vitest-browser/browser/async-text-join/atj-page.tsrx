import { computed, state } from '@markless/core';

export default function AsyncTextJoinPage() @{
	const data = computed(async () => ({ title: 'Inbox' }));
	let count = state(0);
	<section>
		<button type="button" data-count onClick={() => (count = count + 1)}>
			more
		</button>
		@try {
			<p data-async-first>
				{data.title} {count}
			</p>;
		} @pending {
			<p>loading</p>;
		}
		@try {
			<p data-state-first>
				{count} in {data.title}
			</p>;
		} @pending {
			<p>loading</p>;
		}
		@try {
			<p data-attr title={`${data.title} ${count}`}>
				attr
			</p>;
		} @pending {
			<p>loading</p>;
		}
	</section>;
}
