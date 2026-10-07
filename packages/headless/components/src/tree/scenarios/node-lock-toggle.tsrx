import { state } from '@markless/core';
import { toggle, tree } from '../../index.ts';

// Page switches change one node after the tree is live: only that node's row and
// trigger change, whichever position it holds among its siblings. Each trigger
// sits inside a row wrapper of the consumer's, as a styled tree writes it.
export default function NodeLockToggle() @{
	let openSrc = state(true);
	let lockDocs = state(false);
	let lockSrc = state(false);
	let lockAll = state(false);
	let last = state('nothing yet');

	<div>
		<toggle.root checked={lockDocs} onChange={(next: boolean) => (lockDocs = next)}>
			<toggle.trigger data-testid="lock-docs"><toggle.thumb /></toggle.trigger>
			<toggle.label>docs disabled</toggle.label>
		</toggle.root>
		<toggle.root checked={lockSrc} onChange={(next: boolean) => (lockSrc = next)}>
			<toggle.trigger data-testid="lock-src"><toggle.thumb /></toggle.trigger>
			<toggle.label>src disabled</toggle.label>
		</toggle.root>
		<toggle.root checked={lockAll} onChange={(next: boolean) => (lockAll = next)}>
			<toggle.trigger data-testid="lock-all"><toggle.thumb /></toggle.trigger>
			<toggle.label>Disabled</toggle.label>
		</toggle.root>
		<toggle.root checked={openSrc} onChange={(next: boolean) => (openSrc = next)}>
			<toggle.trigger data-testid="open-src"><toggle.thumb /></toggle.trigger>
			<toggle.label>src open</toggle.label>
		</toggle.root>
		<output data-testid="last">{last}</output>
		<tree.root class="files" aria-label="Project files" disabled={lockAll} data-testid="root">
			<tree.item
				class="row"
				open={openSrc}
				disabled={lockSrc}
				onChange={(open: boolean) => {
					last = open ? 'src opened' : 'src closed';
				}}
				data-testid="src-item"
			>
				<div class="line">
					<tree.itemtrigger class="arrow" data-testid="src-itemtrigger">
						<tree.itemindicator class="arrow-mark">
							<svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
						</tree.itemindicator>
					</tree.itemtrigger>
					<tree.itemlabel>src</tree.itemlabel>
				</div>
				<tree.itemcontent class="group">
					<tree.item class="row" leaf level={2} data-testid="index-item">
						<div class="line"><tree.itemlabel>index.ts</tree.itemlabel></div>
					</tree.item>
					<tree.item class="row" leaf level={2} data-testid="app-item">
						<div class="line"><tree.itemlabel>app.tsrx</tree.itemlabel></div>
					</tree.item>
				</tree.itemcontent>
			</tree.item>
			<tree.item
				class="row"
				disabled={lockDocs}
				onChange={(open: boolean) => {
					last = open ? 'docs opened' : 'docs closed';
				}}
				data-testid="docs-item"
			>
				<div class="line">
					<tree.itemtrigger class="arrow" data-testid="docs-itemtrigger">
						<tree.itemindicator class="arrow-mark">
							<svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
						</tree.itemindicator>
					</tree.itemtrigger>
					<tree.itemlabel>docs</tree.itemlabel>
				</div>
				<tree.itemcontent class="group">
					<tree.item class="row" leaf level={2} data-testid="guide-item">
						<div class="line"><tree.itemlabel>guide.md</tree.itemlabel></div>
					</tree.item>
				</tree.itemcontent>
			</tree.item>
			<tree.item class="row" leaf data-testid="readme-item">
				<div class="line"><tree.itemlabel>README.md</tree.itemlabel></div>
			</tree.item>
		</tree.root>
	</div>
}
