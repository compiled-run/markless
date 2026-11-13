import { computed, state } from '@markless/core';

async function findTask(id: number): Promise<{ id: number; title: string } | null> {
	await new Promise((resolve) => setTimeout(resolve, 20));
	return id === 0 ? null : { id, title: `task ${id}` };
}

export default function TaskPane() @{
	let id = state(1);
	const tags = computed(async () => ['one', 'two']);
	const task = computed(async () => await findTask(id));
	const present = computed(() => task !== null);

	<article>
		<button type="button" data-next onClick={() => id++}>Next</button>
		<button type="button" data-none onClick={() => (id = 0)}>None</button>
		@try {
			<section>
				<ul>
					@for (const tag of tags; key tag) {
						<li>{tag}</li>
					}
				</ul>
				@if (task !== null) {
					<p data-strict>{task.title}</p>
				}
				@if (task != null) {
					<p data-loose>{task.title}</p>
				}
				@if (task === null) {
					<p data-empty>none</p>
				} @else {
					<p data-else>{task.title}</p>
				}
				@if (task !== undefined && task !== null) {
					<p data-defined>{task.title}</p>
				}
				@if (present) {
					<p data-computed>{task?.title}</p>
				}
				@if (task?.id !== undefined) {
					<p data-member>{task?.title}</p>
				}
			</section>
		} @pending {
			<p data-loading>Loading</p>
		}
		@try {
			@if (task !== null) {
				<p data-alone>{task.title}</p>
			}
		} @pending {
			<p data-alone-loading>Loading</p>
		}
	</article>
}
