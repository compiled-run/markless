import { hovercard } from '@markless/ui';

const link = 'color: var(--ink); font-weight: 700; text-decoration: underline;';
const card =
	'display: grid; gap: 0.35em; width: min(18rem, 100%); margin-block-start: 0.45em; padding: 0.8em; border: 2px solid var(--ink); border-radius: 6px; background: var(--raised); box-shadow: 3px 3px 0 var(--ink); font-size: var(--step--1); text-align: left;';

export default function Mention() @{
	<hovercard.root open={true} style="display: grid; justify-items: center;">
		<hovercard.trigger href="/markless/ui/accordion" style={link}>the accordion page</hovercard.trigger>
		<hovercard.content style={card}>
			<strong>accordion</strong>
			<span>Sections named by value, with the closed panel left in the page.</span>
			<a href="/markless/ui/accordion" style={link}>Read it</a>
		</hovercard.content>
	</hovercard.root>
}
