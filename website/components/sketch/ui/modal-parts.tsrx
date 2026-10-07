// A real modal drawn as boxes; every ui-open tag is CSS reading the live attributes.
import { state } from '@markless/core';
import { modal } from '@markless/ui';
import PreviewCard, { Controls, Mono, Stage, Watch } from '../../docs/preview-card.tsrx';

export default function ModalParts() @{
	let open = state(false);

	<PreviewCard name="modal-parts" label="Which modal parts carry ui-open">
		<Controls title="Which parts say it is open?" />
		<Stage>
			<modal.root class="box root" onChange={(next: boolean) => (open = next)}>
				<modal.trigger class="box trigger">Edit address</modal.trigger>
				<modal.backdrop class="box backdrop">
					<modal.content class="box content">
						<modal.title class="box title">Edit address</modal.title>
						<modal.close class="box close">Cancel</modal.close>
					</modal.content>
				</modal.backdrop>
			</modal.root>
		</Stage>
		<Watch>
			<span class="said">
				{open
					? 'Open. root, trigger, backdrop and content carry ui-open. title and close do not.'
					: 'Closed. No part has ui-open. Press the trigger, then Cancel or Escape.'}
			</span>
		</Watch>
		<style>
			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.box {
				position: relative;
				box-sizing: border-box;
				margin: 0;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				transition: background 140ms ease;
			}

			.box::before,
			.box[ui-open]::after {
				position: absolute;
				inset-block-start: -0.75em;
				padding: 0 0.35em;
				font-family: var(--font-mono);
				font-size: var(--step--2);
				font-weight: 400;
				line-height: 1.4;
				white-space: nowrap;
			}

			.box::before {
				inset-inline-start: 0.6em;
				background: var(--paper);
				color: var(--ink);
			}

			.root {
				display: grid;
				gap: 1.4em;
				width: min(24rem, 100%);
				padding: 1.5em 1.1em 1.1em;
			}

			.root::before {
				content: 'modal.root' / '';
			}

			.trigger {
				justify-self: start;
				padding: 0.5em 1em;
				font-size: var(--step-0);
				cursor: pointer;
			}

			.trigger:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.trigger::before {
				content: 'modal.trigger' / '';
			}

			.trigger:focus-visible,
			.close:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.backdrop {
				display: block;
				padding: 1.5em 0.9em 0.9em;
				border-style: dashed;
			}

			.backdrop[hidden] {
				display: block;
			}

			.backdrop[hidden] > .content {
				visibility: hidden;
			}

			.backdrop[hidden]::after {
				content: 'hidden until open' / '';
				position: absolute;
				inset: 0;
				display: grid;
				place-items: center;
				color: var(--muted-ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.backdrop::before {
				content: 'modal.backdrop' / '';
			}

			.content {
				display: grid;
				gap: 1.3em;
				justify-items: start;
				padding: 1.5em 0.9em 0.9em;
			}

			.content::before {
				content: 'modal.content' / '';
			}

			.content:focus {
				outline: none;
			}

			.title {
				padding: 0.45em 0.8em;
				font-size: var(--step-0);
				font-weight: 700;
				text-shadow: none;
			}

			.title::before {
				content: 'modal.title' / '';
			}

			.close {
				padding: 0.4em 0.9em;
				cursor: pointer;
			}

			.close:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.close::before {
				content: 'modal.close' / '';
			}

			.box[ui-open] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.box[ui-open]::after {
				content: 'ui-open' / '';
				inset-inline-end: 0.6em;
				border: 1px solid var(--ink);
				border-radius: 4px;
				background: var(--mark);
				color: var(--on-mark);
			}

			.trigger[ui-open]::after {
				inset-block-start: 50%;
				inset-inline: calc(100% + 0.6em) auto;
				translate: 0 -50%;
			}

			.box[ui-open] > .box::before {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			@media (prefers-reduced-motion: reduce) {
				.box {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
