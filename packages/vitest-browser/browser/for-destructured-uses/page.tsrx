import { state } from '@markless/core';
import { Echo } from './echo.tsrx';
import { Tag } from './tag.tsrx';

export default function Uses() @{
	let people = state([
		{ id: 'ada', name: 'Ada', tags: [{ id: 't1', text: 'math' }] },
		{ id: 'bo', name: 'Bo', tags: [] as { id: string; text: string }[] },
	]);
	let picked = state('none');
	let pairs = state<[string, string][]>([['x', 'pair-x']]);
	let groups = state([{ name: 'g1', kids: ['k1', 'k2'] }]);
	let owners = state([{ id: 'o1', who: 'outer' }]);
	let roles = state([{ who: 'inner' }]);

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
		<ul>
			@for (const [name, label] of pairs; key name) {
				<li data-pair={name}>{name + ':' + label}</li>
			}
		</ul>
		<ul>
			@for (const { name, kids } of groups; key name) {
				<li data-group={name}>
					<b data-group-name>{name + '/'}</b>
					@for (const name of kids; key name) {
						<button data-kid={name} onClick={() => (picked = name)}>
							<Tag label={name} />
						</button>
					}
				</li>
			}
		</ul>
		<ul>
			@for (const who of owners; key who.id) {
				<li data-owner={who.id}>
					@for (const { who } of roles; key who) {
						<span>
							<Tag label={who} />
							<Echo label={who} />
						</span>
					}
				</li>
			}
		</ul>
		<p data-picked>{picked}</p>
		<button data-add onClick={() => people.push({ id: 'cy', name: 'Cy', tags: [{ id: 't2', text: 'law' }] })}>add</button>
	</section>
}
