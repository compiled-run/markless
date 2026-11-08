import { state } from '@markless/core';
import { navbar } from '../../index.ts';

// A site header with controls that open no dropdown: a theme switch sitting in the
// bar beside the entries, and one inside a dropdown, between two links.
export default function BarControls() @{
	const page = state({ presses: 0 });

	<div>
		<navbar.trigger data-testid="outside-trigger">Outside every bar</navbar.trigger>
		<navbar.root aria-label="Primary" data-testid="root">
			<navbar.itemlink href="/" data-testid="brand-itemlink">Brand</navbar.itemlink>
			<navbar.item value="docs" data-testid="docs-item">
				<navbar.itemtrigger data-testid="docs-itemtrigger">Docs</navbar.itemtrigger>
				<navbar.itemcontent data-testid="docs-itemcontent">
					<navbar.itemlink href="/docs/start" data-testid="start-itemlink">Start</navbar.itemlink>
					<navbar.trigger data-testid="inner-trigger">Copy link</navbar.trigger>
					<navbar.itemlink href="/docs/api" data-testid="api-itemlink">API</navbar.itemlink>
				</navbar.itemcontent>
			</navbar.item>
			<navbar.trigger
				data-testid="theme-trigger"
				onClick={() => {
					page.presses += 1;
				}}
			>
				Dark theme
			</navbar.trigger>
			<navbar.trigger hidden data-testid="hidden-trigger">Light theme</navbar.trigger>
			<navbar.item value="cta" data-testid="cta-item">
				<navbar.itemlink href="/start" data-testid="cta-itemlink">Get started</navbar.itemlink>
			</navbar.item>
		</navbar.root>
		<output data-testid="presses">{page.presses}</output>
	</div>
}
