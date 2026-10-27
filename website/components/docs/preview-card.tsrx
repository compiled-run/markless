// Every part declares a <style>: the compiler stamps the scope class only on components that do.
import type { Children } from '@markless/core';
import { state } from '@markless/core';
import { lucide, tooltip } from '@markless/ui';
import type { CodePane } from '../../tooling/code-blocks.ts';

/** One file of the code band: `codePane()` from tooling/code-blocks.ts makes it. */
export type PreviewFile = CodePane;

/** The card: put Controls, Stage, Watch and Code inside, in that order. Each is optional. */
export default function PreviewCard({
	name,
	label,
	children,
}: {
	/** Written as `data-preview`, so tests and screenshots can find the card. */
	readonly name?: string;
	/** The card's accessible name. */
	readonly label?: string;
	readonly children?: Children;
}) @{
	<section class="pg" data-preview={name} aria-label={label}>
		{children}
		<style>
			.pg {
				position: relative;
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				margin-block: var(--space-m);
				border: 1.5px solid var(--ink);
				border-radius: 14px;
				background: var(--paper);
				box-shadow: 7px 7px 0 var(--pg-shadow, var(--pg-accent));
				font-family: var(--pg-font);
				font-size: var(--step--1);
				line-height: 1.5;
			}

			.pg {
				--pg-accent: color-mix(in srgb, var(--purple) 45%, var(--paper));
				--pg-wash: color-mix(in srgb, var(--purple) 26%, var(--paper));
				--pg-edge: color-mix(in oklch, var(--ink) 80%, transparent);
				--pg-font: 'Shantell Sans', system-ui, sans-serif;

				html.dark & {
					--pg-accent: color-mix(in srgb, var(--purple) 42%, var(--paper));
					--pg-wash: color-mix(in srgb, var(--purple) 20%, var(--paper));
				}
			}

			@media (max-width: 600px) {
				.pg {
					border-radius: 10px;
					box-shadow: 4px 4px 0 var(--pg-shadow, var(--pg-accent));
				}
			}

			.pg {
				--pg-shadow: var(--muted-ink);
				--pg-bleed: min(4.6rem, 2 * var(--space-s-l));
				--pg-inset: calc(var(--pg-bleed) / 2 - 1.5px);
				width: calc(100% + var(--pg-bleed));
				box-sizing: border-box;
				margin-inline: calc(var(--pg-bleed) / -2) 0;
			}

			.pg .pg-controls {
				padding-inline-start: var(--pg-inset);
			}

			@media (max-width: 600px) {
				.pg {
					--pg-bleed: 0px;
					--pg-inset: 1em;
				}
			}
		</style>
	</section>
}

/** The top band: an optional title on the left, then the controls you put inside. */
export function Controls({ title, children }: { readonly title?: string; readonly children?: Children }) @{
	<div class="pg-controls">
		<div class="pg-quick">
			@if (title) {
				<p class="pv-title">{title}</p>
			}
			{children}
		</div>
		<style>
			.pg-controls {
				display: grid;
				gap: 1em;
				padding: 1.25em 1.35em;
				border-block-end: 1px solid var(--pg-edge);
			}

			.pg-quick,
			.pg-rest {
				display: flex;
				flex-wrap: wrap;
				gap: 0.9em 2em;
				align-items: center;
			}

			@media (max-width: 600px) {
				.pg-controls {
					padding: 1em;
				}

				.pg-quick,
				.pg-rest {
					gap: 1em;
				}

			}

			.pv-title {
				margin: 0;
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				font-weight: 700;
				line-height: 1.25;
			}

			.pv-push {
				margin-inline-start: auto;
			}
		</style>
	</div>
}

/** The middle band: the live demo, centred. */
export function Stage({ children }: { readonly children?: Children }) @{
	<div class="pg-stage">
		{children}
		<style>
			.pg-stage {
				display: grid;
				place-items: center;
				min-height: 18rem;
				padding: 2.5em 1.25em 2.25em;
				box-sizing: border-box;
			}
		</style>
	</div>
}

