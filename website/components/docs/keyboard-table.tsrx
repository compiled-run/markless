import { state } from '@markless/core';
import { select, lucide } from '@markless/ui';
import PlatformIcon from './keyboard/platform-icon.tsrx';
import AccordionPractice from './keyboard/accordion-practice.tsrx';
import { metaFor } from './ui-meta/index.ts';
import { detectPlatform, keyboardLayouts, shortcutFor, matchesShortcut, commandForKey, pressedKeys } from './keyboard/model.ts';

export type KeyboardRow = {
 /** One key per entry. */
 readonly keys: readonly string[];
 /** `or` for alternatives, `+` for a chord. */
 readonly join?: string;
 /** What pressing the keys does. */
 readonly does: string;
};

const platformProbe = `document.documentElement.dataset.keyboardPlatform=(${detectPlatform.toString()})((navigator.userAgentData||{}).platform||navigator.platform||'',navigator.userAgent||'')`;

const practiceShortcut = `if (!document.documentElement.hasAttribute('data-practice-shortcut')) {
 document.documentElement.setAttribute('data-practice-shortcut', '');
 document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.key !== 'k') return;
  const target = event.target;
  if (!(target instanceof Element) || target.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="listbox"], [role="option"], [role="menu"], [role="dialog"], [data-keyboard-practice]')) return;
  const phone = document.querySelector('.phone-preview');
  if (!(phone instanceof HTMLElement) || phone.getClientRects().length === 0) return;
  const rect = phone.getBoundingClientRect();
  if (rect.top < 0 || rect.bottom > window.innerHeight) return;
  phone.closest('[data-keyboard-practice]')?.dispatchEvent(new KeyboardEvent('keydown', {key: 'k', bubbles: true, cancelable: true}));
 });
}`;

