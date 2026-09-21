export default function AccordionPreviewCards() @{
 <section class="accordion-examples" data-accordion-examples aria-label="Live accordion examples">
  <p class="intro">Little worlds built with accordion. Pick one to explore.</p>
  <div class="cards">
   <a class="sticker" data-example-card="road-trip" href="/markless/examples/accordion/road-trip" aria-labelledby="road-trip-card-title">
    <img src="/markless/accordion-art/previews/road-trip.jpg" alt="" width={800} height={480} loading="lazy" />
    <div class="caption">
     <h3 id="road-trip-card-title">Road trip: Lisbon to Porto</h3><span class="arrow" aria-hidden="true">↗</span>
     <p>A coastal itinerary, two days at a time.</p>
    </div>
   </a>
   <a class="sticker" data-example-card="case-file" href="/markless/examples/accordion/case-file" aria-labelledby="case-file-card-title">
    <img src="/markless/accordion-art/previews/case-file.jpg" alt="" width={800} height={480} loading="lazy" />
    <div class="caption">
     <h3 id="case-file-card-title">Case file: the missing sourdough starter</h3><span class="arrow" aria-hidden="true">↗</span>
     <p>A bakery mystery, one alibi at a time.</p>
    </div>
   </a>
   <a class="sticker" data-example-card="rulebook" href="/markless/examples/accordion/rulebook" aria-labelledby="rulebook-card-title">
    <img src="/markless/accordion-art/previews/rulebook.jpg" alt="" width={800} height={480} loading="lazy" />
    <div class="caption">
     <h3 id="rulebook-card-title">Rulebook: Moon Goats</h3><span class="arrow" aria-hidden="true">↗</span>
     <p>A small rulebook for an unruly herd.</p>
    </div>
   </a>
  </div>
  <style>
   .accordion-examples { --card-focus:var(--ink); width:100%; margin:0 0 var(--space-l); }
   .intro { margin:0 0 1.5rem; }
   .cards { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1.25rem; padding:0.25rem 0 0.75rem; }
   .sticker { --tilt:-0.8deg; --ink:#302b31; position:relative; min-width:0; display:flex; flex-direction:column; border:7px solid #fffcf5; border-radius:7px 5px 8px 4px; background:#fffcf5; color:var(--ink); text-decoration:none; box-shadow:1px 2px 0 #302b3140,0 4px 10px #302b3120; transform:rotate(var(--tilt)); transition:transform 160ms ease,box-shadow 160ms ease; }
   .sticker:nth-child(2) { --tilt:0.7deg; }
   .sticker:nth-child(3) { --tilt:-0.5deg; }
   .sticker:hover { transform:translateY(-3px) rotate(0); box-shadow:1px 3px 0 #302b3140,0 7px 14px #302b3126; }
   .sticker:focus-visible { outline:2px dashed var(--card-focus); outline-offset:5px; transform:rotate(0); }
   img { display:block; box-sizing:border-box; width:100%; height:10rem; object-fit:cover; object-position:top; border:1px solid #302b312b; border-radius:2px; background:#faf4e8; }
   .caption { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:start; gap:0.55rem 0.35rem; padding:0.8rem 0.35rem 0.55rem; }
   h3 { margin:0; font:600 clamp(1.1rem,1.35vw,1.35rem)/1.2 'Joy Elia',serif; color:var(--ink); text-shadow:none; }
   .arrow { font-size:1.15rem; line-height:1.3; }
   .caption p { grid-column:1/-1; margin:0; font-size:0.9rem; line-height:1.45; }
   @media(max-width:48rem) { .cards { display:flex; overflow-x:auto; scroll-snap-type:x mandatory; gap:1.25rem; padding:0.75rem 0.5rem 1rem; margin:-0.5rem -0.5rem 0; }.sticker { flex:0 0 82%; box-sizing:border-box; scroll-snap-align:center; }.caption { padding:0.8rem 0.5rem 0.55rem; }h3 { font-size:1.3rem; } }
   @media(prefers-reduced-motion:reduce) { .sticker { transition:none; } }
  </style>
 </section>;
}
