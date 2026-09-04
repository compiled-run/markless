// The foot of every page: the previous and next entries in `nav.ts` reading
// order, with a strip of doodles between them. Each doodle reacts to the
// pointer with a movement of its own, written in styles/global.css against its
// position in this row. `pagerFor` is plain TypeScript
// for the same reason the header's breadcrumb is (NOTES.md finding 3), and an
// end of the run keeps its link box, hidden, so the doodles stay centred.
import Sprite from '../sprite.tsrx';
import Sticker from '../sticker.tsrx';
import { lucide } from '@markless/icons';
import { pagerFor } from '../../nav.ts';

export default function Pager({ pathname }: { readonly pathname: string }) @{
	const steps = pagerFor(pathname);

	<nav class="pager" aria-label="Page navigation">
		<a
			class={steps.prevHref ? 'pager-link pager-prev' : 'pager-link pager-prev is-empty'}
			href={steps.prevHref || '/markless'}
		>
			<span class="pager-dir">← Previous</span>
			<span class="pager-title">{steps.prevTitle}</span>
		</a>
		<span class="pager-doodles" aria-hidden="true">
			<Sticker name="tape" size="3.4em" spot="pager" />
			<Sprite name="crown" size="2.2em" />
			<Sprite name="sparkle" size="2em" />
			<Sprite name="heart" size="1.8em" />
			<Sprite name="squiggle-yellow" size="2.4em" />
			<Sprite name="sun" size="2.1em" />
			<Sprite name="flower" size="2em" />
			<Sticker name="spring" size="2.6em" spot="pager" />
		</span>
		<a
			class={steps.nextHref ? 'pager-link pager-next' : 'pager-link pager-next is-empty'}
			href={steps.nextHref || '/markless'}
		>
			<span class="pager-dir">Next <lucide.arrowright aria-hidden="true" /></span>
			<span class="pager-title">{steps.nextTitle}</span>
		</a>
	</nav>
}
