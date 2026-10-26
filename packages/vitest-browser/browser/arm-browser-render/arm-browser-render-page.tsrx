import { state } from '@markless/core';
import { Counter, Glyph, Notice } from './parts.tsrx';

function LocalNotice({ title }: { title: string }) @{
	<section data-local><h2>{title}</h2><button data-local-go onClick={() => (globalThis as { localHits?: number }).localHits = ((globalThis as { localHits?: number }).localHits ?? 0) + 1}>go</button></section>
}

function LocalGlyph({ size }: { size: number }) @{
	<svg data-local-glyph width={size} height={size}><path d="M0 0" /></svg>
}

export default function ArmBrowserRenderPage() @{
	let open = state(false);
	<main>
		<button data-toggle onClick={() => (open = !open)}>toggle</button>
		<div id="local">@if (open) { <LocalNotice title="Local" /> } @else { <i>closed</i> }</div>
		<div id="local-glyph">@if (open) { <LocalGlyph size={12} /> }</div>
		<div id="imported">@if (open) { <Notice title="Imported" /> } @else { <i>closed</i> }</div>
		<div id="counter">@if (open) { <Counter label="n" /> }</div>
		<div id="imported-glyph">@if (open) { <Glyph size={12} /> }</div>
	</main>
}
