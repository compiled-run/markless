import Sprite from '../sprite.tsrx';
import { lucide } from '@markless/ui';

export default function Collapsible({
	summary,
	text,
	sprite,
}: {
	readonly summary: string;
	readonly text: string;
	readonly sprite?: string;
}) @{
	<details class="collapsible">
		<style>
			.collapsible-caret {
				width: 1em;
				height: 1em;
				color: currentColor;
				transition: transform 140ms ease;
			}

			.collapsible[open] .collapsible-caret {
				transform: rotate(180deg);
			}
		</style>
		<summary>
			<lucide.chevrondown class="collapsible-caret" aria-hidden="true" />
			<Sprite name={sprite ?? 'thought-bubble'} size="1.4em" />
			{summary}
		</summary>
		<p>{text}</p>
	</details>
}
