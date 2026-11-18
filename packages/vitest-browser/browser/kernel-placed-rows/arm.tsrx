import { computed, state } from '@markless/core';
import { loadTodos } from './api.ts';

export default function Toggle() @{
	let open = state(false);
	let heading = state('first');
	<div>
		<button data-open onClick={() => (open = !open)}>Open</button>
		<button data-rename onClick={() => (heading = 'second')}>Rename</button>
		@if (open) {
			<>
				<Panel heading={heading} />
				<Picker topic={heading} />
			</>
		}
	</div>
}

function Panel({ heading }: { heading: string }) @{
	const items = computed(async () => loadTodos('', 0));
	<div class="panel">
		@try {
			<>
				<h2>{heading}</h2>
				<ul>
					@for (const item of items; key item.id) {
						<li>{item.name}</li>
					}
				</ul>
			</>
		} @pending {
			<p>Loading</p>
		} @catch {
			<p>Failed</p>
		}
	</div>
}

function Picker({ topic }: { topic: string }) @{
	const matches = computed(async () => loadTodos(topic, 0));
	<div class="picker">
		@try {
			<ul>
				@for (const match of matches; key match.id) {
					<li>{match.name}</li>
				}
			</ul>
		} @pending {
			<p>Loading</p>
		} @catch {
			<p>Failed</p>
		}
	</div>
}
