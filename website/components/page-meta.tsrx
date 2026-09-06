// The level / reading time / prerequisite line under every H1, plus the sprite
// that sits beside the title. MDX cannot nest a component inside a markdown
// heading, so the sprite rides here and CSS lifts it up next to the H1.
import Sprite from './sprite.tsrx';
import { assumesFor } from '../nav.ts';

export default function PageMeta({
	level,
	time,
	assumes,
	sprite,
}: {
	readonly level: string;
	readonly time: string;
	readonly assumes: string;
	readonly sprite?: string;
}) @{
	// `assumes` stays a plain comma-separated string of concept keys, so an MDX
	// page passes a literal, and nav.ts turns the keys into titles and hrefs.
	const items = assumesFor(assumes);
	const plain = items.length === 0 ? assumes : '';

	<p class="page-meta">
		<span class="page-meta-sprite">
			<Sprite name={sprite ?? 'sparkle'} size="2.6em" />
		</span>
		<span class="page-meta-level">{level}</span>
		<span class="page-meta-sep">·</span>
		<span>{time}</span>
		<span class="page-meta-sep">·</span>
		<span>
			Assumes: {plain}
			@for (const item of items; key item.key) {
				<span class="page-meta-assume">
					<span class="page-meta-assume-lead">{item.lead}</span>
					<a
						class={item.known ? 'page-meta-assume-link' : 'page-meta-assume-link is-hidden'}
						href={item.href}
					>{item.title}</a>
					<span
						class={item.known ? 'page-meta-assume-plain is-hidden' : 'page-meta-assume-plain'}
					>{item.title}</span>
				</span>
			}
		</span>
	</p>
}
