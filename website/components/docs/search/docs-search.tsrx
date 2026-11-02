import { state } from '@markless/core';
import { combobox, modal } from '@markless/ui';
import { navigate } from '@markless/router';
import InkLogo from '../ink-logo.tsrx';
import NothingFound from './nothing-found.tsrx';
import { searchView, type SearchRow } from './search-index.ts';
import { cachedSearchIndex, loadSearchIndex, searchIndexFailed } from './search-load.ts';
import { OPENER_ATTRIBUTE } from './open.ts';

// oxlint-disable-next-line no-unused-vars -- read by <script>{shortcut}</script>
const shortcut = `if(!document.documentElement.hasAttribute('data-docs-search-key')){document.documentElement.setAttribute('data-docs-search-key','');if(/Mac|iP/.test(navigator.platform))document.documentElement.setAttribute('data-docs-search-mac','');document.addEventListener('keydown',e=>{if(!(e.metaKey||e.ctrlKey)||e.altKey||e.shiftKey||e.key.toLowerCase()!=='k')return;const o=document.querySelector('[${OPENER_ATTRIBUTE}]');if(o){e.preventDefault();o.click()}})}`;

/**
 * The docs search dialog, closed. Render it once per page; open it with `openDocsSearch()` from
 * `./open.ts`, or with Cmd K or Ctrl K. Nothing of it runs until it opens.
 */
export default function DocsSearch() @{
	const search = state({ open: false });

	<div class="docs-search">
		<script>{shortcut}</script>
		<modal.root
			open={search.open}
			onChange={(next: boolean) => {
				search.open = next;
			}}
		>
			<modal.backdrop class="backdrop">
				<modal.content class="panel" aria-label="Search the docs">
					<combobox.root
						inline
						class="box"
						placeholder="Search the docs"
						onChange={(value) => {
							if (typeof value !== 'string' || value === '') return;
							search.open = false;
							void navigate(value);
						}}
					>
						<SearchBox
							onOpen={() => {
								search.open = true;
							}}
						/>
					</combobox.root>
					<p class="keys" aria-hidden="true">
						<span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
						<span><kbd>enter</kbd> to go</span>
						<span><kbd>esc</kbd> to close</span>
					</p>
				</modal.content>
			</modal.backdrop>
		</modal.root>

		<style>
			.backdrop {
				position: fixed;
				inset: 0;
				z-index: 80;
				display: flex;
				justify-content: center;
				align-items: flex-start;
				padding: min(12vh, 6rem) var(--space-s) var(--space-s);
				background: color-mix(in oklch, var(--ink) 22%, transparent);
				backdrop-filter: blur(3px);

				html.dark & {
					background: rgb(0 0 0 / 0.5);
				}
			}

			.backdrop[hidden] {
				display: none;
			}

			.panel {
				box-sizing: border-box;
				display: flex;
				flex-direction: column;
				inline-size: min(40rem, 100%);
				max-block-size: min(36rem, 100%);
				background: color-mix(in oklch, var(--paper) 50%, white);
				color: var(--ink);
				border: 2px solid var(--ink);
				border-radius: 0.9rem 0.6rem 1rem 0.7rem / 0.7rem 1rem 0.6rem 0.9rem;
				box-shadow: 0.35rem 0.4rem 0 color-mix(in oklch, var(--ink) 20%, transparent);
				font-size: var(--step--1);
				outline: none;

				html.dark & {
					background: var(--raised);
					box-shadow: 0.35rem 0.4rem 0 rgb(0 0 0 / 0.45);
				}
			}

			.box {
				display: flex;
				flex-direction: column;
				min-block-size: 0;
				flex: 1;
			}

			.keys {
				display: flex;
				gap: 1.1rem;
				margin: 0;
				padding: 0.5rem 0.9rem;
				font-size: var(--step--2);
				color: color-mix(in oklch, var(--ink) 65%, transparent);
				border-top: 1px solid var(--code-edge);
			}

			kbd {
				display: inline-block;
				min-inline-size: 1.1em;
				margin-inline-end: 0.2rem;
				padding: 0 0.3rem;
				font: inherit;
				text-align: center;
				border: 1.5px solid color-mix(in oklch, var(--ink) 40%, transparent);
				border-radius: 0.3rem 0.4rem 0.35rem 0.3rem;
			}

			@media (max-width: 30rem) {
				.backdrop {
					padding: 0;
				}

				.panel {
					max-block-size: 100%;
					block-size: 100%;
					border-radius: 0;
					border-inline: 0;
				}

				.keys {
					display: none;
				}
			}
		</style>
	</div>
}

/**
 * The field and the hits under it. Its own component because only a component that reads the
 * combobox can repeat its options, and the hits are state its handlers write, never a computed:
 * a computed here would be worked out again whenever another island on the page wakes.
 */
