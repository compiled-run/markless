import { lucide, navbar } from '@markless/ui';

export default function NavbarBasic() @{
	<navbar.root class="navbar" aria-label="Primary" value="products">
		<navbar.item class="item" value="home">
			<navbar.itemlink class="top" href="#home" current>Home</navbar.itemlink>
		</navbar.item>
		<navbar.item class="item" value="products">
			<navbar.itemtrigger class="top">
				Products
				<lucide.chevrondown class="caret" aria-hidden="true" />
			</navbar.itemtrigger>
			<navbar.itemcontent class="panel">
				<navbar.itemlink class="link" href="#keyboards">
					Keyboards
					<span class="link-note">Quiet, clicky, split</span>
				</navbar.itemlink>
				<navbar.itemlink class="link" href="#mice">
					Mice
					<span class="link-note">Wired and wireless</span>
				</navbar.itemlink>
			</navbar.itemcontent>
		</navbar.item>
		<navbar.item class="item" value="docs">
			<navbar.itemtrigger class="top">
				Docs
				<lucide.chevrondown class="caret" aria-hidden="true" />
			</navbar.itemtrigger>
			<navbar.itemcontent class="panel">
				<navbar.itemlink class="link" href="#start">
					Getting started
					<span class="link-note">Set up in five minutes</span>
				</navbar.itemlink>
				<navbar.itemlink class="link" href="#api">
					API
					<span class="link-note">Every part and prop</span>
				</navbar.itemlink>
			</navbar.itemcontent>
		</navbar.item>

		<style>
			.navbar {
				display: flex;
				gap: 0.4em;
				align-items: center;
				box-sizing: border-box;
				width: min(26rem, 100%);
				margin-block-end: 8.5rem;
				padding: 0.4em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;
				color: var(--ink);
			}

			.item {
				position: relative;
			}

			.top {
				display: inline-flex;
				gap: 0.35em;
				align-items: center;
				padding: 0.4em 0.75em;
				border: 0;
				border-radius: 4px;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				text-decoration: none;
				cursor: pointer;
				transition: background 140ms ease;
			}

			.top:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.top[ui-open] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.top[ui-active] {
				text-decoration: underline;
				text-decoration-color: var(--pink);
				text-decoration-thickness: 2px;
				text-underline-offset: 0.25em;
			}

			.caret {
				width: 1em;
				height: 1em;
				opacity: 0.65;
				transition: transform 140ms ease;
			}

			.top[ui-open] .caret {
				transform: rotate(180deg);
			}

			.panel {
				position: absolute;
				inset-block-start: calc(100% + 0.6em);
				inset-inline-start: 0;
				z-index: 3;
				display: grid;
				gap: 0.2em;
				box-sizing: border-box;
				width: 13rem;
				padding: 0.4em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				box-shadow: 3px 3px 0 var(--muted-ink);
			}

			.panel[hidden] {
				display: none;
			}

			.link {
				display: grid;
				padding: 0.45em 0.65em;
				border-radius: 4px;
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				text-decoration: none;
			}

			.link:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.link-note {
				color: var(--muted-ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--2);
			}

			.top:focus-visible,
			.link:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}

			@media (prefers-reduced-motion: reduce) {
				.top,
				.caret {
					transition: none;
				}
			}
		</style>
	</navbar.root>;
}
