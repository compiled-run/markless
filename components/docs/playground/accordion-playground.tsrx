import { state } from '@markless/core';
import { accordion, collapsible, select, toggle, tooltip } from '@markless/ui';
import { accordionPlayground, accordionPresetsByName } from './accordion-controls.ts';

// The hero playground: one island per page. Every control cell lives in this
// module and the demo part tree below reads those cells directly, so no value
// ever crosses a module or island boundary — the shape the controlled
// write-back defect and the second-widget-definition hazard both need.
// Every control surface is a @markless/ui family: toggle for booleans, select
// for a closed option set, collapsible for "Show all", tooltip for the type
// hint. Copy this file per family: swap the demo part tree and the imported
// config, keep the chrome and the CSS.
//
// `@if` hangs the build (NOTES.md finding 23), so nothing here is left out —
// the closed rows are hidden by CSS keyed off the family's own `ui-closed`, and
// the event-log line by a class this module writes.
export default function AccordionPlayground({ children }: { readonly children?: unknown }) @{
	const cfg = accordionPlayground;
	const cMultiple = cfg.controls[0];
	const cCollapsible = cfg.controls[1];
	const cDisabled = cfg.controls[2];
	const cUntilFound = cfg.controls[3];
	const cValueList = cfg.controls[4];
	const cOnChange = cfg.controls[5];
	const presets = cfg.presets;

	let multiple = state(false);
	let collapse = state(true);
	let locked = state(false);
	let untilFound = state(false);
	let open = state('ship');

	// Each switch carries a readout of the cell it writes. Only a text slot
	// tracks a cell inside a family's projected children: a class binding there
	// keeps its seeded value and an attribute binding is dropped outright.
	let multipleText = state('false');
	let collapseText = state('true');
	let lockedText = state('false');
	let untilFoundText = state('false');
	let loggingText = state('false');

	let scenario = state(presets[0].label);
	let logging = state(false);
	let logClass = state('pg-log pg-log-quiet');
	let calls = state(0);

	// A family seeds its props in a component body that runs once, so a live write
	// to a cell never re-reaches the family: the controls below fire and update
	// these cells, and the demo does not follow. The ruled fallback, a keyed
	// remount of the demo, throws MARKLESS_REPEAT_ROW_COMPONENT_SURFACE_MISSING at
	// resume for any row holding a family, so it is unavailable here.

	<section class="pg">
		<collapsible.root class="pg-controls">
			<div class="pg-quick">
				<div class="ctl-cell">
					<toggle.root
						class="ctl"
						checked={multiple}
						onChange={(next: boolean) => {
							multiple = next;
							multipleText = next ? 'true' : 'false';
						}}
					>
						<toggle.label class="ctl-name">{cMultiple.name}</toggle.label>
						<toggle.trigger class="switch">
							<toggle.thumb class="knob" />
						</toggle.trigger>
					</toggle.root>
					<span class="ctl-state">{multipleText}</span>
					<tooltip.root class="hint">
						<tooltip.trigger class="hint-dot" aria-label="Type of multiple">?</tooltip.trigger>
						<tooltip.content class="hint-tip">{cMultiple.type}</tooltip.content>
					</tooltip.root>
				</div>

				<div class="ctl-cell">
					<toggle.root
						class="ctl"
						checked={collapse}
						onChange={(next: boolean) => {
							collapse = next;
							collapseText = next ? 'true' : 'false';
						}}
					>
						<toggle.label class="ctl-name">{cCollapsible.name}</toggle.label>
						<toggle.trigger class="switch">
							<toggle.thumb class="knob" />
						</toggle.trigger>
					</toggle.root>
					<span class="ctl-state">{collapseText}</span>
					<tooltip.root class="hint">
						<tooltip.trigger class="hint-dot" aria-label="Type of collapsible">?</tooltip.trigger>
						<tooltip.content class="hint-tip">{cCollapsible.type}</tooltip.content>
					</tooltip.root>
				</div>

				<div class="ctl-cell">
					<toggle.root
						class="ctl"
						checked={locked}
						onChange={(next: boolean) => {
							locked = next;
							lockedText = next ? 'true' : 'false';
						}}
					>
						<toggle.label class="ctl-name">{cDisabled.name}</toggle.label>
						<toggle.trigger class="switch">
							<toggle.thumb class="knob" />
						</toggle.trigger>
					</toggle.root>
					<span class="ctl-state">{lockedText}</span>
					<tooltip.root class="hint">
						<tooltip.trigger class="hint-dot" aria-label="Type of disabled">?</tooltip.trigger>
						<tooltip.content class="hint-tip">{cDisabled.type}</tooltip.content>
					</tooltip.root>
				</div>

				<collapsible.trigger class="showall">Show all</collapsible.trigger>
			</div>

			<collapsible.content class="pg-rest">
				<div class="ctl-cell">
					<toggle.root
						class="ctl"
						checked={untilFound}
						onChange={(next: boolean) => {
							untilFound = next;
							untilFoundText = next ? 'true' : 'false';
						}}
					>
						<toggle.label class="ctl-name">{cUntilFound.name}</toggle.label>
						<toggle.trigger class="switch">
							<toggle.thumb class="knob" />
						</toggle.trigger>
					</toggle.root>
					<span class="ctl-state">{untilFoundText}</span>
					<tooltip.root class="hint">
						<tooltip.trigger class="hint-dot" aria-label="Type of disableUntilFound">
							?
						</tooltip.trigger>
						<tooltip.content class="hint-tip">{cUntilFound.type}</tooltip.content>
					</tooltip.root>
				</div>

				<div class="ctl-cell">
					<toggle.root
						class="ctl"
						checked={logging}
						onChange={(next: boolean) => {
							logging = next;
							loggingText = next ? 'true' : 'false';
							logClass = next ? 'pg-log' : 'pg-log pg-log-quiet';
						}}
					>
						<toggle.label class="ctl-name">{cOnChange.name}</toggle.label>
						<toggle.trigger class="switch">
							<toggle.thumb class="knob" />
						</toggle.trigger>
					</toggle.root>
					<span class="ctl-state">{loggingText}</span>
					<tooltip.root class="hint">
						<tooltip.trigger class="hint-dot" aria-label="Type of onChange">?</tooltip.trigger>
						<tooltip.content class="hint-tip">{cOnChange.type}</tooltip.content>
					</tooltip.root>
				</div>

				<div class="ctl-cell">
					<select.root class="ctl pick" value={open} onChange={(next: string) => (open = next)}>
						<select.label class="ctl-name">{cValueList.name}</select.label>
						<select.trigger class="pick-trigger">
							<span class="pick-value">{open}</span>
						</select.trigger>
						<select.content class="pick-list">
							<select.item class="pick-item" value="ship">
								<select.itemlabel>ship</select.itemlabel>
							</select.item>
							<select.item class="pick-item" value="returns">
								<select.itemlabel>returns</select.itemlabel>
							</select.item>
							<select.item class="pick-item" value="overseas">
								<select.itemlabel>overseas</select.itemlabel>
							</select.item>
							<select.item class="pick-item" value="">
								<select.itemlabel>(none)</select.itemlabel>
							</select.item>
						</select.content>
					</select.root>
					<tooltip.root class="hint">
						<tooltip.trigger class="hint-dot" aria-label="Type of value">?</tooltip.trigger>
						<tooltip.content class="hint-tip">{cValueList.type}</tooltip.content>
					</tooltip.root>
				</div>
			</collapsible.content>
		</collapsible.root>

		<p class={logClass}>onChange called {calls} time(s)</p>

		<div class="pg-stage">
			<accordion.root
				class="accordion"
				multiple={multiple}
				collapsible={collapse}
				disabled={locked}
				disableUntilFound={untilFound}
				value={open}
				onChange={() => {
					calls = logging ? calls + 1 : calls;
				}}
			>
				<accordion.item class="section" value="ship">
					<accordion.itemlabel class="heading">
						<accordion.itemtrigger class="trigger">When does my order ship?</accordion.itemtrigger>
					</accordion.itemlabel>
					<accordion.itemcontent class="panel">
						Orders leave within two working days.
					</accordion.itemcontent>
				</accordion.item>
				<accordion.item class="section" value="returns">
					<accordion.itemlabel class="heading">
						<accordion.itemtrigger class="trigger">How do I return something?</accordion.itemtrigger>
					</accordion.itemlabel>
					<accordion.itemcontent class="panel">
						Start a return from your orders page.
					</accordion.itemcontent>
				</accordion.item>
				<accordion.item class="section" value="overseas">
					<accordion.itemlabel class="heading">
						<accordion.itemtrigger class="trigger">Do you ship overseas?</accordion.itemtrigger>
					</accordion.itemlabel>
					<accordion.itemcontent class="panel">Everywhere but Antarctica.</accordion.itemcontent>
				</accordion.item>
			</accordion.root>
		</div>

		<div class="pg-bar">
			<select.root
				class="pick bar-pick"
				value={presets[0].name}
				onChange={(next: string) => {
					const preset = accordionPresetsByName[next];
					scenario = preset.label;
					multiple = preset.values.multiple === 'true';
					collapse = preset.values.collapsible === 'true';
					locked = preset.values.disabled === 'true';
					untilFound = preset.values.disableUntilFound === 'true';
					open = preset.values.value;
					multipleText = preset.values.multiple;
					collapseText = preset.values.collapsible;
					lockedText = preset.values.disabled;
					untilFoundText = preset.values.disableUntilFound;
				}}
			>
				<select.label class="bar-name">Scenario</select.label>
				<select.trigger class="pick-trigger bar-trigger">
					<span class="pick-value">{scenario}</span>
				</select.trigger>
				<select.content class="pick-list bar-list">
					<select.item class="pick-item" value="basic">
						<select.itemlabel>{presets[0].label}</select.itemlabel>
					</select.item>
					<select.item class="pick-item" value="multiple">
						<select.itemlabel>{presets[1].label}</select.itemlabel>
					</select.item>
					<select.item class="pick-item" value="locked">
						<select.itemlabel>{presets[2].label}</select.itemlabel>
					</select.item>
					<select.item class="pick-item" value="find">
						<select.itemlabel>{presets[3].label}</select.itemlabel>
					</select.item>
				</select.content>
			</select.root>
		</div>

		<div class="pg-code">{children}</div>

		<style>
			.pg {
				display: grid;
				margin-block: var(--space-s);
				border: 2px solid var(--code-edge);
				border-radius: 10px;
				background: var(--raised);
				overflow: clip;
			}

			.pg-controls {
				display: grid;
				gap: 0.5em;
				padding: 0.7em 0.9em;
				border-block-end: 2px solid var(--code-edge);
			}

			.pg-quick,
			.pg-rest {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4em 1.1em;
				align-items: center;
			}

			.pg-rest {
				padding-block-start: 0.6em;
				border-block-start: 2px dashed var(--code-edge);
			}

			.pg-rest[ui-closed] {
				display: none;
			}

			.ctl-cell {
				display: flex;
				gap: 0.4em;
				align-items: center;
			}

			.ctl {
				display: flex;
				gap: 0.45em;
				align-items: center;
			}

			.ctl-state {
				font-family: var(--font-mono);
				font-size: var(--step--1);
				line-height: 1.3;
				color: var(--ink);
				opacity: 0.65;
			}

			.ctl-name {
				font-family: var(--font-mono);
				font-size: var(--step--1);
				line-height: 1.3;
				color: var(--ink);
			}

			.switch {
				display: flex;
				align-items: center;
				width: 2.4em;
				height: 1.3em;
				padding: 0.12em;
				border: 2px solid var(--ink);
				border-radius: 999px;
				background: var(--paper);
				cursor: pointer;
			}

			.switch[ui-checked] {
				background: var(--yellow);
			}

			.switch:disabled {
				cursor: not-allowed;
				opacity: 0.55;
			}

			.knob {
				display: block;
				width: 0.95em;
				height: 0.95em;
				border-radius: 999px;
				background: var(--ink);
				transition: transform 130ms ease;
			}

			.switch[ui-checked] .knob {
				transform: translateX(1.1em);
			}

			.hint {
				position: relative;
				display: inline-flex;
				align-items: center;
			}

			.hint-dot {
				display: grid;
				place-items: center;
				width: 1.15em;
				height: 1.15em;
				padding: 0;
				border: 2px solid var(--code-edge);
				border-radius: 999px;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-size: var(--step--2);
				line-height: 1;
				cursor: help;
			}

			.hint-tip {
				position: absolute;
				inset-block-start: 100%;
				inset-inline-start: 0;
				z-index: 6;
				width: max-content;
				max-width: 14rem;
				margin-block-start: 0.3em;
				padding: 0.25em 0.55em;
				border-radius: 4px;
				background: var(--slab);
				color: var(--slab-ink);
				font-family: var(--font-mono);
				font-size: var(--step--2);
			}

			.hint-tip[ui-closed] {
				display: none;
			}

			.showall {
				margin-inline-start: auto;
				padding: 0.2em 0.5em;
				border: 0;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-size: var(--step--1);
				font-weight: 700;
				cursor: pointer;
			}

			.showall::after {
				content: ' ›';
			}

			.showall[ui-open]::after {
				content: ' ⌄';
			}

			.pick {
				position: relative;
			}

			.pick-trigger {
				min-width: 6.5em;
				padding: 0.25em 0.6em;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: var(--font-mono);
				font-size: var(--step--1);
				text-align: start;
				cursor: pointer;
			}

			.pick-list {
				position: absolute;
				inset-block-start: 100%;
				inset-inline-start: 0;
				z-index: 5;
				min-width: 8em;
				margin-block-start: 0.25em;
				padding: 0.2em;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
			}

			.pick-list[ui-closed] {
				display: none;
			}

			.pick-item {
				padding: 0.25em 0.5em;
				border-radius: 4px;
				font-family: var(--font-mono);
				font-size: var(--step--1);
				cursor: pointer;
			}

			.pick-item:hover,
			.pick-item[ui-selected] {
				background: var(--tinted);
			}

			.pg-log {
				margin: 0;
				padding: 0.5em 0.9em 0;
				font-family: var(--font-mono);
				font-size: var(--step--1);
				color: var(--ink);
			}

			.pg-log-quiet {
				display: none;
			}

			.pg-stage {
				display: grid;
				place-items: center;
				min-height: 15rem;
				padding: var(--space-s);
				background: var(--paper);
			}

			.pg-bar {
				display: flex;
				flex-wrap: wrap;
				gap: 0.5em 1em;
				justify-content: end;
				padding: 0.6em 0.9em;
				border-block-start: 2px solid var(--code-edge);
			}

			.bar-pick {
				display: grid;
				gap: 0.2em;
				justify-items: start;
			}

			.bar-name {
				font-size: var(--step--2);
				font-weight: 700;
				letter-spacing: 0.04em;
				color: var(--ink);
			}

			.bar-trigger {
				display: flex;
				gap: 0.6em;
				align-items: center;
				justify-content: space-between;
				min-width: 8.5em;
			}

			.bar-trigger::after {
				content: '⌄';
			}

			/* The bar is the last row of a clipped container, so its list opens up. */
			.bar-list {
				inset-block-start: auto;
				inset-block-end: 100%;
				margin-block: 0 0.25em;
			}

			.pg-code:not(:empty) {
				border-block-start: 2px solid var(--code-edge);
				background: var(--code-surface);
			}

			.accordion {
				display: grid;
				gap: 0.5em;
				width: min(32rem, 100%);
			}

			.section {
				border: 2px solid var(--code-edge);
				border-radius: 6px;
				background: var(--paper);
				overflow: clip;
			}

			.section[ui-open] {
				border-color: var(--pink);
			}

			.heading {
				margin: 0;
				font-size: var(--step-0);
			}

			.trigger {
				display: flex;
				gap: 0.6em;
				align-items: center;
				justify-content: space-between;
				width: 100%;
				padding: 0.6em 0.8em;
				border: 0;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-weight: 700;
				text-align: left;
				cursor: pointer;
			}

			.trigger::after {
				content: '▾';
				transition: transform 140ms ease;
			}

			.trigger[ui-open]::after {
				transform: rotate(180deg);
			}

			.trigger:hover {
				background: var(--tinted-quiet);
			}

			.trigger:disabled {
				cursor: not-allowed;
				opacity: 0.55;
			}

			.panel {
				padding: 0 0.8em 0.7em;
				font-size: var(--step--1);
			}

			@media (max-width: 866px) {
				.pg {
					border-inline: 0;
					border-radius: 0;
				}

				.pg-quick,
				.pg-rest {
					flex-direction: column;
					align-items: start;
				}

				.showall {
					margin-inline-start: 0;
				}

				.pg-bar {
					justify-content: start;
				}
			}
		</style>
	</section>
}