/** The notice strip under the stage: one line saying what the mechanism just did. */
export function Watch({ children }: { readonly children?: Children }) @{
	<div class="pv-watch">
		<span class="pv-watch-label">Watch</span>
		<span class="pv-watch-text" aria-live="polite">{children}</span>
		<style>
			.pv-watch {
				display: flex;
				flex-wrap: wrap;
				gap: 0.35em 0.8em;
				align-items: baseline;
				margin: 0;
				padding: 0.8em 1.35em;
				border-block-start: 1px dashed var(--code-edge);
				background: var(--tinted);
				color: var(--ink);
				font-family: var(--pg-font);
				font-size: var(--step--1);
				line-height: 1.5;
			}

			.pv-watch:last-child {
				border-radius: 0 0 13px 13px;
			}

			.pv-watch-label {
				padding: 0 0.3em;
				border-radius: 3px;
				background: var(--mark);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-weight: 700;
			}

			.pv-watch-text {
				flex: 1 1 20em;
			}

			.pv-watch + .pg-code {
				padding-block-start: 0.75em;
			}
		</style>
	</div>
}

/** A `?` dot after a control; its tip shows `title` and `text`. */
export function Hint({ title, text }: { readonly title: string; readonly text: string }) @{
	<tooltip.root class="pg-hint">
		<tooltip.trigger class="pg-dot" aria-label={`About ${title}`}>
			<lucide.circlehelp class="ico" aria-hidden="true" />
		</tooltip.trigger>
		<tooltip.content class="pg-tip">
			<span class="tsrx-tip-title">{title}</span>
			<span class="tsrx-tip-body">{text}</span>
		</tooltip.content>
		<style>
			.pg-hint {
				position: relative;
				display: inline-flex;
				align-items: center;
			}

			.pg-dot {
				display: inline-grid;
				place-items: center;
				box-sizing: border-box;
				width: 1.1em;
				height: 1.1em;
				padding: 0;
				border: 0;
				background: transparent;
				color: var(--ink);
				opacity: 0.85;
				font: inherit;
				font-size: inherit;
				font-weight: 700;
				line-height: 1;
				cursor: help;
			}

			.pg-dot:hover,
			.pg-dot:focus-visible {
				opacity: 1;
			}

			.pg-tip {
				position: absolute;
				inset-block-start: calc(100% + 0.35em);
				inset-block-end: auto;
				inset-inline-start: 0;
			}

			.pg-tip {
				z-index: 40;
				width: max-content;
				max-width: min(36ch, calc(100vw - 2 * var(--space-s-l)));
				margin: 0;
				padding: 0.15em 0;
				border: 0;
				border-radius: 6px;
				background: var(--slab);
				box-shadow: 3px 3px 0 var(--pg-accent);
				color: var(--slab-ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.4;
				text-align: start;
				white-space: normal;
			}

			.pg-tip .tsrx-tip-title,
			.pg-tip .tsrx-tip-body,
			.pg-tip .tsrx-tip-type {
				display: block;
				background: transparent;
				border: 0;
				color: inherit;
			}

			.pg-tip .tsrx-tip-title {
				padding: 0.45em 0.75em 0.35em;
				font-family: var(--font-mono);
				font-size: var(--step--2);
				font-weight: 700;
			}

			.pg-tip .tsrx-tip-body {
				padding: 0 0.75em 0.5em;
			}

			.pg-tip .tsrx-tip-body:empty {
				display: none;
			}

			.pg-tip .tsrx-tip-type {
				padding: 0.4em 0.75em;
				border-block-start: 1px solid color-mix(in oklch, var(--slab-ink) 30%, transparent);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				opacity: 0.8;
			}

			.pg-tip:is([ui-closed], [hidden]) {
				display: none;
			}

			@supports (position-area: block-end) {
				.pg-hint {
					anchor-scope: --pg-hint;
				}

				.pg-dot {
					anchor-name: --pg-hint;
				}

				.pg-tip {
					position: fixed;
				inset: auto;
				position-anchor: --pg-hint;
				position-area: block-end span-inline-end;
				position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
					margin-block: 0.35em;
				}
			}
		</style>
	</tooltip.root>
}

/** An on/off control: always a switch. */
export function Switch({
	label,
	hint,
	checked,
	disabled,
	onChange,
}: {
	readonly label: string;
	readonly hint?: string;
	readonly checked?: boolean;
	readonly disabled?: boolean;
	readonly onChange?: (checked: boolean) => void;
}) @{
	let on = state(checked === true);

	<div class="pg-cell">
		<label class="pg-ctl">
			<span class="pg-name">{label}</span>
			<button
				class="pg-switch"
				type="button"
				role="switch"
				aria-checked={on ? 'true' : 'false'}
				ui-checked={on}
				disabled={disabled}
				onClick={() => {
					on = !on;
					onChange?.(on);
				}}
			>
				<span class="pg-knob"></span>
			</button>
		</label>
		@if (hint) {
			<Hint title={label} text={hint} />
		}
		<style>
			.pg-cell {
				display: flex;
				gap: 0.3em;
				align-items: center;
			}

			.pg-ctl {
				display: flex;
				gap: 0.65em;
				align-items: center;
			}

			.pg-name {
				font-family: var(--pg-font);
				font-size: inherit;
				line-height: 1.3;
				color: var(--ink);
			}

			.pg-switch {
				display: flex;
				align-items: center;
				box-sizing: border-box;
				flex: none;
				width: 3em;
				height: 1.65em;
				padding: 0;
				border: 1px solid var(--ink);
				border-radius: 999px;
				background: color-mix(in oklch, var(--switch-off) 20%, var(--paper));
				font-size: inherit;
				transition: background 140ms ease;
				cursor: pointer;
			}

			.pg-switch[ui-checked] {
				background: color-mix(in srgb, var(--switch-on) 65%, var(--paper));
			}

			.pg-switch:disabled {
				cursor: not-allowed;
				opacity: 0.55;
			}

			.pg-knob {
				display: block;
				box-sizing: border-box;
				flex: none;
				width: 1.65em;
				height: 1.65em;
				margin-inline-start: 0;
				margin-block: -1px;
				border: 1px solid var(--ink);
				border-radius: 999px;
				background: var(--paper);
				box-shadow: 1px 1px 1px color-mix(in oklch, var(--ink) 15%, transparent);
				transition: margin-inline-start 130ms ease;
			}

			.pg-switch[ui-checked] .pg-knob {
				margin-inline-start: calc(100% - 1.65em);
			}

			.pg-switch:focus-visible,
			.pg-dot:focus-visible,
			.pg-showall:focus-visible,
			.pg-pick-trigger:focus-visible,
			.pg-pick-item:focus-visible,
			.pg-field:focus-visible,
			.pg-tab:focus-visible,
			.pg-expand:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.pg-name,
			.pg-pick-value,
			.pg-pick-item *,
			.pg-showall span {
				font-family: var(--pg-font);
			}
		</style>
	</div>
}

/** One of two to four short options, drawn as a segmented row of native radios. `label` names the group, so keep it unique on the page. */
// Fixed slots, no @for: a handler on a repeated item stops reaching the caller after the first change.
export function Choice({
	label,
	hint,
	options,
	value,
	onChange,
}: {
	readonly label: string;
	readonly hint?: string;
	readonly options: readonly string[];
	readonly value: string;
	readonly onChange?: (value: string) => void;
}) @{
	const [first, second, third, fourth] = options;
	const name = `pv-choice-${label}`;

	<div class="pg-cell">
		<div class="pg-ctl pv-choice" role="radiogroup" aria-label={label}>
			<span class="pg-name" aria-hidden="true">{label}</span>
			<div class="pv-seg">
				<label class="pv-seg-item">
					<input
						class="pv-seg-field"
						type="radio"
						name={name}
						value={first}
						// markless-allow MARKLESS_TEMPLATE_EXPRESSION_STATIC: value is the initial choice and every caller passes a literal; the radios keep their own checked state after that
						checked={first === value}
						onChange={(event) => onChange?.((event.target as HTMLInputElement).value)}
					/>
					<span class="pv-seg-label">{first}</span>
				</label>
				<label class="pv-seg-item">
					<input
						class="pv-seg-field"
						type="radio"
						name={name}
						value={second}
						// markless-allow MARKLESS_TEMPLATE_EXPRESSION_STATIC: value is the initial choice and every caller passes a literal; the radios keep their own checked state after that
						checked={second === value}
						onChange={(event) => onChange?.((event.target as HTMLInputElement).value)}
					/>
					<span class="pv-seg-label">{second}</span>
				</label>
				@if (third) {
					<label class="pv-seg-item">
						<input
							class="pv-seg-field"
							type="radio"
							name={name}
							value={third}
							checked={third === value}
							onChange={(event) => onChange?.((event.target as HTMLInputElement).value)}
						/>
						<span class="pv-seg-label">{third}</span>
					</label>
				}
				@if (fourth) {
					<label class="pv-seg-item">
						<input
							class="pv-seg-field"
							type="radio"
							name={name}
							value={fourth}
							checked={fourth === value}
							onChange={(event) => onChange?.((event.target as HTMLInputElement).value)}
						/>
						<span class="pv-seg-label">{fourth}</span>
					</label>
				}
			</div>
		</div>
		@if (hint) {
			<Hint title={label} text={hint} />
		}
		<style>
			.pv-choice {
				flex-wrap: wrap;
			}

			.pv-seg {
				display: flex;
				flex-wrap: wrap;
				row-gap: 0.35em;
			}

			.pv-seg-item {
				position: relative;
				display: flex;
			}

			.pv-seg-field {
				position: absolute;
				inset: 0;
				margin: 0;
				opacity: 0;
				cursor: pointer;
			}

			.pv-seg-label {
				padding: 0.3em 0.8em;
				border: 1px solid var(--pg-edge);
				background: var(--paper);
				color: var(--ink);
				font-family: var(--pg-font);
				font-size: var(--step--1);
				line-height: 1.3;
				transition: background 140ms ease;
			}

			.pv-seg-item + .pv-seg-item .pv-seg-label {
				margin-inline-start: -1px;
			}

			.pv-seg-item:first-child .pv-seg-label {
				border-radius: 6px 0 0 6px;
			}

			.pv-seg-item:last-child .pv-seg-label {
				border-radius: 0 6px 6px 0;
			}

			.pv-seg-item:hover .pv-seg-label {
				background: color-mix(in oklch, var(--pg-wash) 50%, var(--paper));
			}

			.pv-seg-item:has(:checked) .pv-seg-label {
				background: var(--pg-wash);
			}

			.pv-seg-item:has(:focus-visible) .pv-seg-label {
				position: relative;
				z-index: 1;
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}

			@media (prefers-reduced-motion: reduce) {
				.pv-seg-label {
					transition: none;
				}
			}
		</style>
	</div>
}

/** A text button for an action: Reset, Reload, Back, Next. `end` pushes it to the row's far side. */
export function Action({
	end,
	disabled,
	onClick,
	children,
}: {
	readonly end?: boolean;
	readonly disabled?: boolean;
	readonly onClick?: () => void;
	readonly children?: Children;
}) @{
	<button type="button" class={end ? 'pv-action pv-push' : 'pv-action'} disabled={disabled} onClick={() => onClick?.()}>
		{children}
		<style>
			.pv-action {
				display: inline-flex;
				gap: 0.4em;
				align-items: center;
				padding: 0.2em 0.4em;
				border: 0;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-family: var(--pg-font);
				font-size: inherit;
				line-height: 1.3;
				cursor: pointer;
			}

			.pv-action:hover {
				text-decoration: underline;
				text-decoration-color: var(--pink);
				text-underline-offset: 0.15em;
			}

			.pv-action:disabled {
				cursor: not-allowed;
				opacity: 0.55;
			}

			.pv-action:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}
		</style>
	</button>
}

/** Code or an identifier inside a Watch line or a control label: mono, without the prose chip. */
export function Mono({ children }: { readonly children?: Children }) @{
	<code class="pv-mono">
		{children}
		<style>
			.pv-mono {
				display: inline;
				padding: 0;
				border-radius: 0;
				background: none;
				color: inherit;
				font-family: var(--font-mono);
				font-size: 0.92em;
				line-height: inherit;
				transform: none;
			}
		</style>
	</code>
}
