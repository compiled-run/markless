import { popover } from '@markless/ui';

const chip =
	'padding: 0.5em 0.9em; border: 2px solid var(--ink); border-radius: 6px; background: var(--paper); color: var(--ink); font: inherit; font-weight: 700; cursor: pointer;';
const surface =
	'display: grid; gap: 0.5em; width: min(19rem, 100%); margin-block-start: 0.5em; padding: 0.9em; border: 2px solid var(--ink); border-radius: 6px; background: var(--raised); box-shadow: 3px 3px 0 var(--ink); text-align: left;';

export default function Share() @{
	<popover.root open={true} style="display: grid; justify-items: center;">
		<popover.trigger style={chip}>Share</popover.trigger>
		<popover.content style={surface}>
			<popover.title style="margin: 0; font-size: var(--step-0);">Share this page</popover.title>
			<popover.description style="margin: 0; font-size: var(--step--1);">
				Anyone holding the link can read it.
			</popover.description>
			<popover.close style={chip}>Copy link</popover.close>
		</popover.content>
	</popover.root>
}
