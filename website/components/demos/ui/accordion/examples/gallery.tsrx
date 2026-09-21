import { state } from '@markless/core';
import { scenarios, type Scenario } from './scenarios.ts';
import AccordionScene from './scene.tsrx';

export default function AccordionGallery() @{
 let choice = state<Scenario>('road-trip');
 const stories = state(scenarios);
 <div class="gallery" data-gallery>
  <header class="gallery-heading"><a href="/markless/ui/accordion">← Accordion</a><h1>Little stories that open up.</h1><p>Three working examples. Pick a story and make yourself at home.</p></header>
  <div class="scenario-picker" role="group" aria-label="Choose a scenario">@for (const story of stories; key story.id) { <button type="button" data-select-scenario={story.id} aria-pressed={choice === story.id} onClick={() => { choice = story.id; }}>{story.label}</button> }</div>
  <div class="scene-holder" hidden={choice !== 'road-trip'}><AccordionScene scenario="road-trip" /></div>
  <div class="scene-holder" hidden={choice !== 'case-file'}><AccordionScene scenario="case-file" /></div>
  <div class="scene-holder" hidden={choice !== 'rulebook'}><AccordionScene scenario="rulebook" /></div>
  <style>
   .scene-holder[hidden] { display:none; }
   .gallery { width:min(1400px,calc(100vw - 56px)); position:relative; left:50%; transform:translateX(-50%); margin:20px 0 60px; }
   .gallery-heading { margin-bottom:28px; }.gallery-heading a { font-size:14px; }.gallery-heading h1 { margin:18px 0 8px; font:700 clamp(30px,4vw,48px)/1.12 'Joy Elia',serif; }.gallery-heading p { margin:0; font:16px/1.5 'Shantell Sans',sans-serif; }
   .scenario-picker { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:22px; }button { padding:9px 13px; background:var(--paper); color:var(--ink); border:1px solid var(--ink); border-radius:3px; font:14px 'Shantell Sans',sans-serif; cursor:pointer; }button[aria-pressed='true'] { background:var(--marker-wash); box-shadow:2px 2px 0 var(--muted-ink); }button:focus-visible { outline:2px dashed var(--ink); outline-offset:3px; }
   @media(min-width:70.01rem) and (max-width:96rem) { .gallery { left:calc(50% - 2.5rem); } }
   @media(max-width:600px) { .gallery { width:calc(100vw - 24px); }.scenario-picker { display:grid; grid-template-columns:repeat(3,1fr); width:100%; }.scenario-picker button { padding:9px 6px; font-size:12px; }.gallery-heading h1 { font-size:32px; }.gallery-heading p { font-size:14px; } }
  </style>
 </div>;
}
