import { computed, state } from '@markless/core';
import { accordion } from '@markless/ui';
import { scenarios, type Scenario } from './scenarios.ts';

export default function AccordionScene({ scenario }: { readonly scenario: Scenario }) @{
 const story = scenarios.find(item => item.id === scenario)!;
 const treatment = story.preferred;
 const entries = state(story.id === 'case-file' ? [...story.entries, { value: 'culprit', title: 'Name the culprit', text: '' }] : story.entries);
 const isCase = state(story.id === 'case-file');
 const multiple = story.id === 'road-trip';
 let selected = state<string | readonly string[]>(story.id === 'case-file' ? 'otto' : story.id === 'road-trip' ? ['nazare', 'porto'] : 'setup');
 let read = state<readonly string[]>(['otto']);
 let answer = state('');
 
 const visibleEntries = computed(() => {
  const source = entries;
  const alibis = read;
  return source.map(entry => ({ ...entry, locked: entry.value === 'culprit' && alibis.length < 4, read: alibis.includes(entry.value) }));
 });
 const sheet = story.id === 'case-file' ? 'case-portraits' : story.id === 'road-trip' ? 'roadtrip-art' : 'rulebook-art';
 const leftArt = story.id === 'rulebook' ? 1 : 0;
 const rightArt = story.id === 'road-trip' ? 2 : story.id === 'case-file' ? 3 : 0;
 <section class="scene" data-scene={story.id} data-treatment={treatment} aria-label={story.title}>
  <div class="product-bar"><span class="brand">{story.brand}</span><span class="product-tagline">{story.subtitle}</span><span class="edition">a little everyday adventure</span></div>
  <div class="composition">
   <header class="story-header"><h2>{story.title}</h2><p>{story.subtitle}</p></header>
   <aside class="decoration left" aria-hidden="true">
    <p class="scribble">{story.left}</p>
    <div class="large-sticker"><span class="art" data-sheet={sheet} data-index={leftArt}></span></div>
    <p class="paper-note">{story.id === 'road-trip' ? 'Portugal, sempre uma boa ideia ♡' : story.id === 'case-file' ? 'Good bread brings out the truth.' : 'Small things. Brighter days.'}</p>
    <div class="small-sticker" hidden={story.id === 'rulebook'}><span class="art" data-sheet={sheet} data-index={story.id === 'road-trip' ? 4 : 1}></span></div>
   </aside>
   <div class="story-body">
    <p class="sticky-caption">{story.note}</p>
    <p class="find-hint" hidden={story.id !== 'rulebook'}>⌕ Use <kbd>⌘ F</kbd> or <kbd>Ctrl F</kbd> to find <span class="search-term" role="img" aria-label="Search term: tie" data-search-term="tie"></span> in a closed section.</p>
    <accordion.root class="sections" multiple={multiple} collapsible value={selected} onChange={(value: string | readonly string[]) => {
     selected = value;
     if (isCase && typeof value === 'string' && value !== '' && value !== 'culprit' && !read.includes(value)) {
      read = [...read, value];
     }
    }}>
     @for (const entry of visibleEntries; key entry.value) {
      <accordion.item class="entry" value={entry.value} disabled={entry.locked}>
       <accordion.itemlabel class="entry-heading"><accordion.itemtrigger class="entry-trigger" data-example-trigger data-culprit-trigger={entry.value === 'culprit'}>
        <span class="portrait" hidden={story.id !== 'case-file' || entry.value === 'culprit'}><span class="art" data-sheet="case-portraits" data-index={entry.art} aria-hidden="true"></span></span>
        <span class="rule-icon" hidden={story.id !== 'rulebook'} aria-hidden="true">{entry.value === 'setup' ? '⚒' : entry.value === 'turn' ? '♧' : entry.value === 'scoring' ? '♜' : '✧'}</span>
        <span class="done" hidden={!entry.done} aria-label="Completed">✓</span>
        <span class="mystery-icon" hidden={entry.value !== 'culprit'} aria-hidden="true">?</span><span class="entry-copy"><span class="entry-title">{entry.title}</span><span class="recap" hidden={entry.value !== 'culprit'} role="status">{read.length} of 4 alibis read</span><span class="recap" hidden={!entry.recap}>{entry.recap ?? ''}</span></span>
        <span class="read-stamp" data-read-stamp={story.id === 'case-file' && entry.read} hidden={story.id !== 'case-file' || !entry.read}>READ</span>
        <span class="chevron" aria-hidden="true"></span>
       </accordion.itemtrigger></accordion.itemlabel>
       <accordion.itemcontent class="entry-panel" data-scoring={story.id === 'rulebook' && entry.value === 'scoring'}>
        <div class="panel-inner" hidden={entry.value === 'culprit'}>
         <div class="panel-copy">
          <p hidden={!entry.text}>{entry.text}</p>
          <dl class="itinerary" hidden={!entry.lines}>@for (const line of entry.lines ?? []; key line) { <div><dt>{line.split('|')[0]}</dt><dd>{line.split('|')[1]}</dd></div> }</dl>
         </div>
         <div class="postcard" hidden={story.id !== 'road-trip' || entry.art === undefined}><span class="art" data-sheet="roadtrip-art" data-index={entry.art} aria-hidden="true"></span></div>
        </div>
<div class="panel-inner verdict-panel" hidden={entry.value !== 'culprit'}><p>Who moved the starter?</p><div class="suspect-choices">@for (const suspect of story.entries; key suspect.value) { <button class="paper-button" type="button" aria-label={'Choose ' + suspect.title.split(',')[0]} onClick={() => { answer = suspect.value === 'bruno' ? 'Case closed! Bruno moved the starter behind the warm oven. Mystery solved; bread saved.' : 'A good theory, but the alibis point to someone with a black-and-white tail. Try again.'; }}>{suspect.title.split(',')[0]}</button> }</div><p role="status">{answer}</p></div>
       </accordion.itemcontent>
      </accordion.item>
     }
    </accordion.root>
   </div>
   <aside class="decoration right" aria-hidden="true">
    <p class="paper-note">{story.right}</p>
    <div class="route-sticker" hidden={story.id !== 'road-trip'}><span class="art" data-sheet="roadtrip-art" data-index={1}></span></div>
    <div class="large-sticker"><span class="art" data-sheet={sheet} data-index={rightArt}></span></div>
    <div class="small-sticker"><span class="art" data-sheet={sheet} data-index={story.id === 'road-trip' ? 5 : story.id === 'rulebook' ? 2 : 1}></span></div>
   </aside>
  </div>
  <footer class="story-footer">{story.brand}<span>Good things take a little curiosity. ♡</span></footer>
  <style>
   .scene [hidden]:not([hidden='until-found']) { display:none!important; }
   .chevron { width:14px!important; height:14px!important; border-right:2px solid currentColor; border-bottom:2px solid currentColor; transform:rotate(45deg); margin:0 5px 6px auto; }
   .entry-trigger[ui-open] .chevron { transform:rotate(225deg); margin-bottom:0; }

   .art { display:block; width:100%; height:100%; background-repeat:no-repeat; background-position:0 0; background-size:300% 200%; }
   .art[data-sheet='case-portraits'] { background-image:url('/markless/accordion-art/case-portraits.png'); background-size:400% 100%; }
   .art[data-sheet='rulebook-art'] { background-image:url('/markless/accordion-art/rulebook-art.png'); background-size:300% 100%; }
   .art[data-sheet='roadtrip-art'] { background-image:url('/markless/accordion-art/roadtrip-art.png'); }
   .art[data-index='1'],.art[data-index='4'] { background-position:50% 0; }.art[data-index='2'],.art[data-index='5'] { background-position:100% 0; }
   .art[data-index='3'] { background-position:0 100%; }.art[data-index='4'] { background-position:50% 100%; }.art[data-index='5'] { background-position:100% 100%; }
   .art[data-sheet='case-portraits'][data-index='1']{ background-position:33.333% 0; }.art[data-sheet='case-portraits'][data-index='2']{ background-position:66.667% 0; }.art[data-sheet='case-portraits'][data-index='3']{ background-position:100% 0; }

   .scene { --story-ink:#27232e; --story-paper:#faf4e8; --ink:var(--story-ink); --paper:var(--story-paper); color-scheme:light; --story-purple:#d7b9e1; --story-pink:#df77b0; box-sizing:border-box; position:relative; isolation:isolate; overflow:clip; width:100%; padding:26px 24px 20px; color:var(--story-ink); background-color:var(--story-paper); background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.76' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%237e694b' opacity='.1' filter='url(%23n)' d='M0 0h180v180H0z'/%3E%3C/svg%3E"); font:20px/1.5 'Shantell Sans',sans-serif; border:1px solid #82767d; }
   .scene * { box-sizing:border-box; font-family:inherit; }
   .product-bar { display:flex; align-items:center; gap:30px; padding-bottom:15px; margin-bottom:30px; border-bottom:1px solid #615464; font-size:14px; }
   .brand { font:28px 'Joy Elia',serif; }.edition { margin-left:auto; font-size:12px; }.product-tagline { max-width:35ch; }
   .composition { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,4.7fr) minmax(0,1fr); gap:0 26px; }
   .story-header { grid-column:2; padding:0 0 28px; text-align:center; }
   .scene h2 { margin:0 0 12px; padding:0; font:700 clamp(30px,3.4vw,54px)/1.13 'Joy Elia',serif; letter-spacing:-.025em; border:0; color:var(--story-ink); text-shadow:3px 4px 0 var(--story-purple); }
   .scene p { margin:0; font:inherit; line-height:1.5; }.story-header p { font-size:19px; }
   .story-body { grid-column:2; grid-row:2; min-width:0; }.decoration { grid-row:2; min-width:0; display:flex; flex-direction:column; align-items:center; gap:20px; }.left { grid-column:1; }.right { grid-column:3; }
   .scribble { max-width:13ch; transform:rotate(-7deg); text-align:center; }.paper-note { max-width:16ch; padding:18px 13px; background:#efdaeb; box-shadow:2px 4px 3px #61524b18; transform:rotate(6deg); text-align:center; font-size:18px!important; }
   .large-sticker { width:140%; aspect-ratio:1; }.small-sticker { width:85%; aspect-ratio:1; }.route-sticker { width:110%; aspect-ratio:1; }.doodle { font-size:130px; color:#d4a332; }
   .sticky-caption { display:none; }.sections { display:grid; gap:10px; }.entry { min-width:0; background:#faf6ecdd; border:1.5px solid #4c424d; border-radius:3px; box-shadow:5px 5px 0 #d5bce0; }.entry-heading { margin:0!important; padding:0!important; font:inherit!important; text-shadow:none!important; }
   .entry-trigger { display:flex; align-items:center; gap:16px; width:100%; min-height:64px; padding:14px 20px; border:0; background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer; border-radius:inherit; }
   .entry-trigger:hover { background:#e4d3e43d; }.entry-trigger:focus-visible { outline:3px solid #8b4c9f; outline-offset:4px; }.entry-trigger:disabled { color:#696572; background:#d8d5d84a; cursor:not-allowed; }
   .entry-copy { flex:1; min-width:0; }.entry-title { font-weight:600; padding:0 4px; box-decoration-break:clone; -webkit-box-decoration-break:clone; }.entry-trigger[ui-open] .entry-title { background:#ffe887; border-radius:10% 14% 11% 8%; box-shadow:4px 0 0 #ffe887,-4px 0 0 #ffe887; }
   .recap { display:block; margin-top:2px; font-size:.82em; font-weight:400; }.chevron { margin-left:auto; flex:none; }
   .entry-panel[ui-open] { border-top:1px solid #51445066; }.panel-inner { display:flex; align-items:center; gap:20px; padding:22px 24px; }.panel-copy { flex:1; min-width:0; }.panel-copy p { white-space:pre-line; }.entry-panel[hidden='until-found'] { content-visibility:hidden; height:0; }.entry-panel[hidden=''] { display:none; }
   .portrait { width:68px; height:76px; flex:none; margin:-16px 2px -14px -4px; }.read-stamp { border:3px solid var(--story-pink); border-radius:3px; padding:0 6px; color:#ba397d; font:bold 19px/1.3 'Shantell Sans',sans-serif; transform:rotate(-10deg); }.mystery-icon { font:44px 'Joy Elia',serif; width:68px; text-align:center; }.verdict-panel { display:grid; }.suspect-choices { display:flex; flex-wrap:wrap; gap:10px; }
   .paper-button { padding:10px 16px; border:1.5px solid #3b3041; border-radius:3px; box-shadow:4px 4px 0 #d7b9e1; background:#fcf5e6; color:#292330; font:inherit; cursor:pointer; }.paper-button:hover { background:#fff0ac; }.paper-button:focus-visible { outline:3px solid #8b4c9f; outline-offset:4px; }
   .find-hint { display:flex; align-items:center; flex-wrap:wrap; gap:7px; padding:9px 14px; margin-bottom:20px!important; border:1px solid #76647e; border-radius:5px; background:#fff9ef; font-size:13px!important; }.search-term::before { content:attr(data-search-term); }.find-hint svg { width:18px; height:18px; }kbd { font:inherit; padding:1px 4px; border:1px solid #a197a0; border-radius:3px; }.rule-icon { display:inline-flex; align-items:center; justify-content:center; width:42px; height:42px; flex:none; font-size:34px; line-height:1; }.rule-icon svg { width:100%; height:100%; }.postcard { width:20%; max-width:180px; aspect-ratio:1; flex:none; transform:rotate(-4deg); }
   .done { color:#667357; font-size:30px; }.itinerary { margin:0; display:grid; gap:10px; }.itinerary div { display:flex; gap:18px; }.itinerary dt { flex:none; }.itinerary dd { margin:0; }.story-footer { display:flex; justify-content:space-between; gap:20px; margin-top:40px; border-top:1px solid #514450; padding-top:12px; font-size:12px; }
   .scene[data-treatment='B'] { padding:32px 8%; }.scene[data-treatment='B'] .product-bar,.scene[data-treatment='B'] .story-footer,.scene[data-treatment='B'] .decoration { display:none; }.scene[data-treatment='B'] .composition { display:block; max-width:880px; margin:auto; padding:32px; border:1.5px solid #433948; border-radius:7px; box-shadow:7px 7px 0 #d7b9e1; }.scene[data-treatment='B'] .story-header { text-align:left; padding-bottom:20px; }.scene[data-treatment='B'] h2 { font-size:42px; }.scene[data-treatment='B'] .sticky-caption { display:block; position:relative; width:fit-content; max-width:95%; margin:0 0 24px auto; padding:10px 16px; font-size:16px; background:#ffeca3; box-shadow:4px 4px 0 #d7b9e1; transform:rotate(-3deg); }.scene[data-treatment='B'] .entry { border-radius:7px; }.scene[data-treatment='B'] .done { order:2; }
   .scene[data-treatment='C'] { padding:38px 24px 28px; }.scene[data-treatment='C'] .product-bar,.scene[data-treatment='C'] .story-footer { display:none; }.scene[data-treatment='C'] .story-header { text-align:left; padding-bottom:28px; }.scene[data-treatment='C'] .composition { grid-template-columns:minmax(0,1.3fr) minmax(0,5.1fr) minmax(0,1.3fr); }.scene[data-treatment='C'] .large-sticker { width:130%; }.scene[data-treatment='C'] .story-header p { display:none; }.scene[data-treatment='C'] h2 { font-size:clamp(34px,4.5vw,66px); }.scene[data-treatment='C'] .story-header h2 { text-shadow:3px 4px 0 #e9acca; }.scene[data-scene='case-file'] .entry-trigger { min-height:86px; }.scene[data-scene='case-file'] .panel-inner { padding-left:108px; }.scene[data-scene='case-file'] .verdict-panel { padding-left:24px; }.scene[data-scene='case-file'] h2 { font-size:clamp(28px,3.2vw,49px); }.scene[data-scene='case-file'] .story-header { grid-column:1/-1; margin:0 15%; }
   .scene[data-scene='road-trip'] .entry-title { font-size:1.25em; }.scene[data-scene='road-trip'] .done { order:2; }.scene[data-scene='road-trip'] .paper-note { background:transparent; box-shadow:none; }.scene[data-scene='road-trip'][data-treatment='C'] .right .large-sticker { width:115%; }.scene[data-scene='road-trip'][data-treatment='C'] .entry-trigger { min-height:82px; }
   @media(max-width:900px) { .scene { padding:22px 14px; font-size:17px; }.composition,.scene[data-treatment='C'] .composition { grid-template-columns:75px minmax(0,1fr) 75px; gap:0 16px; }.scene h2 { font-size:34px; }.story-header p { font-size:16px; }.paper-note { padding:10px 6px; font-size:13px!important; }.scribble { font-size:15px!important; }.edition,.product-tagline { display:none; }.entry-trigger { gap:10px; padding:12px; }.portrait { width:50px; height:62px; }.scene[data-scene='case-file'] .panel-inner { padding-left:24px; }.scene[data-treatment='B'] { padding:24px; }.scene[data-treatment='B'] .composition { padding:22px; }.scene[data-treatment='B'] h2 { font-size:34px; }.read-stamp { font-size:15px; }.itinerary div { gap:10px; }.postcard { width:24%; } }
   @media(max-width:600px) { .scene,.scene[data-treatment='C'],.scene[data-treatment='B'] { padding:24px 14px; }.composition,.scene[data-treatment='C'] .composition { display:block; }.decoration { display:none; }.scene[data-treatment='B'] .composition { padding:15px 10px; }.scene h2,.scene[data-treatment='B'] h2,.scene[data-scene='case-file'] h2 { font-size:30px; }.story-header,.scene[data-scene='case-file'] .story-header { margin:0; text-align:left; padding-bottom:24px; }.scene[data-scene='case-file'] .entry-trigger { min-height:76px; font-size:15px; }.portrait { width:43px; height:62px; margin-left:-7px; }.read-stamp { font-size:11px; border-width:2px; padding:0 3px; }.chevron { width:19px; height:19px; }.entry-trigger { gap:8px; padding:12px 10px; }.panel-inner { padding:17px 14px; gap:12px; }.scene[data-scene='case-file'] .panel-inner { padding:18px; }.story-footer { font-size:10px; }.postcard { width:30%; }.itinerary { font-size:14px; }.scene[data-scene='road-trip'] .panel-inner { align-items:flex-start; }.scene[data-scene='road-trip'] .postcard { width:25%; }.mystery-icon { width:43px; }.rule-icon { width:34px; height:34px; font-size:30px; }.find-hint { font-size:12px!important; } }
  </style>
 </section>;
}
