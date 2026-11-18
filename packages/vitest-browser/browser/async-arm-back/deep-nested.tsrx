import { computed, state } from '@markless/core';
import { fetchTitle } from './fetch-title.ts';

export default function Layout() @{
	<article>
		<h1>Inbox</h1>
		<Shell />
	</article>
}

function Shell() @{
	<aside>
		<span>Side</span>
		<Picker />
	</aside>
}

function Picker() @{
	let generation = state(2);
	let chosen = state<string>('none');

	<ul>
		<li data-chosen>{chosen}</li>
		<li>
			<Detail label="row" generation={generation} pick={(value) => (chosen = value)} />
		</li>
	</ul>
}

function Detail({ label, generation, pick }: { label: string; generation: number; pick: (value: string) => void }) @{
	const heading = computed(async () => fetchTitle(7, generation));

	<div data-detail>
		@try {
			<p>
				{label} {heading} <a data-pick href="#" onClick={(event) => { event.preventDefault(); pick('picked'); }}>Pick</a>
			</p>
		} @pending {} @catch {}
	</div>
}
