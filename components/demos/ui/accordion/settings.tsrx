import { accordion } from '@markless/ui';
import { lucide } from '@markless/icons';

export default function Settings() @{
	const groups = [
		{
			value: 'profile',
			name: 'Profile',
			note: 'Name and public handle',
			tone: 'default',
			fields: [
				{ id: 'settings-name', name: 'name', label: 'Display name', value: 'Ada Lovelace', placeholder: '' },
				{ id: 'settings-handle', name: 'handle', label: 'Handle', value: 'ada-lovelace', placeholder: '' },
			],
			checks: [],
			actions: [],
		},
		{
			value: 'notifications',
			name: 'Notifications',
			note: 'What we are allowed to email you about',
			tone: 'default',
			fields: [],
			checks: [
				{ name: 'digest', label: 'Weekly digest', checked: true },
				{ name: 'mentions', label: 'Someone mentions me', checked: false },
			],
			actions: [],
		},
		{
			value: 'danger',
			name: 'Danger zone',
			note: 'Deleting an account cannot be undone',
			tone: 'danger',
			fields: [{ id: 'settings-confirm', name: 'confirm', label: 'Type DELETE to confirm', value: '', placeholder: 'DELETE' }],
			checks: [],
			actions: [{ name: 'delete', label: 'Delete this account' }],
		},
	];

	<accordion.root class="settings" value="profile">
		{/* A repeat cannot open directly inside a component tag, so a host element carries it. */}
		<div class="groups" role="presentation">
			@for (const group of groups; key group.value) {
				<accordion.item class="group" value={group.value} data-tone={group.tone}>
					<accordion.itemlabel class="group-heading">
						<accordion.itemtrigger class="group-trigger">
							<span class="group-name">{group.name}</span>
							<span class="group-note">{group.note}</span>
							<lucide.chevrondown class="trigger-icon" aria-hidden="true" />
						</accordion.itemtrigger>
					</accordion.itemlabel>
					<accordion.itemcontent class="group-panel">
						<div class="group-fields" role="presentation">
							@for (const field of group.fields; key field.id) {
								<div class="field">
									<label class="field-name" for={field.id}>{field.label}</label>
									<input class="field-input" id={field.id} name={field.name} value={field.value} placeholder={field.placeholder} />
								</div>
							}
							@for (const check of group.checks; key check.name) {
								<label class="check">
									<input class="check-box" type="checkbox" name={check.name} checked={check.checked} />
									<span>{check.label}</span>
								</label>
							}
							@for (const action of group.actions; key action.name) {
								<button class="danger-button" type="button">{action.label}</button>
							}
						</div>
					</accordion.itemcontent>
				</accordion.item>
			}
		</div>

		<style>
			.settings {
				display: grid;
				gap: 0.6em;
				width: min(34rem, 100%);
			}

			.groups,
			.group-fields {
				display: contents;
			}

			.group {
				border: var(--card-edge);
				border-radius: 6px;
				background: var(--paper);
				overflow: clip;
			}

			.group[ui-open] {
				box-shadow: var(--card-shadow);
			}

			html[data-theme='dark'] .group {
				background: var(--raised);
			}

			html[data-variant='b'] .group[ui-open] {
				border: var(--state-selected-edge);
				transform: rotate(0.6deg);
			}

			html[data-variant='c'] .group {
				border: 0;
				border-block-end: 1px solid color-mix(in oklch, var(--ink) 30%, transparent);
				border-radius: 0;
				box-shadow: none;
			}

			html[data-variant='c'] .group[ui-open] {
				border-inline-start: 4px solid var(--ink);
			}

			.group-heading {
				margin: 0;
				font-size: var(--step-0);
			}

			.group-trigger {
				display: grid;
				grid-template-columns: 1fr auto;
				gap: 0.15em 0.8em;
				width: 100%;
				padding: 0.75em 0.9em;
				border: 0;
				background: transparent;
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				text-align: left;
				cursor: pointer;
			}

			.group-trigger:hover {
				background: var(--state-hover-bg);
				color: var(--state-hover-fg);
			}

			.group-name {
				position: relative;
				z-index: 0;
				font-weight: 700;
			}

			html[data-variant='a'] .group[ui-open] .group-name::before,
			html[data-variant='c'] .group[ui-open] .group-name::before {
				content: '';
				position: absolute;
				inset: 0.05em -0.2em;
				z-index: -1;
				background: var(--swipe);
				transform: rotate(-1deg);
			}

			html[data-variant='c'] .group[ui-open] .group-name::before {
				inset-block: auto 0.05em;
				height: 0.35em;
				background: var(--yellow);
			}

			.group-note {
				grid-column: 1;
				font-size: var(--step--2);
				opacity: 0.7;
			}

			.trigger-icon {
				display: inline-flex;
				width: 1em;
				height: 1em;
				flex: none;
				grid-column: 2;
				grid-row: 1 / span 2;
				align-self: center;
				transition: transform 140ms ease;
			}

			.group-trigger[ui-open] .trigger-icon {
				transform: rotate(180deg);
			}

			/* A closed panel keeps its box for find-in-page, so the padding waits
			   for ui-open or every closed group carries a strip of empty paper. */
			.group-panel {
				display: grid;
				gap: 0.7em;
				background: transparent;
			}

			.group-panel[ui-open] {
				padding: 0.2em 0.9em 0.9em;
			}

			.group-panel[hidden] {
				display: none;
			}

			.field {
				display: grid;
				gap: 0.25em;
			}

			.field-name {
				font-size: var(--step--2);
				font-weight: 700;
			}

			.field-input {
				padding: 0.4em 0.6em;
				border: 2px solid var(--code-edge);
				border-radius: 6px;
				background: var(--raised);
				color: var(--ink);
				font: inherit;
				font-size: var(--step--1);
			}

			.field-input:focus-visible {
				outline: 2px solid var(--pink);
				outline-offset: 1px;
			}

			.check {
				display: flex;
				gap: 0.5em;
				align-items: center;
				font-size: var(--step--1);
			}

			.check-box {
				width: 1.1em;
				height: 1.1em;
				accent-color: var(--pink);
			}

			.danger-button {
				justify-self: start;
				padding: 0.45em 0.9em;
				border: 2px solid var(--pink);
				border-radius: 6px;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-size: var(--step--1);
				font-weight: 700;
				cursor: pointer;
			}

			.danger-button:hover {
				background: var(--pink);
			}
		</style>
	</accordion.root>
}
