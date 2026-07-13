import { computed } from '@markless/core';
import { loadCard } from './data.mjs';

export default function StreamingPage({ scenario }: { scenario: 'staggered' | 'all-fast' }) @{
	const card0 = computed(async () => loadCard(scenario, 0));
	const card1 = computed(async () => loadCard(scenario, 1));
	const card2 = computed(async () => loadCard(scenario, 2));
	const card3 = computed(async () => loadCard(scenario, 3));
	const card4 = computed(async () => loadCard(scenario, 4));
	const card5 = computed(async () => loadCard(scenario, 5));
	const card6 = computed(async () => loadCard(scenario, 6));
	const card7 = computed(async () => loadCard(scenario, 7));
	const card8 = computed(async () => loadCard(scenario, 8));
	const card9 = computed(async () => loadCard(scenario, 9));

	<div class="site" data-stream-shell>
		<header class="masthead">
			<h1>Markless Supply</h1>
			<p>Production streaming SSR benchmark</p>
			<nav><a href="/new">New</a><a href="/gear">Gear</a><a href="/field">Field</a><a href="/parts">Parts</a><a href="/labs">Labs</a><a href="/journal">Journal</a><a href="/stores">Stores</a><a href="/help">Help</a></nav>
		</header>
		<section class="hero">
			<h2>Ten cards, one response</h2>
			<p>Each card resolves from a deterministic data schedule.</p>
			<div class="stats"><div><strong>10</strong><span>boundaries</span></div><div><strong>50</strong><span>shell elements</span></div><div><strong>20</strong><span>elements per card</span></div></div>
		</section>
		<main class="grid">
			<section class="card-slot">@try {
				<article class="card" data-stream-card="0"><h3>{card0.title}</h3><p>{card0.subtitle}</p><ul>@for (const item of card0.items; key item.label) { <li><span>{item.label}</span><strong>{item.value}</strong></li> }</ul><footer><span>{card0.tag}</span><small>{card0.note}</small></footer></article>
			} @pending { <div class="skeleton" data-card-skeleton="0"><div></div><div></div><div></div></div> } @catch { <p>Card failed</p> }</section>
			<section class="card-slot">@try {
				<article class="card" data-stream-card="1"><h3>{card1.title}</h3><p>{card1.subtitle}</p><ul>@for (const item of card1.items; key item.label) { <li><span>{item.label}</span><strong>{item.value}</strong></li> }</ul><footer><span>{card1.tag}</span><small>{card1.note}</small></footer></article>
			} @pending { <div class="skeleton" data-card-skeleton="1"><div></div><div></div><div></div></div> } @catch { <p>Card failed</p> }</section>
			<section class="card-slot">@try {
				<article class="card" data-stream-card="2"><h3>{card2.title}</h3><p>{card2.subtitle}</p><ul>@for (const item of card2.items; key item.label) { <li><span>{item.label}</span><strong>{item.value}</strong></li> }</ul><footer><span>{card2.tag}</span><small>{card2.note}</small></footer></article>
			} @pending { <div class="skeleton" data-card-skeleton="2"><div></div><div></div><div></div></div> } @catch { <p>Card failed</p> }</section>
			<section class="card-slot">@try {
				<article class="card" data-stream-card="3"><h3>{card3.title}</h3><p>{card3.subtitle}</p><ul>@for (const item of card3.items; key item.label) { <li><span>{item.label}</span><strong>{item.value}</strong></li> }</ul><footer><span>{card3.tag}</span><small>{card3.note}</small></footer></article>
			} @pending { <div class="skeleton" data-card-skeleton="3"><div></div><div></div><div></div></div> } @catch { <p>Card failed</p> }</section>
			<section class="card-slot">@try {
				<article class="card" data-stream-card="4"><h3>{card4.title}</h3><p>{card4.subtitle}</p><ul>@for (const item of card4.items; key item.label) { <li><span>{item.label}</span><strong>{item.value}</strong></li> }</ul><footer><span>{card4.tag}</span><small>{card4.note}</small></footer></article>
			} @pending { <div class="skeleton" data-card-skeleton="4"><div></div><div></div><div></div></div> } @catch { <p>Card failed</p> }</section>
			<section class="card-slot">@try {
				<article class="card" data-stream-card="5"><h3>{card5.title}</h3><p>{card5.subtitle}</p><ul>@for (const item of card5.items; key item.label) { <li><span>{item.label}</span><strong>{item.value}</strong></li> }</ul><footer><span>{card5.tag}</span><small>{card5.note}</small></footer></article>
			} @pending { <div class="skeleton" data-card-skeleton="5"><div></div><div></div><div></div></div> } @catch { <p>Card failed</p> }</section>
			<section class="card-slot">@try {
				<article class="card" data-stream-card="6"><h3>{card6.title}</h3><p>{card6.subtitle}</p><ul>@for (const item of card6.items; key item.label) { <li><span>{item.label}</span><strong>{item.value}</strong></li> }</ul><footer><span>{card6.tag}</span><small>{card6.note}</small></footer></article>
			} @pending { <div class="skeleton" data-card-skeleton="6"><div></div><div></div><div></div></div> } @catch { <p>Card failed</p> }</section>
			<section class="card-slot">@try {
				<article class="card" data-stream-card="7"><h3>{card7.title}</h3><p>{card7.subtitle}</p><ul>@for (const item of card7.items; key item.label) { <li><span>{item.label}</span><strong>{item.value}</strong></li> }</ul><footer><span>{card7.tag}</span><small>{card7.note}</small></footer></article>
			} @pending { <div class="skeleton" data-card-skeleton="7"><div></div><div></div><div></div></div> } @catch { <p>Card failed</p> }</section>
			<section class="card-slot">@try {
				<article class="card" data-stream-card="8"><h3>{card8.title}</h3><p>{card8.subtitle}</p><ul>@for (const item of card8.items; key item.label) { <li><span>{item.label}</span><strong>{item.value}</strong></li> }</ul><footer><span>{card8.tag}</span><small>{card8.note}</small></footer></article>
			} @pending { <div class="skeleton" data-card-skeleton="8"><div></div><div></div><div></div></div> } @catch { <p>Card failed</p> }</section>
			<section class="card-slot">@try {
				<article class="card" data-stream-card="9"><h3>{card9.title}</h3><p>{card9.subtitle}</p><ul>@for (const item of card9.items; key item.label) { <li><span>{item.label}</span><strong>{item.value}</strong></li> }</ul><footer><span>{card9.tag}</span><small>{card9.note}</small></footer></article>
			} @pending { <div class="skeleton" data-card-skeleton="9"><div></div><div></div><div></div></div> } @catch { <p>Card failed</p> }</section>
		</main>
		<footer><p>Markless streaming SSR lane</p></footer>
	</div>
}
