import { state } from '@markless/core';
export const TONE = 'loud';

export function Notice({ title }: { title: string }) @{
	<section data-notice><h2>{title}</h2><button data-go onClick={() => (globalThis as { noticeHits?: number }).noticeHits = ((globalThis as { noticeHits?: number }).noticeHits ?? 0) + 1}>go</button></section>
}

export function Glyph({ size }: { size: number }) @{
	<svg data-glyph width={size} height={size}><path d="M0 0" /></svg>
}

export function Counter({ label }: { label: string }) @{
	let hits = state(0);
	<em data-counter onClick={() => (hits = hits + 1)}>{label}{hits}</em>
}
