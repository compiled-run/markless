import JsBadge from './js-badge.tsrx';

/** One outcome line on the intro page: an inked icon in its own column, then a bold title and a sentence. MDX cannot place a component inside a paragraph, so the line is the component. */
export default function OutcomeLine({ title, text, icon, link, href }: { readonly title: string; readonly text: string; readonly icon: 'js' | 'agent' | 'devices'; readonly link?: string; readonly href?: string }) @{
	<div class="outcome">
		<span class="icon" data-icon={icon} aria-hidden="true">
			<span class="pick js">
				<JsBadge />
			</span>
			<svg class="pick agent ink" viewBox="0 0 40 40">
					<path class="fill" d="M8 13.5 C14 12.4 26 12.6 32.2 13.2 C33 19 32.8 26 32.3 31.6 C26 32.6 14 32.4 8.2 31.8 C7.4 26 7.5 19 8 13.5 Z" />
					<path class="line" d="M8 13.5 C14 12.4 26 12.6 32.2 13.2 C33 19 32.8 26 32.3 31.6 C26 32.6 14 32.4 8.2 31.8 C7.4 26 7.5 19 8 13.5 Z M20 12.8 L20.3 7.6 M18.2 6.6 a2 2 0 1 0 4 0.2 a2 2 0 1 0 -4 -0.2 M14.6 20.4 l0.2 3.4 M25.2 20.2 l0.1 3.5 M15 27.6 C17.6 29.2 22.6 29.2 25.2 27.4" />
			</svg>
			<svg class="pick devices ink" viewBox="0 0 40 40">
					<path class="fill" d="M4.6 9.6 C12 8.8 22 9 27.6 9.4 C28 15 27.9 20 27.5 24.4 C21 25 12 25 4.9 24.6 C4.4 19 4.4 14 4.6 9.6 Z" />
					<path class="line" d="M4.6 9.6 C12 8.8 22 9 27.6 9.4 C28 15 27.9 20 27.5 24.4 C21 25 12 25 4.9 24.6 C4.4 19 4.4 14 4.6 9.6 Z M12 30.6 C15 30.2 18 30.2 21 30.6 M16.4 24.8 l-0.3 5.6" />
					<path class="fill" d="M25.2 17.6 C28.6 17.2 32.6 17.3 35.2 17.6 C35.6 23 35.5 29 35.2 34.4 C32.4 34.8 28.4 34.8 25.5 34.4 C25 29 25 23 25.2 17.6 Z" />
					<path class="line" d="M25.2 17.6 C28.6 17.2 32.6 17.3 35.2 17.6 C35.6 23 35.5 29 35.2 34.4 C32.4 34.8 28.4 34.8 25.5 34.4 C25 29 25 23 25.2 17.6 Z M29 31.6 l2.2 0.1" />
			</svg>
		</span>
		<p>
			<strong>{title}</strong>
			{' ' + text}
			{href ? ' ' : ''}
			<a href={href ?? '#'} hidden={!href}>{link ?? ''}</a>
		</p>
		<style>
			.outcome {
				display: grid;
				grid-template-columns: 1.7em 1fr;
				column-gap: 0.55em;
				align-items: start;
				margin-block: var(--space-s);
			}

			.outcome p {
				margin: 0;
			}

			.icon {
				display: flex;
				justify-content: center;
				padding-block-start: 0.12em;
			}

			.ink {
				width: 1.6em;
				height: 1.6em;
				margin: 0;
				vertical-align: top;
			}

			.ink {
				rotate: 3deg;
			}

			.pick {
				display: none;
			}

			.icon[data-icon='js'] .js,
			.icon[data-icon='agent'] .agent,
			.icon[data-icon='devices'] .devices {
				display: block;
			}

			.fill {
				fill: var(--paper);
			}

			.ink .fill {
				fill: color-mix(in oklch, var(--pink) 45%, var(--paper));
			}

			.line {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.8;
				stroke-linecap: round;
				stroke-linejoin: round;
			}
		</style>
	</div>
}
