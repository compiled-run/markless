import { keys } from '../ui-meta/keys.ts';
import { shortcutFor } from './model.ts';

export const accordionTricks = [
 { title: 'Go to the next section', prompt: 'Use the down arrow to select Styling.', commands: ['ArrowDown'], caps: [keys.down], target: '1', start: '0', mode: 'focus', open: '', initial: '' },
 { title: 'Go to the previous section', prompt: 'Use the up arrow to select Components.', commands: ['ArrowUp'], caps: [keys.up], target: '0', start: '1', mode: 'focus', open: '', initial: '' },
 { title: 'Jump to the last section', prompt: 'Select Keyboard in one move.', commands: ['End'], caps: [keys.end], target: '2', start: '0', mode: 'focus', open: '', initial: '' },
 { title: 'Open a section', prompt: 'Open Keyboard to read what’s inside.', commands: ['Enter', ' '], caps: [keys.enter, keys.space], target: '2', start: '2', mode: 'toggle', open: 'keyboard', initial: '' },
 { title: 'Close a section', prompt: 'Close Keyboard again.', commands: ['Enter', ' '], caps: [keys.enter, keys.space], target: '2', start: '2', mode: 'toggle', open: '', initial: 'keyboard' },
 { title: 'Jump to the first section', prompt: 'Return to Components in one move.', commands: ['Home'], caps: [keys.home], target: '0', start: '2', mode: 'focus', open: '', initial: '' },
].map(trick => ({ ...trick, mac: shortcutFor(trick.caps, 'or', 'mac').label, windows: shortcutFor(trick.caps, 'or', 'windows').label, linux: shortcutFor(trick.caps, 'or', 'linux').label }));

export function landedTrick(trick: typeof accordionTricks[number], command: string, focused: string, open: string): boolean {
 return trick.commands.includes(command) && focused === trick.target && (trick.mode === 'focus' || open === trick.open);
}
