import { storage } from '@markless/core';
import AccordionGallery from '../../../components/demos/ui/accordion/examples/gallery.tsrx';

export default function AccordionExamples() @{
 // oxlint-disable-next-line no-unused-vars -- the write persists the choice
 let theme = storage('theme', 'system');

 <div>
  <div class="preview-theme">
   <button class="to-light" type="button" aria-label="Switch to the light theme" title="Switch to the light theme" onClick={() => { theme = 'light'; }}><img src="/markless/theme/moon.png" alt="" /></button>
   <button class="to-dark" type="button" aria-label="Switch to the dark theme" title="Switch to the dark theme" onClick={() => { theme = 'dark'; }}><img src="/markless/theme/sun.png" alt="" /></button>
  </div>
  <AccordionGallery />
  <style>
   .preview-theme { position:fixed; top:0; right:var(--space-s-l); z-index:40; height:var(--header-height); display:flex; align-items:center; }
   button { padding:0; width:var(--theme-toggle-size); height:var(--theme-toggle-size); border:0; border-radius:50%; background:transparent; cursor:pointer; }
   button:focus-visible { outline:3px solid var(--pink); outline-offset:4px; }
   img { display:block; width:100%; height:100%; object-fit:contain; }
   .to-light { display:none; html.dark & { display:block; } }
   .to-dark { display:block; html.dark & { display:none; } }
  </style>
 </div>;
}
