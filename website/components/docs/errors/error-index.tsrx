// The error codes as cards grouped by area, under a filter box that matches a code's title, name or summary; Markless's own internal checks sit folded at the end.
import { computed, state } from '@markless/core';
import { Link } from '@markless/core/router';
import Sidebar from '../sidebar.tsrx';
import SiteNavbar from '../navbar/site-navbar.tsrx';
import PageMeta from '../../page-meta.tsrx';
import { asset } from '../../../site-base.ts';
import { INK_MARKS } from '../ink-marks.ts';
import { errorIndex } from './errors-index.ts';

type Code = (typeof errorIndex.groups)[number]['codes'][number];

const READER = errorIndex.groups.filter((group) => group.area !== 'internal');
const INTERNAL = errorIndex.groups.find((group) => group.area === 'internal');
const INTERNAL_CODES: readonly Code[] = INTERNAL ? INTERNAL.codes : [];

/** One flat list, a heading row before each area's cards, so the page needs a single loop. */
const ROWS = READER.flatMap((group) => [
	{ key: 'area-' + group.area, head: true, area: group.area, label: group.label, icon: group.icon, blurb: group.blurb, count: group.codes.length, code: '', title: '', chip: '', words: '' },
	...group.codes.map((code) => ({ key: code.code, head: false, area: group.area, label: '', icon: group.icon, blurb: '', count: 0, code: code.code, title: code.title, chip: code.chip, words: code.words })),
]);

const matches = (words: string, needle: string) => needle === '' || words.includes(needle);

