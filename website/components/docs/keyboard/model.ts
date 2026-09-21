import { keys, type KeyCap } from '../ui-meta/keys.ts';

export type KeyboardPlatform = 'mac' | 'windows' | 'linux';
export type PhysicalKey = { readonly id: string; readonly code: string; readonly label: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export function detectPlatform(platform: string, userAgent: string): KeyboardPlatform {
 const device = platform || userAgent;
 return /mac|iphone|ipad|ipod/i.test(device) ? 'mac' : /linux|android|cros/i.test(device) ? 'linux' : 'windows';
}

const aliases: Readonly<Record<string, string>> = {
 Enter: 'Enter', Return: 'Enter', Space: 'Space', Tab: 'Tab', Escape: 'Escape', Esc: 'Escape', Backspace: 'Backspace', Delete: 'Delete',
 'Up arrow': 'ArrowUp', 'Down arrow': 'ArrowDown', 'Left arrow': 'ArrowLeft', 'Right arrow': 'ArrowRight',
 '↑': 'ArrowUp', '↓': 'ArrowDown', '←': 'ArrowLeft', '→': 'ArrowRight',
 Home: 'Home', End: 'End', 'Page Up': 'PageUp', 'Page Down': 'PageDown',
 Shift: 'Shift', Command: 'Meta', '⌘': 'Meta', Control: 'Control', Ctrl: 'Control', Option: 'Alt', Alt: 'Alt', Fn: 'Fn',
};
const compact: Readonly<Record<string, readonly string[]>> = { Home: ['Fn', 'ArrowLeft'], End: ['Fn', 'ArrowRight'], PageUp: ['Fn', 'ArrowUp'], PageDown: ['Fn', 'ArrowDown'], Delete: ['Fn', 'Backspace'] };
const spoken: Readonly<Record<string, string>> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', PageUp: 'Page Up', PageDown: 'Page Down', Control: 'Ctrl', Alt: 'Alt', Meta: 'Super' };

export function shortcutFor(caps: readonly KeyCap[], join: string, platform: KeyboardPlatform) {
 const combinations = caps.map(cap => {
  const label = platform === 'mac' ? cap.mac.label : cap.other.label;
  const code = aliases[label] ?? (/^[a-z]$/i.test(label) ? `Key${label.toUpperCase()}` : /^[0-9]$/.test(label) ? `Digit${label}` : label);
  return platform === 'mac' ? compact[code] ?? [code] : [code];
 });
 const labelFor = (code: string) => platform === 'mac' && code === 'Meta' ? '⌘' : platform === 'mac' && code === 'Alt' ? keys.option.mac.symbol : platform === 'mac' && code === 'Enter' ? 'Return' : spoken[code] ?? code.replace(/^(Key|Digit)/, '');
 return {
  chords: join === '+' ? [[...new Set(combinations.flat())]] : combinations,
  keys: [...new Set(combinations.flat())],
  label: combinations.map(chord => chord.map(labelFor).join(' + ')).join(join === '+' ? ' + ' : ' or '),
  hint: join !== '+' && caps.length > 1 ? 'Use either highlighted option.' : combinations.flat().length > 1 ? 'Press the highlighted keys together.' : 'Press the highlighted key.',
 };
}

type KeySpec = readonly [code: string, label: string, units?: number];
function layoutFor(id: KeyboardPlatform) {
 const result: PhysicalKey[] = [];
 const add = (code: string, label: string, x: number, y: number, units = 1, height = 38) => result.push({id:`${id}-${result.length}`,code,label,x,y,width:units*44-4,height});
 const row = (y: number, specs: readonly KeySpec[]) => {let x=8;for(const [code,label,units=1] of specs){add(code,label,x,y,units);x+=units*44;}};
 row(8,[['Escape','esc',1.5],...Array.from({length:12},(_,i)=>[`F${i+1}`,`F${i+1}`,1.125] as const)]);
 row(52,[['Backquote','`'],...Array.from({length:10},(_,i)=>[`Digit${(i+1)%10}`,String((i+1)%10)] as const),['Minus','−'],['Equal','='],['Backspace',id==='mac'?'delete':'Backspace',2]]);
 row(96,[['Tab','tab',1.5],...'QWERTYUIOP'.split('').map(letter=>[`Key${letter}`,letter] as const),['BracketLeft','['],['BracketRight',']'],['Backslash','\\',1.5]]);
 row(140,[['CapsLock','caps lock',1.75],...'ASDFGHJKL'.split('').map(letter=>[`Key${letter}`,letter] as const),['Semicolon',';'],['Quote',"'"],['Enter',id==='mac'?'return':'Enter',2.25]]);
 row(184,[['Shift',id==='mac'?'⇧':'Shift',2.25],...'ZXCVBNM'.split('').map(letter=>[`Key${letter}`,letter] as const),['Comma',','],['Period','.'],['Slash','/'],['Shift',id==='mac'?'⇧':'Shift',2.75]]);
 if(id==='mac') {
  row(228,[['Fn','fn'],['Control',keys.control.mac.symbol+' ctrl'],['Alt',keys.option.mac.symbol],['Meta','⌘',1.25],['Space','space',5.5],['Meta','⌘',1.25],['Alt',keys.option.mac.symbol]]);
  add('ArrowLeft','←',536,248,1,18);add('ArrowUp','↑',580,228,1,18);add('ArrowDown','↓',580,248,1,18);add('ArrowRight','→',624,248,1,18);
 } else {
  row(228,[['Control','Ctrl',1.25],['Meta',id==='windows'?'⊞':'Super',1.25],['Alt','Alt',1.25],['Space','space',6.25],['Alt','Alt',1.25],['Fn','Fn',1.25],['Control','Ctrl',2.5]]);
  for(const [index,code] of ['Insert','Home','PageUp','Delete','End','PageDown'].entries())add(code,spoken[code]??code,690+(index%3)*44,52+Math.floor(index/3)*44);
  add('ArrowUp','↑',734,184);add('ArrowLeft','←',690,228);add('ArrowDown','↓',734,228);add('ArrowRight','→',778,228);
 }
 return {id,name:id==='mac'?'macOS':id==='windows'?'Windows':'Linux',width:id==='mac'?676:826,height:276,keys:result};
}

export const keyboardLayouts = (['mac','windows','linux'] as const).map(layoutFor);

export function commandForKey(code: string, fn: boolean): string {
 if (!fn) return /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : code;
 return Object.entries(compact).find(([, chord]) => chord.includes(code))?.[0] ?? code;
}

type PressedKey = {readonly key: string;readonly ctrlKey: boolean;readonly altKey: boolean;readonly metaKey: boolean;readonly shiftKey: boolean};

export function pressedKeys(event: PressedKey, platform: KeyboardPlatform): string[] {
 const key = event.key === ' ' ? 'Space' : event.key.length === 1 && /[a-z]/i.test(event.key) ? `Key${event.key.toUpperCase()}` : event.key;
 const pressed = new Set(platform === 'mac' ? compact[key] ?? [key] : [key]);
 if (event.ctrlKey) pressed.add('Control');
 if (event.altKey) pressed.add('Alt');
 if (event.metaKey) pressed.add('Meta');
 if (event.shiftKey) pressed.add('Shift');
 return [...pressed];
}

export function matchesShortcut(shortcut: {readonly chords: readonly (readonly string[])[]}, event: PressedKey, platform: KeyboardPlatform): boolean {
 const pressed = pressedKeys(event, platform);
 return shortcut.chords.some(chord => chord.length === pressed.length && chord.every(code => pressed.includes(code)));
}
