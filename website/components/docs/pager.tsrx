import { lucide } from '@markless/ui';
import { pagerFor } from '../../nav.ts';
import { asset } from '../../site-base.ts';
import { PAGER_DOODLES } from './ink-marks.ts';

const doodles = [
	{ name: 'receipt', size: '3.4em' },
	{ name: 'mug', size: '2.2em' },
	{ name: 'bean', size: '2em' },
	{ name: 'sugar', size: '1.8em' },
	{ name: 'spoon', size: '2.4em' },
	{ name: 'croissant', size: '2.1em' },
	{ name: 'cup', size: '2em' },
	{ name: 'moka', size: '2.6em' },
];

export default function Pager({ pathname }: { readonly pathname: string }) @{
	const steps = pagerFor(pathname);
	const sprite = asset(PAGER_DOODLES) + '#';

	<nav class="pager" aria-label="Page navigation">
		<style>
			.pager {
				display: flex;
				gap: var(--space-s);
				justify-content: space-between;
				align-items: center;
				margin-top: var(--space-xl);
				padding-top: var(--space-m);
				border-top: 2px dashed var(--code-edge);
			}

			.pager-link {
				display: flex;
				flex-direction: column;
				gap: 0.1em;
				max-width: 38%;
				color: var(--ink);
				text-decoration: none;
			}

			/* An end of the run keeps its box so the doodle strip stays put. */
			.pager-link.is-empty {
				visibility: hidden;
			}

			.pager-next {
				text-align: right;
				align-items: flex-end;
			}

			.pager-dir {
				display: inline-flex;
				gap: 0.25em;
				align-items: center;
				font-size: var(--step--1);
				text-transform: uppercase;
				letter-spacing: 0.08em;
				opacity: 0.6;
			}

			.pager-title {
				font-weight: 700;
				line-height: 125%;
			}

			.pager-link:hover .pager-title {
				text-decoration: underline;
				text-decoration-color: var(--pink);
				text-decoration-thickness: 0.12em;
				text-underline-offset: 0.16em;
			}

			.pager-doodles {
				display: flex;
				align-items: center;
				flex: none;
				color: var(--ink);
				--doodle-wash-opacity: 0.75;
				--doodle-wash-blend: multiply;

				html.dark & {
					--doodle-wash-opacity: 0.4;
					--doodle-wash-blend: normal;
				}
			}

			/* The row's gap is padding on each doodle, so pointing near one counts as pointing at it. */
			.pager-doodle {
				position: relative;
				display: inline-flex;
				padding-inline: 0.225em;
			}

			.pager-doodle:first-child,
			.pager-doodle:last-child {
				padding-inline: 0;
			}

			.pager-doodle::before {
				content: '';
				position: absolute;
				inset-block: -0.5em;
				inset-inline: 0;
			}

			.pager-doodle svg {
				display: block;
				width: var(--doodle-size);
				height: var(--doodle-size);
				overflow: visible;
				transition: transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
			}

			.pager-doodle:nth-child(1):hover svg {
				transform: rotate(-7deg) translateY(-0.25rem);
			}

			.pager-doodle:nth-child(2):hover svg {
				transform: rotate(-12deg) translateY(-5px);
			}

			.pager-doodle:nth-child(3):hover svg {
				transform: rotate(180deg) scale(1.25);
			}

			.pager-doodle:nth-child(4):hover svg {
				animation: doodle-plop 380ms ease-in-out;
			}

			.pager-doodle:nth-child(5):hover svg {
				animation: doodle-stir 420ms ease-in-out;
			}

			.pager-doodle:nth-child(6):hover svg {
				transform: rotate(-10deg) scale(1.15);
			}

			.pager-doodle:nth-child(7):hover svg {
				transform: translateY(-6px) rotate(6deg);
			}

			.pager-doodle:nth-child(8):hover svg {
				animation: doodle-rattle 360ms ease-in-out;
			}

			@keyframes doodle-plop {
				0%,
				100% {
					transform: translateY(0) scale(1);
				}
				40% {
					transform: translateY(-8px) scale(0.95, 1.05);
				}
				75% {
					transform: translateY(0) scale(1.12, 0.88);
				}
			}

			@keyframes doodle-stir {
				0%,
				100% {
					transform: rotate(0deg);
				}
				25% {
					transform: rotate(-16deg);
				}
				75% {
					transform: rotate(16deg);
				}
			}

			@keyframes doodle-rattle {
				0%,
				100% {
					transform: translateX(0) rotate(0deg);
				}
				20% {
					transform: translateX(-2px) rotate(-4deg);
				}
				40% {
					transform: translateX(2px) rotate(4deg);
				}
				60% {
					transform: translateX(-2px) rotate(-3deg);
				}
				80% {
					transform: translateX(1px) rotate(2deg);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.pager-doodle svg {
					transition: none;
				}

				.pager-doodle:nth-child(n):hover svg {
					animation: none;
					transform: none;
				}
			}

			@media (max-width: 40rem) {
				.pager-doodles {
					display: none;
				}
			}
		</style>
		<a
			class={steps.prevHref ? 'pager-link pager-prev' : 'pager-link pager-prev is-empty'}
			href={steps.prevHref || '/'}
		>
			<span class="pager-dir">← Previous</span>
			<span class="pager-title">{steps.prevTitle}</span>
		</a>
		<span class="pager-doodles" aria-hidden="true">
			@for (const doodle of doodles; key doodle.name) {
				<span class="pager-doodle" style={'--doodle-size:' + doodle.size}>
					<svg>
						<use href={sprite + doodle.name} />
					</svg>
				</span>
			}
		</span>
		<a
			class={steps.nextHref ? 'pager-link pager-next' : 'pager-link pager-next is-empty'}
			href={steps.nextHref || '/'}
		>
			<span class="pager-dir">Next <lucide.arrowright aria-hidden="true" /></span>
			<span class="pager-title">{steps.nextTitle}</span>
		</a>
	</nav>
}
