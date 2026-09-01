import { accordion } from '@markless/ui';

export default function Settings() @{
	<accordion.root class="settings" value="profile">
		<accordion.item class="group" value="profile">
			<accordion.itemlabel class="group-heading">
				<accordion.itemtrigger class="group-trigger">
					<span class="group-name">Profile</span>
					<span class="group-note">Name and public handle</span>
				</accordion.itemtrigger>
			</accordion.itemlabel>
			<accordion.itemcontent class="group-panel">
				<div class="field">
					<label class="field-name" for="settings-name">Display name</label>
					<input class="field-input" id="settings-name" name="name" value="Ada Lovelace" />
				</div>
				<div class="field">
					<label class="field-name" for="settings-handle">Handle</label>
					<input class="field-input" id="settings-handle" name="handle" value="ada-lovelace" />
				</div>
			</accordion.itemcontent>
		</accordion.item>

		<accordion.item class="group" value="notifications">
			<accordion.itemlabel class="group-heading">
				<accordion.itemtrigger class="group-trigger">
					<span class="group-name">Notifications</span>
					<span class="group-note">What we are allowed to email you about</span>
				</accordion.itemtrigger>
			</accordion.itemlabel>
			<accordion.itemcontent class="group-panel">
				<label class="check">
					<input class="check-box" type="checkbox" name="digest" checked />
					<span>Weekly digest</span>
				</label>
				<label class="check">
					<input class="check-box" type="checkbox" name="mentions" />
					<span>Someone mentions me</span>
				</label>
			</accordion.itemcontent>
		</accordion.item>

		<accordion.item class="group is-danger" value="danger">
			<accordion.itemlabel class="group-heading">
				<accordion.itemtrigger class="group-trigger">
					<span class="group-name">Danger zone</span>
					<span class="group-note">Deleting an account cannot be undone</span>
				</accordion.itemtrigger>
			</accordion.itemlabel>
			<accordion.itemcontent class="group-panel">
				<div class="field">
					<label class="field-name" for="settings-confirm">Type DELETE to confirm</label>
					<input class="field-input" id="settings-confirm" name="confirm" placeholder="DELETE" />
				</div>
				<button class="danger-button" type="button">Delete this account</button>
			</accordion.itemcontent>
		</accordion.item>

		<style>
			.settings {
				display: grid;
				gap: 0.6em;
				width: min(34rem, 100%);
			}

			.group {
				border: 2px solid var(--code-edge);
				border-radius: 8px;
				background: var(--raised);
				overflow: clip;
			}

			.group[ui-open] {
				border-color: var(--ink);
			}

			.group.is-danger[ui-open] {
				border-color: var(--pink);
			}

			.group-heading {
				margin: 0;
				font-size: var(--step--1);
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
				font: inherit;
				text-align: left;
				cursor: pointer;
			}

			.group-trigger:hover {
				background: var(--tinted-quiet);
			}

			.group-name {
				font-weight: 700;
			}

			.group-note {
				grid-column: 1;
				font-size: var(--step--2);
				opacity: 0.7;
			}

			.group-trigger::after {
				content: '▾';
				grid-column: 2;
				grid-row: 1 / span 2;
				align-self: center;
				transition: transform 140ms ease;
			}

			.group-trigger[ui-open]::after {
				transform: rotate(180deg);
			}

			/* A closed panel keeps its box for find-in-page, so the padding waits
			   for ui-open or every closed group carries a strip of empty paper. */
			.group-panel {
				display: grid;
				gap: 0.7em;
				background: var(--paper);
			}

			.group-panel[ui-open] {
				padding: 0.2em 0.9em 0.9em;
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
