import { state } from '@markless/core';
import AccordionScene from '../../../../components/demos/ui/accordion/examples/scene.tsrx';
import { scenarios } from '../../../../components/demos/ui/accordion/examples/scenarios.ts';

export default function AccordionExamplePage({ params, url }: { readonly params: { readonly scenario: string }; readonly url: { readonly search: string } }) @{
 const story = scenarios.find(item => item.id === params.scenario);
 const scenario = state(story?.id ?? 'road-trip');
 const embedded = new URLSearchParams(url.search).get('embed') === '1';
 <div class="standalone-example" data-standalone-example>
  <nav hidden={embedded}><a href="/markless/ui/accordion#examples">← Accordion examples</a><span>Made with Markless</span></nav>
  @if (story) {
   <AccordionScene scenario={scenario} />;
  } @else {
   <p>That example could not be found. <a href="/markless/ui/accordion#examples">Browse the accordion examples.</a></p>;
  }
  <style>
   .standalone-example { width:100%; color:#27232e; background:#faf4e8; color-scheme:light; }
   nav { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1rem 1.5rem; font:14px 'Shantell Sans',sans-serif; }
   nav[hidden] { display:none; }a { color:inherit; text-underline-offset:3px; }p { padding:2rem; }
  </style>
 </div>;
}
