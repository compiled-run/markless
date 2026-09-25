import { describe, expect, test } from 'vitest';
import {
	type PreloadHelperChunk,
	stripUnusedVitePreloadHelperFromBundle,
} from '../src/build/preload-helper-removal.ts';

const helperModule =
	'var n,r,i,a;function o(){return(o=e((()=>{n=`preload`,r=function(e){return`/`+e},i={},a=function(e,t,n){let r=Promise.resolve();function s(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(()=>e().catch(s))}})))()}';

function helperChunk(extra = ''): PreloadHelperChunk {
	return {
		fileName: 'build/chunk-helper.js',
		code: `import{t as e}from"./chunk-runtime.js";${helperModule}function s(e){return e+1}function c(){return(c=e((()=>{o()})))()}${extra}export{a,o,s as t,c as u};`,
		imports: ['build/chunk-runtime.js'],
	};
}

describe('bundle-wide Vite preload helper removal', () => {
	test('removes the helper module, its exports, imports and init calls once nothing calls it', () => {
		const helper = helperChunk();
		const mixed: PreloadHelperChunk = {
			fileName: 'build/chunk-mixed.js',
			code: 'import{a as t,o as n,t as r}from"./chunk-helper.js";import{t as q}from"./chunk-runtime.js";var x;function l(){return(l=q((()=>{n(),x=r(1)})))()}function f(n){return n()}l();export{f};',
			imports: ['build/chunk-helper.js', 'build/chunk-runtime.js'],
		};
		const onlyHelper: PreloadHelperChunk = {
			fileName: 'build/chunk-only.js',
			code: 'import{a as t,o as n}from"./chunk-helper.js";import{t as q}from"./chunk-runtime.js";function l(){return(l=q((()=>{n()})))()}l();',
			imports: ['build/chunk-helper.js', 'build/chunk-runtime.js'],
		};

		stripUnusedVitePreloadHelperFromBundle([helper, mixed, onlyHelper]);

		expect(helper.code).toBe(
			'import{t as e}from"./chunk-runtime.js";function s(e){return e+1}function c(){return(c=e((()=>{})))()}export{s as t,c as u};',
		);
		expect(mixed.code).toBe(
			'import{t as r}from"./chunk-helper.js";import{t as q}from"./chunk-runtime.js";var x;function l(){return(l=q((()=>{x=r(1)})))()}function f(n){return n()}l();export{f};',
		);
		expect(mixed.imports).toEqual(['build/chunk-helper.js', 'build/chunk-runtime.js']);
		expect(onlyHelper.code).toBe(
			'import{t as q}from"./chunk-runtime.js";function l(){return(l=q((()=>{})))()}l();',
		);
		expect(onlyHelper.imports).toEqual(['build/chunk-runtime.js']);
	});

	test('a pack loader exported as a declaration beside the helper does not block the removal', () => {
		const helper = helperChunk('export function $mlAb12(){return c()}');

		stripUnusedVitePreloadHelperFromBundle([helper]);

		expect(helper.code).toBe(
			'import{t as e}from"./chunk-runtime.js";function s(e){return e+1}function c(){return(c=e((()=>{})))()}export function $mlAb12(){return c()}export{s as t,c as u};',
		);
	});

	test('a declared export that reads the preload function keeps the helper', () => {
		const helper = helperChunk('export function $mlAb12(){return a}');
		const before = helper.code;

		stripUnusedVitePreloadHelperFromBundle([helper]);

		expect(helper.code).toBe(before);
	});

	test('keeps the whole bundle when any chunk still calls the preload function', () => {
		const helper = helperChunk();
		const caller: PreloadHelperChunk = {
			fileName: 'build/chunk-caller.js',
			code: 'import{a as t,o as n}from"./chunk-helper.js";n();async function load(){return t(()=>import("./route.js"),["route.css"],import.meta.url)}export{load};',
		};
		const before = [helper.code, caller.code];

		stripUnusedVitePreloadHelperFromBundle([helper, caller]);

		expect([helper.code, caller.code]).toEqual(before);
	});

	test('keeps the whole bundle when a dynamic import of the helper chunk reads a removed export', () => {
		const helper = helperChunk();
		const lazy: PreloadHelperChunk = {
			fileName: 'build/chunk-lazy.js',
			code: 'async function load(){return import("./chunk-helper.js").then(e=>(e.o(),e.t))}export{load};',
		};
		const before = [helper.code, lazy.code];

		stripUnusedVitePreloadHelperFromBundle([helper, lazy]);

		expect([helper.code, lazy.code]).toEqual(before);
	});

	test('a dynamic import reading only kept exports does not block the removal', () => {
		const helper = helperChunk();
		const lazy: PreloadHelperChunk = {
			fileName: 'build/chunk-lazy.js',
			code: 'async function load(){return import("./chunk-helper.js").then(e=>(e.u(),e.t))}export{load};',
		};

		stripUnusedVitePreloadHelperFromBundle([helper, lazy]);

		expect(helper.code).not.toContain('vite:preloadError');
		expect(lazy.code).toBe(
			'async function load(){return import("./chunk-helper.js").then(e=>(e.u(),e.t))}export{load};',
		);
	});

	test('an init alias passed as a value is not a removable call, so nothing is removed', () => {
		const helper = helperChunk();
		const holder: PreloadHelperChunk = {
			fileName: 'build/chunk-holder.js',
			code: 'import{o as n}from"./chunk-helper.js";const inits=[n];export{inits};',
		};
		const before = [helper.code, holder.code];

		stripUnusedVitePreloadHelperFromBundle([helper, holder]);

		expect([helper.code, holder.code]).toEqual(before);
	});

	test('a helper chunk that calls its own preload function stays as it was', () => {
		const helper = helperChunk(
			'async function load(){return a(()=>import("./route.js"),["route.css"])}',
		);
		const before = helper.code;

		stripUnusedVitePreloadHelperFromBundle([helper]);

		expect(helper.code).toBe(before);
	});
});
