import { describe, expect, it } from 'vitest';
import { keys } from '../ui-meta/keys.ts';
import { detectPlatform, keyboardLayouts, shortcutFor, matchesShortcut, commandForKey } from './model.ts';

describe('interactive keyboard', () => {
 it('detects device platforms with a user-agent fallback', () => {
  expect(detectPlatform('macOS', '')).toBe('mac');
  expect(detectPlatform('Win32', '')).toBe('windows');
  expect(detectPlatform('Linux x86_64', '')).toBe('linux');
  expect(detectPlatform('iPad', '')).toBe('mac');
  expect(detectPlatform('', 'Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe('mac');
  expect(detectPlatform('', '')).toBe('windows');
 });
 it('expands compact Mac navigation into physical key combinations', () => {
  expect(shortcutFor([keys.home], 'or', 'mac').keys).toEqual(['Fn', 'ArrowLeft']);
  expect(shortcutFor([keys.pageDown], 'or', 'mac').keys).toEqual(['Fn', 'ArrowDown']);
  expect(shortcutFor([keys.home], 'or', 'windows').keys).toEqual(['Home']);
 });
 it('distinguishes alternatives from chords and respects the platform modifier', () => {
  expect(shortcutFor([keys.enter, keys.space], 'or', 'mac').label).toBe('Return or Space');
  const letter = {mac:{symbol:'A',label:'A'},other:{symbol:'A',label:'A'}};
  expect(shortcutFor([keys.mod,letter], '+', 'mac').keys).toEqual(['Meta','KeyA']);
  expect(shortcutFor([keys.mod,letter], '+', 'linux').keys).toEqual(['Control','KeyA']);
  expect(shortcutFor([keys.shift,keys.home], '+', 'mac').keys).toEqual(['Shift','Fn','ArrowLeft']);
 });
 it('maps the documented caps to visible keys in each layout', () => {
  for(const layout of keyboardLayouts) {
   const ids = new Set(layout.keys.map(key=>key.code));
   for(const cap of Object.values(keys)) for(const code of shortcutFor([cap],'or',layout.id).keys) expect(ids.has(code),`${layout.id}: ${code}`).toBe(true);
   expect(layout.keys.filter(key=>/^Key[A-Z]$/.test(key.code))).toHaveLength(26);
   expect(layout.keys.every(key=>key.x>=0 && key.x+key.width<=layout.width && key.y+key.height<=layout.height)).toBe(true);
  }
 });
 it('uses native modifier legends in the Mac keyboard and combinations', () => {
  const mac = keyboardLayouts.find(layout => layout.id === 'mac');
  expect(mac?.keys.find(key => key.code === 'Control')?.label).toBe('⌃ ctrl');
  expect(mac?.keys.find(key => key.code === 'Alt')?.label).toBe(keys.option.mac.symbol);
  expect(shortcutFor([keys.option, keys.right], '+', 'mac').label).toBe('⌥ + →');
  expect(shortcutFor([keys.control, keys.right], '+', 'windows').label).toBe('Ctrl + →');
 });
});

it('matches pressed shortcuts without treating alternative keys as a chord', () => {
 const event = {key:'Enter',ctrlKey:false,altKey:false,metaKey:false,shiftKey:false};
 expect(matchesShortcut(shortcutFor([keys.enter,keys.space],'or','mac'),event,'mac')).toBe(true);
 expect(matchesShortcut(shortcutFor([keys.home],'or','mac'),{...event,key:'Home'},'mac')).toBe(true);
 expect(matchesShortcut(shortcutFor([keys.down],'or','windows'),{...event,key:'ArrowDown',ctrlKey:true},'windows')).toBe(false);
 expect(commandForKey('ArrowLeft',true)).toBe('Home');
 expect(commandForKey('ArrowDown',false)).toBe('ArrowDown');
 expect(commandForKey('KeyN',false)).toBe('n');
});
