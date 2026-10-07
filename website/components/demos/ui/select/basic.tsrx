import { computed, state } from '@markless/core';
import { lucide, select } from '@markless/ui';

export default function SelectBasic() @{
	const names: Readonly<Record<string, string>> = {
		apple: 'Apple',
		banana: 'Banana',
		cherry: 'Cherry',
	};
	let fruit = state('');
	const shown = computed(() => (fruit === '' ? 'Choose a fruit' : names[fruit]));
	const written = computed(() => (fruit === '' ? "''" : `'${fruit}'`));

	<select.root
		class="picker"
		name="fruit"
		value={fruit}
		onChange={(next: string) => {
			fruit = next;
		}}
	>
		<select.label class="label">Favourite fruit</select.label>
		<div class="box">
			<select.trigger class="trigger">
				<span>{shown}</span>
				<lucide.chevrondown class="caret" aria-hidden="true" />
			</select.trigger>
			<select.content class="list">
				<select.item class="option" value="apple">
					<select.itemlabel>Apple</select.itemlabel>
					<select.itemindicator class="mark">
						<lucide.check class="icon" aria-hidden="true" />
					</select.itemindicator>
				</select.item>
				<select.item class="option" value="banana">
					<select.itemlabel>Banana</select.itemlabel>
					<select.itemindicator class="mark">
						<lucide.check class="icon" aria-hidden="true" />
					</select.itemindicator>
				</select.item>
				<select.item class="option" value="cherry" disabled>
					<select.itemlabel>Cherry (sold out)</select.itemlabel>
					<select.itemindicator class="mark">
						<lucide.check class="icon" aria-hidden="true" />
					</select.itemindicator>
				</select.item>
			</select.content>
		</div>
		<p class="note">
			value is <span class="code">{written}</span>
		</p>
		<select.field />

		<style>
			.picker {
				display: grid;
				gap: 0.4em;
				box-sizing: border-box;
				width: min(17rem, 100%);
				padding-block-end: 4em;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;
				color: var(--ink);
			}

			.label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.picker[ui-required] .label::after {
				content: ' (required)';
				color: var(--muted-ink);
			}

			.box {
				position: relative;
			}

			.trigger {
				display: flex;
				gap: 0.75em;
				align-items: center;
				justify-content: space-between;
				box-sizing: border-box;
				width: 100%;
				padding: 0.55em 0.9em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				text-align: start;
				cursor: pointer;
				transition: background 140ms ease;
			}

			.trigger:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.trigger[ui-open] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.trigger:disabled {
				opacity: 0.55;
				cursor: not-allowed;
			}

			.trigger:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.caret {
				width: 1em;
				height: 1em;
				flex: none;
				opacity: 0.65;
				transition: rotate 140ms ease;
			}

			.trigger[ui-open] .caret {
				rotate: 180deg;
			}

			.list {
				position: absolute;
				inset-block-start: calc(100% + 0.3em);
				inset-inline: 0;
				z-index: 5;
				display: grid;
				padding: 0.25em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--raised);
				box-shadow: 3px 3px 0 color-mix(in srgb, var(--purple) 45%, var(--paper));
			}

			.list[hidden] {
				display: none;
			}

			.option {
				display: flex;
				gap: 0.75em;
				align-items: center;
				justify-content: space-between;
				padding: 0.4em 0.7em;
				border-radius: 4px;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				cursor: pointer;
			}

			.option:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.option[ui-selected] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.option:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: -2px;
			}

			.option[ui-disabled] {
				opacity: 0.55;
				cursor: not-allowed;
			}

			.option[ui-disabled]:hover {
				background: transparent;
			}

			.mark {
				display: inline-flex;
			}

			.mark[ui-hidden] {
				visibility: hidden;
			}

			.icon {
				width: 1em;
				height: 1em;
			}

			.note {
				margin: 0;
				color: var(--muted-ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.code {
				color: var(--ink);
				font-family: var(--font-mono);
			}

			@media (prefers-reduced-motion: reduce) {
				.trigger,
				.caret {
					transition: none;
				}
			}
		</style>
	</select.root>;
}
