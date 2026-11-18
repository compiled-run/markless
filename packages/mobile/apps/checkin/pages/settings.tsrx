import { storage } from '@markless/core';
import { radiogroup, select, toggle } from '@markless/ui';
import Shell from '../lib/Shell.tsrx';
import { SITES } from '../lib/checkins.ts';

export default function Settings() @{
	let autoLocate = storage('auto-locate', 'on');
	let reminder = storage('reminder', 'off');
	let photoSize = storage('photo-size', 'medium');
	let defaultSite = storage('default-site', 'North yard');
	let appearance = storage('appearance', 'system');

	<Shell title="Settings">
		<style>
			.group {
				display: grid;
				gap: 4px;
				padding: 6px 18px;
				border: 1px solid var(--line);
				border-radius: var(--radius);
				background: var(--card);
			}
			.group h2 {
				margin: 12px 0 4px;
				font-size: 15px;
				color: var(--muted);
			}
			.switch {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 12px;
				min-height: 52px;
			}
			.track {
				position: relative;
				width: 52px;
				height: 32px;
				border: 0;
				border-radius: 999px;
				background: var(--line);
			}
			.track[ui-checked] {
				background: var(--accent);
			}
			.thumb {
				position: absolute;
				top: 3px;
				left: 3px;
				width: 26px;
				height: 26px;
				border-radius: 50%;
				background: #ffffff;
				transition: translate 120ms;
			}
			.track[ui-checked] .thumb {
				translate: 20px 0;
			}
			.choices {
				display: grid;
				grid-template-columns: repeat(3, 1fr);
				gap: 8px;
				padding-bottom: 12px;
			}
			.choice {
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 6px;
				min-height: 44px;
				border: 1px solid var(--line);
				border-radius: 10px;
			}
			.choice[ui-selected] {
				border-color: var(--accent);
				font-weight: 600;
			}
			.dot {
				width: 10px;
				height: 10px;
				border-radius: 50%;
				background: var(--accent);
			}
			.choice:not([ui-selected]) .dot {
				visibility: hidden;
			}
			.picker {
				position: relative;
				padding-bottom: 12px;
			}
			.current {
				margin: 4px 0 8px;
				font-weight: 600;
			}
			.picker-trigger {
				display: flex;
				justify-content: space-between;
				width: 100%;
				min-height: 44px;
				padding: 10px 14px;
				border: 1px solid var(--line);
				border-radius: 10px;
				background: var(--paper);
			}
			.picker-list {
				position: absolute;
				z-index: 5;
				right: 0;
				left: 0;
				padding: 6px;
				border: 1px solid var(--line);
				border-radius: 10px;
				background: var(--card);
				box-shadow: var(--shadow);
			}
			.picker-item {
				display: flex;
				justify-content: space-between;
				padding: 10px 12px;
				border-radius: 8px;
			}
			.picker-item[ui-highlighted] {
				background: var(--line);
			}
			.mark[ui-hidden] {
				visibility: hidden;
			}
		</style>
		<h1>Settings</h1>
		<section class="group" aria-label="Capture">
			<h2>Capture</h2>
			<toggle.root
				class="switch"
				checked={autoLocate === 'on'}
				onChange={(next: boolean) => (autoLocate = next ? 'on' : 'off')}
			>
				<toggle.label>Attach my location</toggle.label>
				<toggle.trigger class="track">
					<toggle.thumb class="thumb" />
				</toggle.trigger>
			</toggle.root>
			<toggle.root
				class="switch"
				checked={reminder === 'on'}
				onChange={(next: boolean) => (reminder = next ? 'on' : 'off')}
			>
				<toggle.label>End-of-day reminder</toggle.label>
				<toggle.trigger class="track">
					<toggle.thumb class="thumb" />
				</toggle.trigger>
			</toggle.root>
			<radiogroup.root
				name="photo-size"
				value={photoSize}
				orientation="horizontal"
				onChange={(value: string) => (photoSize = value)}
			>
				<radiogroup.label>Photo size</radiogroup.label>
				<div class="choices">
					<radiogroup.item value="small" class="choice">
						<radiogroup.itemfield />
						<radiogroup.itemtrigger>
							<radiogroup.itemindicator class="dot" />
						</radiogroup.itemtrigger>
						<radiogroup.itemlabel>Small</radiogroup.itemlabel>
					</radiogroup.item>
					<radiogroup.item value="medium" class="choice">
						<radiogroup.itemfield />
						<radiogroup.itemtrigger>
							<radiogroup.itemindicator class="dot" />
						</radiogroup.itemtrigger>
						<radiogroup.itemlabel>Medium</radiogroup.itemlabel>
					</radiogroup.item>
					<radiogroup.item value="full" class="choice">
						<radiogroup.itemfield />
						<radiogroup.itemtrigger>
							<radiogroup.itemindicator class="dot" />
						</radiogroup.itemtrigger>
						<radiogroup.itemlabel>Full</radiogroup.itemlabel>
					</radiogroup.item>
				</div>
			</radiogroup.root>
			<select.root
				class="picker"
				name="default-site"
				value={defaultSite}
				onChange={(value: string) => (defaultSite = value)}
			>
				<select.label>Default site</select.label>
				<p class="current">{defaultSite}</p>
				<select.trigger class="picker-trigger">
					Change
					<span aria-hidden="true">▾</span>
				</select.trigger>
				<select.content class="picker-list">
					<div role="presentation">
						@for (const site of SITES; key site) {
							<select.item value={site} class="picker-item">
								<select.itemlabel>{site}</select.itemlabel>
								<select.itemindicator class="mark">✓</select.itemindicator>
							</select.item>
						}
					</div>
				</select.content>
			</select.root>
		</section>
		<section class="group" aria-label="Display">
			<h2>Display</h2>
			<radiogroup.root
				name="appearance"
				value={appearance}
				orientation="horizontal"
				onChange={(value: string) => (appearance = value)}
			>
				<radiogroup.label>Appearance</radiogroup.label>
				<div class="choices">
					<radiogroup.item value="system" class="choice">
						<radiogroup.itemfield />
						<radiogroup.itemtrigger>
							<radiogroup.itemindicator class="dot" />
						</radiogroup.itemtrigger>
						<radiogroup.itemlabel>System</radiogroup.itemlabel>
					</radiogroup.item>
					<radiogroup.item value="light" class="choice">
						<radiogroup.itemfield />
						<radiogroup.itemtrigger>
							<radiogroup.itemindicator class="dot" />
						</radiogroup.itemtrigger>
						<radiogroup.itemlabel>Light</radiogroup.itemlabel>
					</radiogroup.item>
					<radiogroup.item value="dark" class="choice">
						<radiogroup.itemfield />
						<radiogroup.itemtrigger>
							<radiogroup.itemindicator class="dot" />
						</radiogroup.itemtrigger>
						<radiogroup.itemlabel>Dark</radiogroup.itemlabel>
					</radiogroup.item>
				</div>
			</radiogroup.root>
		</section>
	</Shell>
}
