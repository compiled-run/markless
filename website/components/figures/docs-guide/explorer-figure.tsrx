// The site's files beside its address bar: move state.mdx between folders, or rename it, and the address follows; drop it outside pages/ and it has no address at all.
import { computed, state } from '@markless/core';
import InkScreen from '../ink/ink-screen.tsrx';
import { addressOf, FOLDERS, NAMES } from './explorer.ts';

export default function DocsExplorerFigure() @{
	let folder = state('pages/concepts/');
	let name = state('state');
	let over = state('');
	let said = state('');
	const address = computed(() => addressOf(folder, name));
	const bar = computed(() => (address === '' ? 'no address' : address));
	const barClass = computed(() => (address === '' ? 'page none' : 'page'));
	const file = computed(() => name + '.mdx');
	const rowClass = (path: string) => (over === path ? 'folder over' : 'folder');
	const pagesClass = computed(() => rowClass('pages/'));
	const conceptsClass = computed(() => rowClass('pages/concepts/'));
	const componentsClass = computed(() => rowClass('components/'));

	const move = (to: string) => {
		folder = to;
		over = '';
		const at = addressOf(to, name);
		said = at === '' ? to + name + '.mdx is outside pages/, so it is not a page and has no address.' : to + name + '.mdx is served at ' + at + '.';
	};
	const rename = () => {
		name = NAMES[(NAMES.indexOf(name) + 1) % NAMES.length]!;
		const at = addressOf(folder, name);
		said = 'Renamed to ' + name + '.mdx. ' + (at === '' ? 'Still no address.' : 'The address is now ' + at + '.');
	};

	<figure
		class="docs-explorer"
		onKeyDown={(event) => {
			if (event.key !== 'Escape') return;
			folder = 'pages/concepts/';
			name = 'state';
			said = 'Back at pages/concepts/state.mdx.';
		}}
	>
		<InkScreen url="website/" label="The site's files">
			<div
				class="tree"
				onDragOver={(event) => {
					const row = (event.target as Element).closest('[data-folder]');
					if (!row) return;
					event.preventDefault();
					over = row.getAttribute('data-folder') ?? '';
				}}
				onDragLeave={() => {
					over = '';
				}}
				onDrop={(event) => {
					const row = (event.target as Element).closest('[data-folder]');
					if (!row) return;
					event.preventDefault();
					move(row.getAttribute('data-folder') ?? folder);
				}}
			>
				<button type="button" class={pagesClass} data-folder="pages/" onClick={() => move('pages/')}>
					<span class="name">▾ pages/</span>
					<span class="hint">move here</span>
				</button>
				@if (folder === 'pages/') {
					<button type="button" class="file" draggable="true" onClick={() => rename()}>
						<span class="name">{file}</span>
						<span class="hint">rename, or drag</span>
					</button>
				}
				<button type="button" class={conceptsClass} data-folder="pages/concepts/" onClick={() => move('pages/concepts/')}>
					<span class="name sub">▾ concepts/</span>
					<span class="hint">move here</span>
				</button>
				@if (folder === 'pages/concepts/') {
					<button type="button" class="file deep" draggable="true" onClick={() => rename()}>
						<span class="name">{file}</span>
						<span class="hint">rename, or drag</span>
					</button>
				}
				<button type="button" class={componentsClass} data-folder="components/" onClick={() => move('components/')}>
					<span class="name">▾ components/</span>
					<span class="hint">move here</span>
				</button>
				@if (folder === 'components/') {
					<button type="button" class="file" draggable="true" onClick={() => rename()}>
						<span class="name">{file}</span>
						<span class="hint">rename, or drag</span>
					</button>
				}
			</div>
		</InkScreen>
		<div class="browser">
			<InkScreen url={bar} label="The address it is served at">
				<div class={barClass}>
					<p class="path">{address === '' ? 'not a page' : address}</p>
				</div>
			</InkScreen>
		</div>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.docs-explorer {
				display: grid;
				gap: 0 1rem;
				margin: var(--space-m) 0;
				container-type: inline-size;

				@container (min-width: 560px) {
					grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
					align-items: start;
				}
			}

			.tree {
				display: grid;
				gap: 0.15rem;
				padding: 0.5rem 0.8rem 0.9rem;
			}

			.folder,
			.file {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				width: 100%;
				padding: 0.15rem 0.5rem;
				border: 0;
				border-radius: 6px;
				background: none;
				color: inherit;
				text-align: left;
				cursor: pointer;
				transition: background 160ms ease, transform 160ms ease;
			}

			.name {
				font-family: var(--font-mono);
				font-size: 0.92rem;
			}

			.folder .name {
				font-weight: 700;
			}

			.sub {
				padding-left: 1.1rem;
			}

			.file {
				padding-left: 1.6rem;
				cursor: grab;
			}

			.file.deep {
				padding-left: 2.7rem;
			}

			.file .name {
				background: color-mix(in oklch, var(--yellow) 32%, transparent);
				padding: 0 0.3rem;
				border-radius: 4px;
			}

			.folder:hover,
			.folder:focus-visible,
			.folder.over,
			.file:hover,
			.file:focus-visible {
				background: color-mix(in oklch, var(--ink) 8%, transparent);
				transform: translateX(3px);
			}

			.folder.over {
				outline: 2px dashed currentColor;
			}

			.folder:focus-visible,
			.file:focus-visible {
				outline: 2px dashed currentColor;
				outline-offset: 1px;
			}

			.hint {
				margin-left: auto;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 0.8rem;
				letter-spacing: 0.06em;
				opacity: 0;
				transition: opacity 160ms ease;
			}

			.folder:hover .hint,
			.folder:focus-visible .hint,
			.file:hover .hint,
			.file:focus-visible .hint {
				opacity: 0.75;
			}

			.page {
				padding: 0.8rem 1rem 1.2rem;
			}

			.path {
				margin: 0;
				font-family: var(--font-mono);
				font-size: 1.05rem;
				font-weight: 700;
				transition: color 200ms ease;
			}

			.none .path {
				color: #cb2431;
				text-decoration: line-through;
				animation: shake 360ms ease-in-out;
			}

			@keyframes shake {
				25% {
					transform: translateX(-3px);
				}
				75% {
					transform: translateX(3px);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.docs-explorer * {
					animation: none !important;
					transition: none !important;
				}
			}

			.sr {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}
		</style>
	</figure>
}
