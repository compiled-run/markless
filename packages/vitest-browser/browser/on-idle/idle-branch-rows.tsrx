import { state } from '@markless/core';

type Entry = { readonly slug: string; readonly title: string; readonly badge?: string };

function Group({ heading, entries }: { readonly heading: string; readonly entries: readonly Entry[] }) @{
	<section>
		<h3>{heading}</h3>
		<dl data-group={heading}>
			@for (const entry of entries; key entry.slug) {
				<dt data-entry={entry.slug}>
					@if (entry.badge) {
						<em data-badge>{entry.badge}</em>
					}
					{entry.title}
				</dt>
			}
		</dl>
	</section>
}

export function App() @{
	let woken = state(false);
	let tasks = state<readonly Entry[]>([{ slug: 'x', title: 'X', badge: 'new' }, { slug: 'y', title: 'Y' }]);

	<div>
		<footer data-idle-host onIdle={() => (woken = true)}>prefs</footer>
		@if (woken) {
			<span data-ready>ready</span>
		}
		<Group heading="guides" entries={[{ slug: 'g1', title: 'Guide', badge: 'β' }, { slug: 'g2', title: 'Other' }]} />
		<button type="button" data-push onClick={() => (tasks = [{ slug: `t${tasks.length}`, title: 'T', badge: 'hot' }, ...tasks])}>Push</button>
		<ol data-tasks>
			@for (const task of tasks; key task.slug) {
				<li data-task={task.slug}>
					@if (task.badge) {
						<b data-badge>{task.badge}</b>
					}
					{task.title}
				</li>
			}
		</ol>
	</div>
}
