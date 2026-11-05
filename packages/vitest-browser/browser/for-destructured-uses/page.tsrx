import { state } from '@markless/core';
import { Tag } from './tag.tsrx';

export default function Uses() @{
	let people = state([
		{ id: 'ada', name: 'Ada', tags: [{ id: 't1', text: 'math' }] },
		{ id: 'bo', name: 'Bo', tags: [] as { id: string; text: string }[] },
	]);
	let picked = state('none');

	<section>
		<ul>
			@for (const { id, name } of people; key id) {
				<li data-person={id}>
					<Tag label={name} />
					<button data-pick={id} onClick={() => (picked = name)}>pick</button>
				</li>
			}
		</ul>
		<ul>
			@for (const { id, tags } of people; key id) {
				<li data-tags={id}>
					@if (tags.length > 0) {
						<em>tagged</em>
					} @else {
						<em>plain</em>
					}
					<ol>
						@for (const { text } of tags; key text) {
							<i>{text}</i>
						}
					</ol>
				</li>
			}
		</ul>
		<p data-picked>{picked}</p>
		<button data-add onClick={() => people.push({ id: 'cy', name: 'Cy', tags: [{ id: 't2', text: 'law' }] })}>add</button>
	</section>
}
