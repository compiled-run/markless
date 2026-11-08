import type { NoteKind } from './ink-card/card-ink.ts';
import { icons } from './ink-card/note-icons.art.ts';

const LABEL: Record<NoteKind, string> = { info: 'Note', warning: 'Warning', tip: 'Tip' };

export default function Callout({
	title,
	text,
	kind,
	sprite,
}: {
	readonly title: string;
	readonly text: string;
	/** Which ink mark sits at the title. Defaults from `sprite`, else `info`. */
	readonly kind?: NoteKind;
	/** The crayon sprite a callout used to carry; it now only picks the kind. */
	readonly sprite?: string;
}) @{
	// An older `sprite` stands for a kind: a cross or a bolt flags a trap, a tick a shortcut, anything else is an aside.
	const resolved: NoteKind = kind ?? (sprite === 'cross' || sprite === 'bolt' ? 'warning' : sprite === 'check' ? 'tip' : 'info');
	const drawing = icons[resolved];

	<aside class="callout ink-card" role="note" aria-label={LABEL[resolved]}>
		<p class="callout-title">
			<svg class="callout-icon" viewBox={'0 0 ' + drawing.width + ' ' + drawing.height} aria-hidden="true">
				@for (const layer of drawing.layers; key layer.d) {
					<path class={'callout-' + layer.kind} d={layer.d} />
				}
			</svg>
			{title}
		</p>
		<p class="callout-body">{text}</p>
		<style>
			.callout-title {
				display: flex;
				gap: 0.45em;
				align-items: center;
				margin: 0 0 0.3em;
				font-weight: 700;
			}

			.callout-body {
				margin: 0;
			}

			.callout-icon {
				flex: none;
				inline-size: 1.6em;
				block-size: 1.6em;
				overflow: visible;
			}

			.callout-wash {
				fill: var(--pink);
				opacity: 0.6;
			}

			.callout-hatch {
				fill: none;
				stroke: currentColor;
				stroke-width: 0.6;
				stroke-linecap: round;
				opacity: 0.75;
			}

			.callout-ink {
				fill: currentColor;
			}
		</style>
	</aside>
}
