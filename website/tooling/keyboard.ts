import type { Plugin } from 'vite';
import { keyboardLayouts } from '../components/docs/keyboard/model.ts';

export function expandKeyboardStyles(source: string): string {
 const highlights = keyboardLayouts.flatMap(layout => [...new Set(layout.keys.map(key=>key.code))].map(code =>
  `.keyboard-study:not([data-inspected])[data-${layout.id}-keys~="${code}"] .keyboard-layout[data-os="${layout.id}"] .keyboard-key[data-code="${code}"] { --key-fill: var(--purple); --key-stroke: var(--ink); --key-opacity: 1; }`,
 )).join('\n');
 const platforms = keyboardLayouts.map(layout =>
  `.keyboard-study[data-platform="${layout.id}"] .platform-view[data-os="${layout.id}"], html[data-keyboard-platform="${layout.id}"] .keyboard-study[data-platform="auto"] .platform-view[data-os="${layout.id}"] { display: revert; }`,
 ).join('\n');
 const inspection = keyboardLayouts.flatMap(layout=>[...new Set(layout.keys.map(key=>key.code))].map(code=>
  `.keyboard-study[data-inspected="${code}"][data-inspection-platform="${layout.id}"] .keyboard-action[data-${layout.id}-keys~="${code}"] { opacity: 1; }
.keyboard-study[data-inspected="${code}"] .keyboard-key[data-code="${code}"] { --key-opacity: 1; --key-fill: var(--purple); --key-stroke: var(--ink); }`,
 )).join('\n');
 return source.replace('@keyboard-highlights;',highlights).replace('@keyboard-platforms;',platforms).replace('@keyboard-inspection;',inspection);
}

export function keyboard(): Plugin {
 return {name:'compiled-website:keyboard',enforce:'pre',transform(source,id){
  if(!id.split('?',1)[0]?.endsWith('.tsrx') || !source.includes('@keyboard-highlights;')) return;
  return {code:expandKeyboardStyles(source),map:null};
 }};
}
