import { computed, state } from '@markless/core';

function Tag({ text }: { text: string }) @{
	<mark data-tag>{text}</mark>
}

export function RotaCard() @{
	let week = state(1);
	let open = state(true);
	const shift = computed(async () => {
		const at = week;
		await new Promise((resolve) => setTimeout(resolve, at === 1 ? 10 : 800));
		return { at: '2026-0' + at, names: at === 1 ? ['ana', 'bo'] : ['cy'] };
	});
	const headline = computed(() => 'Week of ' + shift.at);

	<aside>
		<button type="button" data-next-week onClick={() => (week = 2)}>Next week</button>
		@try {
			<div data-card>
				<ol data-names>
					@for (const name of shift.names; key name) {
						<li>{name}</li>
					}
				</ol>
				<button type="button" data-toggle onClick={() => (open = !open)}>{open ? 'Hide' : 'Show'}</button>
				<Tag text={headline} />
				<time data-when datetime={shift.at}>This week</time>
			</div>
		} @pending {
			<p data-pending>Loading rota</p>
		} @catch {
			<p data-failed>Rota failed</p>
		}
	</aside>
}
