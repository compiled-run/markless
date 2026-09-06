import Sprite from '../sprite.tsrx';
import { collapsible, lucide } from '@markless/ui';

export default function Collapsible({
	summary,
	text,
	sprite,
}: {
	readonly summary: string;
	readonly text: string;
	readonly sprite?: string;
}) @{
	<collapsible.root class="collapsible">
		<style>
			.collapsible {
				margin-block: var(--space-m);
				padding: var(--space-xs);
				border-left: 4px solid var(--purple);
				background: color-mix(in srgb, var(--purple) 30%, transparent);
			}

			.collapsible-trigger {
				display: flex;
				gap: 0.45em;
				align-items: center;
				width: 100%;
				padding: 0;
				border: 0;
				background: transparent;
				color: inherit;
				font: inherit;
				font-weight: 700;
				text-align: start;
				cursor: pointer;
			}

			.collapsible-caret {
				width: 1em;
				height: 1em;
				color: currentColor;
				transition: transform 140ms ease;
			}

			.collapsible-trigger[ui-open] .collapsible-caret {
				transform: rotate(180deg);
			}

			.collapsible p {
				margin-bottom: 0;
			}
		</style>
		<collapsible.trigger class="collapsible-trigger">
			<lucide.chevrondown class="collapsible-caret" aria-hidden="true" />
			<Sprite name={sprite ?? 'thought-bubble'} size="1.4em" />
			{summary}
		</collapsible.trigger>
		<collapsible.content>
			<p>{text}</p>
		</collapsible.content>
	</collapsible.root>
}