export default function KeyboardTable({family,rows}: {readonly family?: string;readonly rows?: readonly KeyboardRow[]}) @{
 const source = rows ? rows.map(row=>({does:row.does,join:row.join??'or',caps:row.keys.map(key=>({mac:{symbol:key,label:key},other:{symbol:key,label:key}}))})) : metaFor(family??'').keyboard;
 const actions = source.map((row,index)=>({id:String(index),does:row.does,mac:shortcutFor(row.caps,row.join??'or','mac'),windows:shortcutFor(row.caps,row.join??'or','windows'),linux:shortcutFor(row.caps,row.join??'or','linux')}));
 const drawings = keyboardLayouts.map(layout=>({...layout,keys:layout.keys.map(cap=>({...cap,legends:(cap.width <= 40 ? cap.label.split(' ') : [cap.label]).map((text,index,lines)=>({text,index,x:cap.x+cap.width/2,y:cap.y+cap.height/2+(index-(lines.length-1)/2)*12})),actionable:actions.some(action=>action[layout.id].keys.includes(cap.code)) || (family==='accordion' && cap.code==='KeyK')}))}));
 const first = actions[0];
 if(!first) throw new Error('Keyboard explorer needs at least one action.');
 let keyboard = state({active:false,platform:'auto',platformLabel:'Automatic',hovered:'',hoverLabel:'',hoverPlatform:'',fn:false,demoIndex:'0',lastLabel:'Ready when you are',feedback:'Start typing in the example, or tap a key below.',actions,macKeys:first.mac.keys.join(' '),windowsKeys:first.windows.keys.join(' '),linuxKeys:first.linux.keys.join(' '),});
 <section class="keyboard-study" aria-label="Keyboard interactions" data-platform={keyboard.platform} data-inspected={keyboard.hovered || undefined} data-inspection-platform={keyboard.hoverPlatform} data-family={family} data-playing={keyboard.active} data-fn={keyboard.fn} data-mac-keys={keyboard.macKeys} data-windows-keys={keyboard.windowsKeys} data-linux-keys={keyboard.linuxKeys}
  onFocusin={(event:Event)=>{const target=event.target;if(!(target instanceof Element))return;const trigger=target.closest('[data-practice-index]');if(trigger)keyboard.demoIndex=trigger.getAttribute('data-practice-index')??'0';}}
  onKeydown={(event:KeyboardEvent)=>{
   const target=event.target;if(!(target instanceof Element))return;
   if(target.closest('[data-keyboard-practice]'))keyboard.active=event.key!=='Escape';
   if(!target.closest('[data-practice-index]'))return;
   const platform=keyboard.platform==='auto'?detectPlatform(navigator.platform,navigator.userAgent):keyboard.platform==='mac'?'mac':keyboard.platform==='linux'?'linux':'windows';
   const action=keyboard.actions.find(entry=>matchesShortcut(entry[platform],event,platform));if(!action)return;
   keyboard.hovered='';keyboard.hoverLabel='';keyboard.fn=false;
   keyboard.macKeys=pressedKeys(event,'mac').join(' ');keyboard.windowsKeys=pressedKeys(event,'windows').join(' ');keyboard.linuxKeys=pressedKeys(event,'linux').join(' ');
   const visibleLayout=keyboardLayouts.find(layout=>layout.id===platform);keyboard.lastLabel=pressedKeys(event,platform).map(code=>visibleLayout?.keys.find(cap=>cap.code===code)?.label??code).join(' + ');keyboard.feedback=action.does;
  }}
 >
  <script>{platformProbe}</script>
  <script>{practiceShortcut}</script>
  <div class="keyboard-header">
   @if (family !== 'accordion') { <span class="keyboard-title">Try the keys</span> }
   <select.root class="platform-picker" value="auto" onChange={(value:string)=>{keyboard.platform=value;keyboard.fn=false;keyboard.platformLabel=value==='auto'?'Automatic':value==='mac'?'macOS':value==='windows'?'Windows':'Linux';keyboard.hovered='';keyboard.hoverLabel='';}}>
    <select.label class="platform-label">Layout</select.label>
    <select.trigger class="platform-trigger"><PlatformIcon platform={keyboard.platform} /><span>{keyboard.platformLabel}</span><lucide.chevrondown width="14" height="14" aria-hidden="true" /></select.trigger>
    <select.content class="platform-menu">
     <select.item class="platform-option" value="auto"><PlatformIcon platform="auto" /><select.itemlabel>Automatic</select.itemlabel></select.item>
     <select.item class="platform-option" value="mac"><PlatformIcon platform="mac" /><select.itemlabel>macOS</select.itemlabel></select.item>
     <select.item class="platform-option" value="windows"><PlatformIcon platform="windows" /><select.itemlabel>Windows</select.itemlabel></select.item>
     <select.item class="platform-option" value="linux"><PlatformIcon platform="linux" /><select.itemlabel>Linux</select.itemlabel></select.item>
    </select.content>
   </select.root>
  </div>
  <div class="keyboard-workspace">
  <div class="practice-host" hidden={family!=='accordion'}><AccordionPractice platform={keyboard.platform} /></div>
  <div class="keyboard-drawing"
   onPointerover={(event:PointerEvent)=>{if(event.pointerType!=='mouse')return;const target=event.target;if(!(target instanceof Element))return;const key=target.closest('[data-actionable]');if(!key){keyboard.hovered='';keyboard.hoverLabel='';return;}keyboard.hovered=key.getAttribute('data-code')??'';keyboard.hoverLabel=key.getAttribute('aria-label')??'';keyboard.hoverPlatform=key.closest('[data-os]')?.getAttribute('data-os')??'';}}
   onPointerout={(event:PointerEvent)=>{const target=event.target;if(!(target instanceof Element))return;if(event.relatedTarget instanceof Element && event.relatedTarget.closest('.keyboard-drawing')===target.closest('.keyboard-drawing'))return;keyboard.hovered='';keyboard.hoverLabel='';}}
   onClick={(event:Event)=>{
    const target=event.target;if(!(target instanceof Element))return;const key=target.closest('[data-actionable]');if(!key)return;
    const code=key.getAttribute('data-code')??'';
    if(code==='Fn'){keyboard.fn=!keyboard.fn;keyboard.hovered='';keyboard.hoverLabel='';keyboard.lastLabel=keyboard.fn?'Fn held':'Fn released';keyboard.feedback=keyboard.fn?'Tap an arrow key to complete the combination.':'Choose another key to try.';return;}
    const command=commandForKey(code,keyboard.fn);keyboard.fn=false;
    const practice=target.closest('.keyboard-study')?.querySelector('[data-practice-index="'+keyboard.demoIndex+'"]');
    if(!(practice instanceof HTMLElement))return;
    practice.focus({preventScroll:true});
    practice.dispatchEvent(new KeyboardEvent('keydown',{key:command==='Space'?' ':command,bubbles:true,cancelable:true}));
   }}
   onKeydown={(event:KeyboardEvent)=>{
    const target=event.target;if(!(target instanceof Element))return;const key=target.closest('[data-actionable]');if(!key)return;
    if(event.key==='Escape'){keyboard.fn=false;keyboard.hovered='';keyboard.hoverLabel='';return;}
    if(event.key==='Enter' || event.key===' '){event.preventDefault();key.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
   }}
   onFocusin={(event:Event)=>{const target=event.target;if(!(target instanceof Element))return;const key=target.closest('[data-actionable]');if(!key)return;keyboard.hovered=key.getAttribute('data-code')??'';keyboard.hoverLabel=key.getAttribute('aria-label')??'';keyboard.hoverPlatform=key.closest('[data-os]')?.getAttribute('data-os')??'';}}
   onFocusout={(event:FocusEvent)=>{if(event.relatedTarget instanceof Element && event.relatedTarget.closest('[data-actionable]'))return;keyboard.hovered='';keyboard.hoverLabel='';}}
  >
   @for (const layout of drawings; key layout.id) {
    <div class="keyboard-layout platform-view" data-os={layout.id}>
     <div class="keyboard-meta">{layout.name} · QWERTY</div>
     <div class="keyboard-scroll">
      <svg class="physical-keyboard" viewBox={'0 0 '+layout.width+' '+layout.height} role="group" aria-label={layout.name+' keyboard'}>
       @for (const cap of layout.keys; key cap.id) {
        <g class="keyboard-key" data-code={cap.code} data-actionable={cap.actionable} role={cap.actionable?'button':undefined} tabindex={cap.actionable?0:undefined} aria-label={cap.actionable?cap.label:undefined}>
         <rect class="key-shadow" x={cap.x} y={cap.y+7} width={cap.width} height={cap.height} rx="5" />
         <g class="key-top"><rect class="key-face" x={cap.x} y={cap.y} width={cap.width} height={cap.height} rx="5" />
         @for (const legend of cap.legends; key legend.index) {
          <text x={legend.x} y={legend.y} text-anchor="middle" dominant-baseline="middle">{legend.text}</text>;
         }
         </g>
        </g>;
       }
      </svg>
     </div>
    </div>;
   }
   <p class="keyboard-instruction">Press keys in the example, or tap them here. On Mac, tap Fn before an arrow.</p>
  </div>
  <div class="practice-feedback" aria-live="polite" aria-atomic="true"><strong>{keyboard.lastLabel}</strong><span>{keyboard.feedback}</span></div>
  </div>
   <div class="keyboard-actions">
    @for (const action of actions; key action.id) {
     <p class="keyboard-action" data-mac-keys={action.mac.keys.join(' ')} data-windows-keys={action.windows.keys.join(' ')} data-linux-keys={action.linux.keys.join(' ')}><kbd class="reference-key"><span class="platform-view" data-os="mac">{action.mac.label}</span><span class="platform-view" data-os="windows">{action.windows.label}</span><span class="platform-view" data-os="linux">{action.linux.label}</span></kbd><span>{action.does}</span></p>;
    }
   </div>

  <style>
   .keyboard-study { --keyboard-control-shadow: 4px 4px 0 var(--muted-ink); --keyboard-control-radius: 3px; --keyboard-preview-depth: color-mix(in srgb, var(--purple) 60%, var(--paper)); --keyboard-key-depth: color-mix(in srgb, var(--purple) 25%, var(--paper)); margin: 0 0 2rem; width: 100%; color: var(--ink); }
   .keyboard-workspace { display: block; clear: both; }
   .keyboard-study[data-family='accordion'] .keyboard-workspace { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(210px, .72fr); gap: 0 1.5rem; margin-top: 1rem; align-items: start; }
   .practice-host { display: contents; }
   .practice-host[hidden] { display: none; }
   .keyboard-study[data-family='accordion'] .keyboard-drawing { grid-column: 1; grid-row: 2; align-self: center; }
   .keyboard-study[data-family='accordion'] .practice-feedback, .keyboard-study[data-family='accordion'] .keyboard-instruction { display: none; }
   .keyboard-study[data-family='accordion'] .keyboard-actions { display: none; }
   .keyboard-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: calc(var(--step-3) * 1.3); box-sizing: border-box; padding: 0; }
   .keyboard-title { font-size: var(--step-0); font-weight: 600; }
   .platform-picker { --picker-edge: color-mix(in oklch, var(--ink) 80%, transparent); --picker-wash: color-mix(in srgb, var(--purple) 26%, var(--paper)); position: relative; display: grid; grid-template-columns: auto max-content; align-items: center; gap: .8em; font: var(--step--1)/1.3 'Shantell Sans', system-ui, sans-serif; }
   .platform-picker[ui-open] { z-index: 30; --keyboard-control-shadow: 4px 4px 0 var(--purple); }
   .platform-picker { margin-inline-start: auto; }
   html.dark .platform-picker { --picker-wash: color-mix(in srgb, var(--purple) 20%, var(--paper)); }
   .platform-trigger { box-sizing: border-box; box-shadow: var(--keyboard-control-shadow); display: flex; align-items: center; justify-content: space-between; gap: .7em; cursor: pointer; min-width: 10rem; border: 1px solid var(--picker-edge); border-radius: 6px; background: var(--paper); color: var(--ink); padding: .45em .8em; font: inherit; text-align: start; }
   .platform-trigger > svg { width: 1em; height: 1em; opacity: .65; transition: transform 140ms ease; }
   .platform-trigger[ui-open] > svg { transform: rotate(180deg); }
   .platform-trigger > span:not(.platform-icon) { flex: 1; text-align: left; }
   .platform-trigger:focus-visible { outline: 2px solid var(--ink); outline-offset: 4px; }
   .keyboard-drawing { position: relative; padding: .85rem 0 0; }
   .keyboard-meta { color: var(--muted-ink); font: 11px var(--font-mono); margin: 0 0 .6rem .25rem; }
   .keyboard-scroll { overflow-x: auto; padding: 16px 12px 24px;  }
   .physical-keyboard { display: block; width: 100%; height: auto; filter: drop-shadow(0 6px 5px color-mix(in srgb, var(--ink) 6%, transparent)); }
   .keyboard-key { --key-fill: var(--paper); --key-stroke: var(--code-edge); --key-opacity: .65; opacity: var(--key-opacity); transition: opacity 120ms ease-out; }
   .key-shadow { fill: var(--keyboard-key-depth); stroke: var(--code-edge); stroke-width: .6; }
   .key-top { transform: translateY(-2px); transition: transform 150ms ease-out; }
   .keyboard-key[data-actionable] { --key-opacity: 1; cursor: pointer; }
   .keyboard-key[data-actionable]:hover .key-top, .keyboard-key:focus-visible .key-top { transform: translateY(-5px); }
   .keyboard-key[data-actionable]:active .key-top { transform: translateY(4px); }
   .keyboard-key:focus-visible { outline: none; }
   .keyboard-key:focus-visible .key-face { stroke: var(--ink); stroke-width: 3; }
   .key-face { fill: var(--key-fill); stroke: var(--key-stroke); stroke-width: 1.5; transition: fill 120ms ease-out, stroke 120ms ease-out; }
   .keyboard-key text { fill: var(--ink); font: 11px system-ui, sans-serif; pointer-events: none; }
   .platform-view { display: none; }
   html:not([data-keyboard-platform]) .keyboard-study[data-platform='auto'] .platform-view[data-os='windows'] { display: revert; }
   .keyboard-actions { min-width: 0; margin: 0; padding: .6rem 0 0; border: 0; border-top: 1px solid var(--code-edge); }
   .keyboard-action { transition: opacity 150ms ease-out; display: flex; align-items: center; gap: .65rem; padding: .75rem .5rem; border-top: 1px solid var(--code-edge); }
   @media (max-width: 760px) {
    .keyboard-header { flex-wrap: wrap; gap: .75rem; }
    .keyboard-study[data-family='accordion'] .platform-label { display: none; }
    .keyboard-study[data-family='accordion'] .keyboard-workspace { display: none; }
    .keyboard-study .keyboard-drawing, .keyboard-study .practice-feedback { display: none; }
    .keyboard-study[data-family='accordion'] .keyboard-actions { display: block; }
   }
   @media (prefers-reduced-motion: reduce) { .keyboard-key, .key-face, .key-top, .keyboard-action { transition: none; } }
   .platform-menu { position: absolute; grid-column: 2 / 3; inset-block-start: 100%; inset-inline: 0; box-sizing: border-box; inline-size: 100%; z-index: 30; margin-block: .3em; padding: .3em; border: 1px solid var(--picker-edge); border-radius: 6px; background: var(--paper); color: var(--ink); box-shadow: var(--keyboard-control-shadow); font: inherit; }
   .platform-menu:is([ui-closed], [hidden]) { display: none; }
   @supports (position-area: block-end) {
    .platform-picker { anchor-scope: --keyboard-platform; }
    .platform-trigger[ui-open] { anchor-name: --keyboard-platform; }
    .platform-menu { position: fixed; grid-column: auto; inset: auto; inline-size: anchor-size(--keyboard-platform inline); position-anchor: --keyboard-platform; position-area: block-end span-inline-start; position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline; }
   }
   .platform-option { display: flex; align-items: center; gap: .6em; padding: .3em .6em; border-radius: 4px; font: inherit; cursor: pointer; }
   .platform-option:hover { background: color-mix(in oklch, var(--ink) var(--hover-wash), transparent); }
   .platform-option[ui-selected] { background: var(--picker-wash); }
   .platform-option:focus-visible { outline: 2px solid var(--ink); outline-offset: 4px; }
   .keyboard-instruction { margin: 0 .25rem; color: var(--muted-ink); font-size: var(--step--2); }
   .keyboard-study[data-inspected] .keyboard-action { opacity: .3; }
   .keyboard-study[data-inspected] .keyboard-key { --key-opacity: .25; }
   .practice-feedback { display: grid; gap: .3rem; min-height: 4.5rem; box-sizing: border-box; padding: .9rem .25rem; }
   .practice-feedback strong { font: 600 14px var(--font-mono); }
   .practice-feedback span { font-size: var(--step--1); }
   .keyboard-action { margin: 0; }
   .reference-key { flex: 0 0 auto; min-width: 4rem; padding: .45rem .6rem; border: 1px solid var(--ink); border-radius: 3px; background: var(--paper); box-shadow: 2px 2px 0 var(--purple); text-align: center; font: 600 12px var(--font-mono); }
   .keyboard-study[data-fn] .keyboard-key[data-code='Fn'] { --key-fill: var(--purple); --key-stroke: var(--ink); --key-opacity: 1; }
   .keyboard-study[data-family='accordion']:not([data-playing]) { --keyboard-preview-depth: color-mix(in srgb, var(--ink) 15%, var(--paper)); --keyboard-key-depth: color-mix(in srgb, var(--ink) 10%, var(--paper)); }
   .keyboard-study[data-family='accordion']:not([data-playing]) .platform-picker { --picker-wash: color-mix(in srgb, var(--ink) 8%, var(--paper)); }
   .keyboard-study[data-family='accordion']:not([data-playing]) .key-face { fill: var(--paper); stroke: var(--code-edge); }
   .keyboard-study[data-family='accordion']:not([data-playing]) .keyboard-key[data-code='KeyK'] .key-face { fill: var(--purple); stroke: var(--ink); }
   @keyboard-inspection;
   @keyboard-platforms;
   @keyboard-highlights;
  </style>
 </section>;
}
