// The dev overlay a Markless app shows for a list with no key, beside the file: add the key and the overlay clears to the list; key by index and the editor warns instead, quiet only with a markless-allow reason.
import { computed, state } from '@markless/core';
import InkScreen from '../ink/ink-screen.tsrx';
import { ALLOW, ERROR, FOR, ITEMS, WARN } from './overlay.ts';

export default function OverlayFigure() @{
	let key = state('none');
	let allow = state('');
	let said = state('');
	let tip = state('');
	const header = computed(() => (key === 'keyed' ? FOR.keyed : key === 'index' ? FOR.index : FOR.none));
	const comment = computed(() => (key === 'index' ? (allow === 'reason' ? ALLOW.reason : allow === 'bare' ? ALLOW.bare : '') : ''));
	const broken = computed(() => key === 'none');
	const warning = computed(() => (key !== 'index' ? '' : allow === 'reason' ? '' : allow === 'bare' ? 'bare' : 'index'));
	const headerClass = computed(() => (key === 'none' ? 'src hot error' : warning === 'index' ? 'src hot warn' : 'src hot'));
	const commentClass = computed(() => (comment === '' ? 'src comment gone' : warning === 'bare' ? 'src comment warn' : 'src comment'));
	const pageClass = computed(() => (broken ? 'page broken' : 'page fine'));
	const problems = computed(() => (warning === 'index' ? '⚠ ' + WARN.index.code + ': ' + WARN.index.message : warning === 'bare' ? '⚠ ' + WARN.reason.code + ': ' + WARN.reason.message + '  ·  ⚠ ' + WARN.index.code : key === 'index' ? 'No problems: the warning is silenced, with a reason.' : key === 'keyed' ? 'No problems.' : '✕ ' + ERROR.code));
	const problemsClass = computed(() => (warning !== '' ? 'problems warn' : key === 'none' ? 'problems error' : 'problems ok'));
	const commentText = computed(() => '\t\t\t' + comment);
	const hidden = computed(() => (broken ? 'false' : 'true'));
	const editNone = computed(() => (key === 'none' ? 'edit on' : 'edit'));
	const editKeyed = computed(() => (key === 'keyed' ? 'edit on' : 'edit'));
	const editIndex = computed(() => (key === 'index' ? 'edit on' : 'edit'));
	const editAllow = computed(() => (allow === '' ? 'edit' : 'edit on'));
	const caption = computed(() => (tip === '' ? 'Edit the @for line, or hover the error code.' : tip));
	const n8 = computed(() => (comment === '' ? '8' : '9'));

	const setKey = (to: string) => {
		if (to !== 'index') allow = '';
		key = to;
		said = to === 'keyed' ? 'Added ; key item. The overlay is gone and the list renders.' : to === 'index' ? 'Keyed by index. The page renders, and the editor warns: ' + WARN.index.code + '.' : 'No key. The page shows the ' + ERROR.code + ' overlay.';
	};
	const cycleAllow = () => {
		if (key !== 'index') setKey('index');
		allow = allow === '' ? 'reason' : allow === 'reason' ? 'bare' : '';
		said = allow === 'reason' ? 'markless-allow with a reason: the warning is silenced.' : allow === 'bare' ? 'markless-allow with no reason: ' + WARN.reason.code + ', and the warning stays.' : 'The comment is gone; the warning is back.';
	};

	<figure
		class="overlay-toy"
		tabindex={0}
		aria-label="A list file beside its page in the dev server. Press 1 for no key, 2 for key item, 3 for key by index, A to cycle a markless-allow comment. Escape resets."
		onKeyDown={(event) => {
			if (event.key === '1') setKey('none');
			else if (event.key === '2') setKey('keyed');
			else if (event.key === '3') setKey('index');
			else if (event.key === 'a' || event.key === 'A') cycleAllow();
			else if (event.key === 'Escape') {
				key = 'none';
				allow = '';
				said = 'Back to the list with no key.';
			}
		}}
	>
		<InkScreen url="pages/list.tsrx" label="The list file">
			<div class="editor">
				<p class="src">
					<span class="n">6</span>
					{'\t<section>'}
				</p>
				<p class="src">
					<span class="n">7</span>
					{'\t\t<ul>'}
				</p>
				<p class={commentClass}>
					<span class="n">8</span>
					{commentText}
				</p>
				<p class={headerClass}>
					<span class="n">{n8}</span>
					{'\t\t\t'}
					<span class="code">{header}</span>
				</p>
				<p class="src">
					<span class="n" />
					{'\t\t\t\t<li>{item}</li>'}
				</p>
				<p class={problemsClass}>{problems}</p>
				<p class="edits" role="group" aria-label="Edit the @for line">
					<button type="button" class={editNone} onClick={() => setKey('none')}>
						no key
					</button>
					<button type="button" class={editKeyed} onClick={() => setKey('keyed')}>
						; key item
					</button>
					<button type="button" class={editIndex} onClick={() => setKey('index')}>
						; index i; key i
					</button>
					<button type="button" class={editAllow} onClick={() => cycleAllow()}>
						markless-allow
					</button>
				</p>
			</div>
		</InkScreen>
		<InkScreen url="localhost:3000/list" label="The page in the dev server">
			<div class={pageClass}>
				<div class="list">
					<ul>
						<li>{ITEMS[0]}</li>
						<li>{ITEMS[1]}</li>
					</ul>
				</div>
				<div class="dev-overlay" aria-hidden={hidden}>
					<div class="panel">
						<span
							class="badge"
							onPointerEnter={() => {
								tip = ERROR.docs;
							}}
							onPointerLeave={() => {
								tip = '';
							}}
						>
							{ERROR.code}
						</span>
						<p class="h1">{ERROR.message}</p>
						<p class="location">{ERROR.location}</p>
						<p class="h2">Why</p>
						<p class="p">{ERROR.why}</p>
						<p class="h2">Suggested fix</p>
						<p class="p">{ERROR.fix}</p>
						<pre class="frame">{ERROR.frame}</pre>
						<a class="docs" href="/errors/MARKLESS_REPEAT_KEY_REQUIRED">Read {ERROR.code} documentation</a>
					</div>
				</div>
			</div>
		</InkScreen>
		<p class="caption">{caption}</p>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.overlay-toy {
				margin: var(--space-m) 0;
				border-radius: 12px;
			}

			.overlay-toy:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.editor {
				padding: 0.5rem 0.6rem 0.8rem;
			}

			.src {
				display: block;
				margin: 0;
				padding: 0 0.3rem;
				font-family: var(--font-mono);
				font-size: 0.78rem;
				line-height: 1.6;
				white-space: pre;
				tab-size: 2;
				border-radius: 4px;
				transition: background 160ms ease;
			}

			.n {
				display: inline-block;
				width: 1.4rem;
				margin-right: 0.6rem;
				text-align: right;
				opacity: 0.45;
			}

			.comment {
				opacity: 0.7;
			}

			.comment.gone {
				display: none;
			}

			.error .code {
				text-decoration: underline wavy #cb2431;
				text-underline-offset: 4px;
			}

			.warn .code,
			.comment.warn {
				text-decoration: underline wavy oklch(70% 0.14 75);
				text-underline-offset: 4px;
			}

			.src:hover {
				background: color-mix(in oklch, var(--yellow) 25%, transparent);
			}

			.problems {
				margin: 0.5rem 0 0;
				padding: 0.3rem 0.5rem;
				border-top: 1.5px solid color-mix(in oklch, currentColor 30%, transparent);
				font-family: var(--font-mono);
				font-size: 0.72rem;
				line-height: 1.5;
			}

			.problems.error {
				color: #cb2431;
			}

			.problems.warn {
				color: oklch(55% 0.13 70);
			}

			.problems.ok {
				opacity: 0.7;
			}

			.edits {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4rem;
				margin: 0.6rem 0 0;
			}

			.edit {
				padding: 0.15rem 0.6rem 0.2rem;
				border: 1.5px solid currentColor;
				border-radius: 12px 16px 10px 14px / 14px 10px 16px 12px;
				background: transparent;
				color: inherit;
				font-family: var(--font-mono);
				font-size: 0.78rem;
				cursor: pointer;
				box-shadow: 1px 2px 0 currentColor;
				transition: background 160ms ease, transform 120ms ease;
			}

			.edit:hover {
				background: color-mix(in oklch, var(--pink) 25%, transparent);
				transform: translateY(-1px);
			}

			.edit.on {
				background: color-mix(in oklch, var(--pink) 70%, transparent);
				color: oklch(28% 0.015 90);
			}

			.edit:focus-visible {
				outline: 2px dashed currentColor;
				outline-offset: 2px;
			}

			.page {
				display: grid;
			}

			.page > * {
				grid-area: 1 / 1;
			}

			.list {
				padding: 1rem 1.4rem;
			}

			.list li,
			.panel .h1,
			.panel .h2,
			.panel .p,
			.panel .docs {
				font-family: system-ui, sans-serif;
			}

			.list li {
				font-size: 1rem;
			}

			.dev-overlay {
				padding: 0.6rem;
				background: color-mix(in srgb, white 94%, #b42318 6%);
				color: oklch(25% 0.01 90);
				font-family: system-ui, sans-serif;
				transition: opacity 300ms ease, transform 300ms ease;
			}

			.fine .dev-overlay {
				opacity: 0;
				transform: scale(0.97);
				pointer-events: none;
			}

			.panel {
				padding: 0.8rem 1rem;
				border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
				border-top: 4px solid #c9362b;
				border-radius: 0.5rem;
				background: white;
				box-shadow: 0 0.6rem 1.6rem #0002;
			}

			.badge {
				position: relative;
				display: inline-block;
				padding: 0.1rem 0.4rem;
				border-radius: 0.25rem;
				background: color-mix(in srgb, #c9362b 14%, white);
				color: #c9362b;
				font: 600 0.7rem ui-monospace, monospace;
				cursor: help;
			}

			.caption {
				margin: 0.2rem 0.4rem 0;
				min-height: 1.5em;
				font-family: var(--font-mono);
				font-size: 0.85rem;
				opacity: 0.8;
			}

			.h1 {
				margin: 0.4rem 0;
				font-size: 0.95rem;
				font-weight: 700;
				line-height: 1.3;
			}

			.h2 {
				margin: 0.5rem 0 0.1rem;
				font-size: 0.65rem;
				text-transform: uppercase;
				letter-spacing: 0.06em;
				opacity: 0.65;
			}

			.p {
				margin: 0;
				font-size: 0.78rem;
				line-height: 1.45;
			}

			.location {
				margin: 0;
				font: 500 0.75rem ui-monospace, monospace;
				color: LinkText;
			}

			.frame {
				margin: 0.5rem 0;
				padding: 0.5rem 0.6rem;
				overflow: auto;
				border-radius: 0.35rem;
				background: color-mix(in srgb, currentColor 7%, white);
				font: 0.7rem/1.5 ui-monospace, monospace;
				white-space: pre;
				tab-size: 1;
			}

			.docs {
				font-size: 0.78rem;
				color: LinkText;
			}

			@media (prefers-reduced-motion: reduce) {
				.overlay-toy * {
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