function SearchBox({ onOpen }: { readonly onOpen: () => void }) @{
	const box = combobox.state();
	const view = state({
		query: '',
		rows: [] as readonly SearchRow[],
		idle: true,
		waiting: false,
		failed: false,
		nothing: false,
	});

	<div class="search">
		<button
			type="button"
			hidden
			tabindex={-1}
			aria-hidden="true"
			data-docs-search-open=""
			onClick={() => {
				onOpen();
				box.value = '';
				const field = box.inputEl;
				field?.focus();
				// A write after the dispatch has ended never lands, so the load's outcome is handed to the field's own input handler.
				const settle = () => field?.dispatchEvent(new Event('input', { bubbles: true }));
				loadSearchIndex().then(settle, settle);
			}}
		>Open search</button>
		<div
			class="field"
			onInput={(event) => {
				const field = event.target as HTMLInputElement;
				// A keystroke after a failed load tries again; the settle event it sends is not trusted, so this never loops.
				const retry = event.isTrusted && !cachedSearchIndex() && searchIndexFailed();
				const next = searchView(cachedSearchIndex(), field.value, searchIndexFailed() && !retry);
				view.query = next.query;
				view.rows = next.rows;
				view.idle = next.idle;
				view.waiting = next.waiting;
				view.failed = next.failed;
				view.nothing = next.nothing;
				if (retry) {
					const settle = () => field.dispatchEvent(new Event('input', { bubbles: true }));
					loadSearchIndex().then(settle, settle);
				}
			}}
		>
			<combobox.label class="lens">
				<InkLogo mark="magnifier" />
				<span class="label-text">Search the docs</span>
			</combobox.label>
			<combobox.input class="input" spellcheck={false} />
			<modal.close class="close" aria-label="Close search">esc</modal.close>
		</div>
		<combobox.content class="results">
			<p role="presentation" class="hint" hidden={!view.idle}>Type a word, a function name or an error code.</p>
			<p role="presentation" class="hint" hidden={!view.waiting}>Opening the index…</p>
			<p role="presentation" class="hint" hidden={!view.failed}>The search index did not load. Type again to retry.</p>
			@for (const hit of view.rows; key hit.key) {
				<combobox.item value={hit.value} label={hit.title} class="hit" ui-first={hit.first}>
					<span class="page" hidden={!hit.first}>
						<span class="section">{hit.section}</span>
						<span class="title">{hit.page}</span>
					</span>
					<combobox.itemlabel class="heading">{hit.title}</combobox.itemlabel>
					<span class="snippet">{hit.snippet.before}<mark>{hit.snippet.match}</mark>{hit.snippet.after}</span>
				</combobox.item>
			}
			<div role="presentation" class="empty" hidden={!view.nothing}>
				<NothingFound />
				<p role="presentation">Nothing in the docs matches “{view.query}”.</p>
			</div>
		</combobox.content>
		<style>
			.search {
				display: flex;
				flex-direction: column;
				min-block-size: 0;
				flex: 1;
			}

			.field {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				padding: 0.7rem 0.9rem;
				border-bottom: 2px dashed color-mix(in oklch, var(--ink) 35%, transparent);
			}

			.lens {
				display: inline-flex;
				font-size: 1.5rem;
				color: var(--ink);
			}

			.label-text {
				position: absolute;
				inline-size: 1px;
				block-size: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			.input {
				flex: 1;
				min-inline-size: 0;
				padding: 0.35rem 0.2rem;
				font: inherit;
				font-size: var(--step-0);
				color: var(--ink);
				background: none;
				border: 0;
				outline: none;
			}

			.input::placeholder {
				color: color-mix(in oklch, var(--ink) 50%, transparent);
			}

			.close {
				padding: 0.15rem 0.5rem;
				font: inherit;
				font-size: var(--step--2);
				color: var(--ink);
				background: none;
				border: 1.5px solid color-mix(in oklch, var(--ink) 45%, transparent);
				border-radius: 0.35rem 0.5rem 0.4rem 0.45rem;
				cursor: pointer;
			}

			.close:hover {
				background: color-mix(in oklch, var(--ink) var(--hover-wash), transparent);
			}

			.close:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}

			.results {
				overflow-y: auto;
				overscroll-behavior: contain;
				padding: 0.4rem 0.5rem 0.6rem;
				min-block-size: 0;
				flex: 1;
			}

			.hint {
				margin: 0.6rem 0.5rem;
				color: color-mix(in oklch, var(--ink) 65%, transparent);
			}

			[hidden] {
				display: none !important;
			}

			.hit[ui-first] {
				margin-block-start: 0.6rem;
			}

			.page {
				display: flex;
				gap: 0.45rem;
				align-items: baseline;
				margin-block-end: 0.15rem;
				font-size: var(--step--2);
			}

			.section {
				color: color-mix(in oklch, var(--ink) 60%, transparent);
				text-transform: uppercase;
				letter-spacing: 0.06em;
			}

			.title {
				font-weight: 700;
			}

			.hit {
				display: block;
				padding: 0.45rem 0.6rem;
				border-radius: 0.5rem 0.7rem 0.55rem 0.65rem;
				cursor: pointer;
			}

			.hit[ui-highlighted] {
				background: var(--tinted);
				box-shadow: inset 0.2rem 0 0 var(--pink);
			}

			.heading {
				display: block;
				font-weight: 600;
			}

			.snippet {
				display: -webkit-box;
				-webkit-line-clamp: 2;
				-webkit-box-orient: vertical;
				overflow: hidden;
				font-size: var(--step--2);
				line-height: 1.45;
				color: color-mix(in oklch, var(--ink) 75%, transparent);
			}

			mark {
				color: var(--ink);
				background: var(--mark);
				border-radius: 0.2em;
				box-decoration-break: clone;
			}

			.empty {
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 0.4rem;
				padding: 1rem 0.5rem 1.4rem;
				text-align: center;
				color: color-mix(in oklch, var(--ink) 75%, transparent);
			}

			.empty p {
				margin: 0;
			}
		</style>
	</div>
}
