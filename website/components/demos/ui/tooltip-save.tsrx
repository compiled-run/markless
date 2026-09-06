import { tooltip } from '@markless/ui';

const chip =
	'padding: 0.5em 0.9em; border: 2px solid var(--ink); border-radius: 6px; background: var(--paper); color: var(--ink); font: inherit; font-weight: 700; cursor: pointer;';
const tip =
	'width: max-content; max-width: 16rem; margin-block-end: 0.45em; padding: 0.35em 0.65em; border-radius: 4px; background: var(--slab); color: var(--slab-ink); font-size: var(--step--1);';

export default function Save() @{
	<tooltip.root open={true} style="display: grid; justify-items: center;">
		<tooltip.trigger style={chip}>Save</tooltip.trigger>
		<tooltip.content style={tip}>Keeps a copy in your drafts</tooltip.content>
	</tooltip.root>
}
