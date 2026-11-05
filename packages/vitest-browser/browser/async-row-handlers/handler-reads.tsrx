import { computed, state } from '@markless/core';
import { fetchProfile, fetchTasks, type Profile } from './fetch-rows.ts';

function describe(profile: Profile): string {
	return `${profile.name} of ${profile.city}`;
}

export default function HandlerReads() @{
	let note = state('');
	const profile = computed(async () => await fetchProfile());
	const tasks = computed(async () => await fetchTasks());

	<section>
		<p data-note>{note}</p>
		@try {
			<form>
				<h2 data-name>{profile.name}</h2>
				<button type="button" data-destructure onClick={() => { const { name, city } = profile; note = `${city}/${name}`; }}>a</button>
				<button type="button" data-keys onClick={() => (note = Object.keys(profile).join('+'))}>b</button>
				<button type="button" data-call onClick={() => (note = describe(profile))}>c</button>
				<button type="button" data-json onClick={() => (note = JSON.stringify(profile))}>d</button>
			</form>
		} @pending {
			<em>waiting</em>
		}
		@try {
			<div>
				<button type="button" data-list onClick={() => (note = `${tasks.length}:${tasks.map((task) => task.slug).join(',')}`)}>e</button>
				<ol>
					@for (const task of tasks; key task.slug) {
						<li><button type="button" data-copy-task onClick={() => (note = JSON.stringify({ ...task, steps: undefined }))}>{task.title}</button></li>
					}
				</ol>
			</div>
		} @pending {
			<em>waiting</em>
		}
	</section>
}
