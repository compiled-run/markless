import { accordion, lucide } from '@markless/ui';
import { computed, state } from '@markless/core';
import { accordionTricks, landedTrick } from './tricks.ts';

export default function AccordionPractice({ platform }: { readonly platform: string }) @{
 let game = state({ round: 0, active: false, command: '', value: '' });
 const trick = computed(() => { const round = game.round; return accordionTricks[round]; });
 <div class="practice-stage" data-keyboard-practice data-layout={platform} data-challenge={game.round} data-active={game.active}
  onPointerdown={() => { game.command = ''; }}
  onKeydown={(event: KeyboardEvent) => {
   if (event.repeat) return;
   const target = event.target;
   if (!(target instanceof Element)) return;
   if (event.key === 'Escape') { if (target instanceof HTMLElement) target.blur(); game.active = false; return; }
   if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === 'k' && !game.active) {
    game.round = 0;
    game.command = ''; game.value = accordionTricks[game.round].initial; game.active = true;
    const trigger = target.closest('[data-keyboard-practice]')?.querySelector('[data-practice-index="' + accordionTricks[game.round].start + '"]');
    if (trigger instanceof HTMLElement) trigger.focus({ preventScroll: true });
    return;
   }
   if (!target.closest('[data-practice-index]')) return;
   game.active = true;
   game.command = event.ctrlKey || event.altKey || event.metaKey || event.shiftKey ? '' : event.key;
   if (!event.isTrusted && (event.key === 'Enter' || event.key === ' ') && target instanceof HTMLElement) target.click();
   if (accordionTricks[game.round].mode !== 'focus') return;
   const focused = document.activeElement?.getAttribute('data-practice-index') ?? '';
   if (landedTrick(accordionTricks[game.round], game.command, focused, game.value)) game.round = (game.round + 1) % accordionTricks.length;
  }}
 >
  <div class="practice-guide">
   <div class="practice-entry" aria-hidden={game.active}>
    <div><strong class="entry-title">Test it on the keyboard</strong><p class="entry-prompt">Press K to start, then follow the keys shown here.</p></div>
    <button class="entry-key" type="button" aria-label="Start keyboard practice (K)" onClick={(event: Event) => {
     const target = event.target;
     if (target instanceof Element) target.closest('[data-keyboard-practice]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true }));
    }}><kbd>K</kbd><span>Start</span></button>
   </div>
   <div class="trick-announcement" aria-live="polite" aria-atomic="true" aria-hidden={!game.active}>
    <div class="trick-task">
     <div class="trick-copy"><strong class="trick-title">{trick.title}</strong><p class="trick-prompt">{trick.prompt}</p></div>
     <p class="trick-command" aria-label="Shortcut"><kbd data-command-os="mac">{trick.mac}</kbd><kbd data-command-os="windows">{trick.windows}</kbd><kbd data-command-os="linux">{trick.linux}</kbd></p>
    </div>
    <p class="trick-help">Press <kbd>Esc</kbd> to stop.</p>
   </div>
  </div>
  <div class="phone-preview" aria-label="Accordion phone preview">
   <span class="phone-speaker" aria-hidden="true"></span>

  <accordion.root class="practice-accordion" collapsible value={game.value} onChange={(value: string | readonly string[]) => {
   game.value = typeof value === 'string' ? value : value[0] ?? '';
   if (!game.active || accordionTricks[game.round].mode !== 'toggle') return;
   const focused = document.activeElement?.getAttribute('data-practice-index') ?? '';
   if (landedTrick(accordionTricks[game.round], game.command, focused, game.value)) game.round = (game.round + 1) % accordionTricks.length;
   game.command = '';
  }}>
   <accordion.item class="practice-item" value="components">
    <accordion.itemlabel class="practice-heading"><accordion.itemtrigger class="practice-trigger" data-practice-index="0"><span class="practice-label"><lucide.filetext width="20" height="20" aria-hidden="true" />Components</span><lucide.chevrondown width="14" height="14" aria-hidden="true" /></accordion.itemtrigger></accordion.itemlabel>
    <accordion.itemcontent class="practice-content"><div class="practice-content-body">Accessible behavior. Your own styles.</div></accordion.itemcontent>
   </accordion.item>
   <accordion.item class="practice-item" value="styling">
    <accordion.itemlabel class="practice-heading"><accordion.itemtrigger class="practice-trigger" data-practice-index="1"><span class="practice-label"><lucide.paintbrush width="20" height="20" aria-hidden="true" />Styling</span><lucide.chevrondown width="14" height="14" aria-hidden="true" /></accordion.itemtrigger></accordion.itemlabel>
    <accordion.itemcontent class="practice-content"><div class="practice-content-body">Start with your design tokens.</div></accordion.itemcontent>
   </accordion.item>
   <accordion.item class="practice-item" value="keyboard">
    <accordion.itemlabel class="practice-heading"><accordion.itemtrigger class="practice-trigger" data-practice-index="2"><span class="practice-label"><lucide.keyboard width="20" height="20" aria-hidden="true" />Keyboard</span><lucide.chevrondown width="14" height="14" aria-hidden="true" /></accordion.itemtrigger></accordion.itemlabel>
    <accordion.itemcontent class="practice-content"><div class="practice-content-body">Arrow keys move. Enter or Space opens.</div></accordion.itemcontent>
   </accordion.item>
  </accordion.root>
   <span class="phone-home" aria-hidden="true"></span>
  </div>
  <style>
   .practice-stage { display: contents; }
   .practice-guide { display: grid; align-items: center; grid-column: 1; grid-row: 1; min-width: 0; padding-top: .5rem; }
   .practice-entry { grid-area: 1 / 1; display: flex; align-items: center; gap: 1.5rem; padding: .75rem 0; }
   .trick-announcement { grid-area: 1 / 1; visibility: hidden; padding: .75rem 0; }
   .practice-stage[data-active] .practice-entry { visibility: hidden; }
   .practice-stage[data-active] .trick-announcement { visibility: visible; }
   .entry-title { display: block; font-size: var(--step-2); line-height: 1.15; }
   .practice-entry .entry-prompt { margin: .65rem 0 0; color: var(--ink); font-size: var(--step--1); line-height: 1.5; }
   .entry-key { display: grid; place-content: center; gap: .2rem; flex: none; width: 80px; height: 80px; border: 1px solid var(--ink); border-radius: 6px; background: var(--purple); color: var(--ink); box-shadow: 3px 3px 0 color-mix(in srgb, var(--ink) 18%, var(--paper)); cursor: pointer; }
   .entry-key kbd { font: 500 32px var(--font-mono); }
   .entry-key span { font: 14px 'Shantell Sans', system-ui, sans-serif; }
   .entry-key:focus-visible { outline: 2px solid var(--ink); outline-offset: 5px; }
   .entry-key:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 color-mix(in srgb, var(--ink) 18%, var(--paper)); }
   .trick-task { display: flex; align-items: center; justify-content: flex-start; gap: .8rem; }
   .trick-copy { flex: 0 1 auto; min-width: 0; }
   .trick-title { display: block; font-size: var(--step-1); line-height: 1.15; }
   .practice-guide .trick-prompt { margin: .35rem 0 0; font-size: var(--step--1); line-height: 1.4; color: var(--ink); }
   .practice-guide .trick-command { flex: none; max-width: 45%; margin: 0; font: 12px var(--font-mono); line-height: 1.6; }
   .trick-command kbd { display: inline-block; padding: .4rem .5rem; border: 1px solid var(--ink); border-radius: var(--keyboard-control-radius); background: var(--paper); box-shadow: 2px 2px 0 var(--purple); color: var(--ink); font: 600 12px var(--font-mono); white-space: nowrap; }
   .practice-guide .trick-help { margin: .9rem 0 0; color: var(--muted-ink); font-size: 12px; line-height: 1.4; }
   .trick-command [data-command-os] { display: none; }
   .practice-stage[data-layout='mac'] [data-command-os='mac'], html[data-keyboard-platform='mac'] .practice-stage[data-layout='auto'] [data-command-os='mac'],
   .practice-stage[data-layout='windows'] [data-command-os='windows'], html[data-keyboard-platform='windows'] .practice-stage[data-layout='auto'] [data-command-os='windows'],
   .practice-stage[data-layout='linux'] [data-command-os='linux'], html[data-keyboard-platform='linux'] .practice-stage[data-layout='auto'] [data-command-os='linux'] { display: inline-block; }
   .phone-preview { grid-column: 2; grid-row: 2; position: relative; align-self: center; width: 100%; min-height: 390px; box-sizing: border-box; padding: 3rem .8rem 2.8rem; border: 1px solid var(--ink); border-radius: 28px; background: var(--paper); box-shadow: 4px 4px 0 var(--keyboard-preview-depth); }
   .phone-speaker { position: absolute; top: 15px; left: 50%; transform: translateX(-50%); width: 45px; height: 5px; border-radius: 9px; background: var(--ink); opacity: .7; }
   .phone-home { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); width: 65px; height: 3px; border-radius: 9px; background: var(--ink); opacity: .45; }
   .practice-accordion { display: grid; gap: .65rem; }
   .practice-item { overflow: hidden; border: 1px solid var(--ink); border-radius: 4px; }
   .practice-label { display: flex; align-items: center; gap: .55rem; }
   .practice-label svg { flex: none; }
   .trick-help kbd { padding: .1rem .3rem; border: 1px solid var(--code-edge); border-radius: 3px; color: var(--ink); font: 12px var(--font-mono); }
   .practice-heading { margin: 0; font-size: var(--step--1); }
   .practice-trigger { display: flex; align-items: center; justify-content: space-between; gap: .7rem; width: 100%; border: 0; background: none; color: var(--ink); padding: .9rem .7rem; font-family: inherit; font-size: 15px; line-height: 1.4; text-align: left; cursor: pointer; }
   .practice-trigger:focus { outline: 1px dashed var(--ink); outline-offset: -4px; background: var(--marker-wash); }
   .practice-trigger > svg { flex: none; transition: transform 140ms ease-out; }
   .practice-trigger[aria-expanded='true'] > svg { transform: rotate(180deg); }
   .practice-content { font-size: var(--step--1); line-height: 1.4; }
   .practice-content-body { padding: .4rem .7rem .8rem; }
  </style>
 </div>;
}