export default function ErrorIndex() @{
	const marks = asset(INK_MARKS) + '#';
	let query = state('');
	const needle = computed(() => query.trim().toLowerCase());
	const hidden = computed(() => '|' + ROWS.filter((row) => !row.head && !matches(row.words, needle)).map((row) => row.code).join('|') + '|' + INTERNAL_CODES.filter((code) => !matches(code.words, needle)).map((code) => code.code).join('|') + '|');
	const emptyAreas = computed(() => '|' + READER.filter((group) => !group.codes.some((code) => matches(code.words, needle))).map((group) => group.area).join('|') + '|');
	const internalShown = computed(() => INTERNAL_CODES.filter((code) => matches(code.words, needle)).length);
	let opened = state(false);
	const showInternal = computed(() => opened || (needle !== '' && internalShown > 0));
	const shown = computed(() => ROWS.filter((row) => !row.head && matches(row.words, needle)).length + internalShown);

	<div class="error-index">
		<SiteNavbar pathname="/errors" />
		<Sidebar pathname="/errors" />
		<h1>Error codes</h1>
		<PageMeta pathname="/errors" time="1 min" assumes="nothing" />
		<p class="summary">Every message Markless can print, grouped by what it is about. Each card opens the code's page, with why it happens and how to fix it.</p>
		<p>
			<span>New to the format? Read </span>
			<Link href="/tooling/diagnostics">how to read a Markless error</Link>
			<span> first. The errors a </span>
			<code>@try</code>
			<span> block can stop the build with are listed on </span>
			<a href="/concepts/async#build-errors-inside-try">waiting</a>
			<span>.</span>
		</p>
		<div class="bar">
			<label class="filter">
				<span class="sr">Filter error codes</span>
				<input
					type="search"
					placeholder="Filter codes"
					value={query}
					onInput={(event) => {
						query = (event.target as HTMLInputElement).value;
					}}
					onKeyDown={(event) => {
						event.stopPropagation();
					}}
				/>
			</label>
			<nav class="areas" aria-label="Jump to an area">
				@for (const group of READER; key group.area) {
					<a class="area" href={'#' + group.area}>
						<svg viewBox="0 0 108 108" aria-hidden="true">
							<use href={marks + group.icon} />
						</svg>
						{group.label}
					</a>
				}
			</nav>
		</div>
		<p class="status" role="status">{needle === '' ? '' : shown === 0 ? 'No codes match.' : shown + (shown === 1 ? ' code matches.' : ' codes match.')}</p>
		<ul class="cards">
			@for (const row of ROWS; key row.key) {
				<li class={(row.head ? 'row head' : 'row card ink-card') + ((row.head ? emptyAreas : hidden).includes('|' + (row.head ? row.area : row.code) + '|') ? ' hidden' : '')} id={row.head ? row.area : row.code}>
					<svg class="mark" viewBox="0 0 108 108" aria-hidden="true">
						<use href={marks + row.icon} />
					</svg>
					<h2 class="area-title">{row.label}</h2>
					<p class="blurb">{row.blurb}</p>
					<a class="title" href={'/errors/' + row.code}>
						{row.title}
					</a>
					<p class="foot">
						<code class="code">{row.code}</code>
						<span class={'chip ' + row.chip}>{row.chip}</span>
					</p>
				</li>
			}
		</ul>
		<section class={'internal' + (internalShown === 0 ? ' hidden' : '')} aria-labelledby="internal-title">
			<div class="internal-head">
				<svg class="mark" viewBox="0 0 108 108" aria-hidden="true">
					<use href={marks + 'gear'} />
				</svg>
				<h2 class="area-title" id="internal-title">{INTERNAL ? INTERNAL.label : ''}</h2>
				<button
					type="button"
					class="toggle"
					aria-expanded={showInternal ? 'true' : 'false'}
					aria-controls="internal-cards"
					onClick={() => {
						opened = !showInternal;
					}}
				>
					{showInternal ? 'Hide' : 'Show all ' + internalShown}
				</button>
			</div>
			<p class="blurb">{INTERNAL ? INTERNAL.blurb : ''}</p>
			<ul class={'cards' + (showInternal ? '' : ' hidden')} id="internal-cards">
				@for (const code of INTERNAL_CODES; key code.code) {
					<li class={'row card ink-card' + (hidden.includes('|' + code.code + '|') ? ' hidden' : '')} id={code.code}>
						<a class="title" href={'/errors/' + code.code}>
							{code.title}
						</a>
						<p class="foot">
							<code class="code">{code.code}</code>
							<span class={'chip ' + code.chip}>{code.chip}</span>
						</p>
					</li>
				}
			</ul>
		</section>

		<style>
			.summary {
				max-width: 46ch;
				font-size: var(--step-1);
				line-height: 135%;
			}

			.bar {
				position: sticky;
				top: var(--header-height);
				z-index: 5;
				display: flex;
				flex-wrap: wrap;
				gap: 0.5rem 0.9rem;
				align-items: center;
				margin-top: var(--space-m);
				padding: 0.6rem 0 0.7rem;
				background: var(--paper);
				border-bottom: 1.5px solid var(--ink);
			}

			.filter input {
				box-sizing: border-box;
				width: 15rem;
				max-width: 100%;
				padding: 0.35em 0.65em;
				border: 1.5px solid var(--ink);
				border-radius: 8px 11px 9px 10px;
				background: transparent;
				color: var(--ink);
				font: inherit;
			}

			.filter input::placeholder {
				color: color-mix(in oklch, var(--ink) 50%, transparent);
			}

			.areas {
				display: flex;
				flex-wrap: wrap;
				gap: 0.2rem 0.8rem;
			}

			.area {
				display: inline-flex;
				gap: 0.3rem;
				align-items: center;
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 1.02rem;
				letter-spacing: 0.03em;
				text-decoration: none;
			}

			.area svg {
				width: 1.3rem;
				height: 1.3rem;
				overflow: visible;
			}

			.area:hover,
			.area:focus-visible {
				text-decoration: underline;
				text-decoration-color: var(--pink);
				text-decoration-thickness: 0.15em;
			}

			.status {
				min-height: 1.5em;
				margin: 0.4rem 0 0;
				color: color-mix(in oklch, var(--ink) 70%, transparent);
			}

			.cards {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(min(100%, 15.5rem), 1fr));
				gap: var(--space-s);
				margin: var(--space-xs) 0 0;
				padding: 0;
				list-style: none;
			}

			.row {
				margin: 0;
				scroll-margin-top: 7rem;
			}

			.head {
				grid-column: 1 / -1;
				display: grid;
				grid-template-columns: auto 1fr;
				gap: 0 0.7rem;
				align-items: center;
				margin-top: var(--space-m);
			}

			.head .mark {
				grid-row: span 2;
				width: 2.4rem;
				height: 2.4rem;
				overflow: visible;
			}

			.head .title,
			.head .foot,
			.card .mark,
			.card .area-title,
			.card .blurb {
				display: none;
			}

			.area-title {
				margin: 0;
				font-size: var(--step-2);
			}

			.blurb {
				margin: 0;
				color: color-mix(in oklch, var(--ink) 75%, transparent);
			}

			.card {
				position: relative;
				display: flex;
				flex-direction: column;
				gap: 0.4rem;
				padding: 0.9rem 1rem;
			}

			.title {
				color: var(--ink);
				font-weight: 700;
				line-height: 1.35;
				text-decoration: none;
			}

			.title::after {
				content: '';
				position: absolute;
				inset: 0;
			}

			.card:hover .title,
			.title:focus-visible {
				text-decoration: underline;
				text-decoration-color: var(--pink);
				text-decoration-thickness: 0.12em;
				text-underline-offset: 0.16em;
			}

			.foot {
				display: flex;
				flex-wrap: wrap;
				gap: 0.3rem 0.5rem;
				align-items: center;
				margin: auto 0 0;
			}

			.code {
				font-family: var(--font-mono);
				font-size: 0.74rem;
				overflow-wrap: anywhere;
				background: none;
				padding: 0;
				color: color-mix(in oklch, var(--ink) 72%, transparent);
			}

			.chip {
				padding: 0 0.45em;
				border: 1.5px solid currentColor;
				border-radius: 5px 7px 6px 8px;
				font: 600 0.8rem/1.5 'Joy Elia', system-ui, sans-serif;
				letter-spacing: 0.05em;
			}

			.chip.error {
				color: color-mix(in oklch, var(--pink) 55%, var(--ink));
			}

			.internal {
				margin-top: var(--space-l);
				padding-top: var(--space-s);
				border-top: 2px dashed var(--code-edge);
			}

			.internal-head {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4rem 0.7rem;
				align-items: center;
			}

			.toggle {
				padding: 0.15em 0.7em;
				border: 1.5px solid var(--ink);
				border-radius: 8px 11px 9px 10px;
				background: transparent;
				color: var(--ink);
				font: 600 0.95rem/1.4 'Joy Elia', system-ui, sans-serif;
				letter-spacing: 0.04em;
				cursor: pointer;
			}

			.toggle:hover {
				background: color-mix(in oklch, var(--pink) 25%, transparent);
			}

			.internal-head .mark {
				width: 2.4rem;
				height: 2.4rem;
				overflow: visible;
			}

			.internal .blurb {
				margin-top: 0.4rem;
			}

			.hidden {
				display: none;
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
	</div>;
}
