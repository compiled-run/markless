import { describe, expect, test } from 'vitest';
import {
	definedPreloadHelpers,
	stripEmptyVitePreloadWrappers,
} from '../src/build/preload-cleanup.ts';
import { stripUnusedVitePreloadHelperFromBundle } from '../src/build/preload-helper-removal.ts';

// The per-chunk strip unwraps the calls; the bundle-wide pass then drops the helper module nothing calls.
async function strippedWithHelper(code: string): Promise<string> {
	const chunk = {
		fileName: 'build/chunk-a.js',
		code: stripEmptyVitePreloadWrappers(code, definesHelper('p')),
		imports: [],
	};
	await stripUnusedVitePreloadHelperFromBundle([chunk]);
	return chunk.code;
}

// The bundle pass names the helper its own chunk defines from the chunk that renders Vite's helper module.
const definesHelper = (local: string) => ({
	fileName: 'build/chunk-a.js',
	helpers: [{ fileName: 'build/chunk-a.js', locals: [local], exports: [] }],
});

describe('Vite preload cleanup', () => {
	test('removes empty dynamic import preload wrappers without touching the import', () => {
		const code =
			'import{__vitePreload as p}from"./preload.js";async function load(id){switch(id){case"symbol:0":return p(()=>import("./chunk-a.js").then((mod)=>mod.symbol_0),[]);case"symbol:1":return p(()=>import("./chunk-b.js").then((mod)=>mod.symbol_1),[],import.meta.url)}}';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__vitePreload as p}from"./preload.js";async function load(id){switch(id){case"symbol:0":return import("./chunk-a.js").then((mod)=>mod.symbol_0);case"symbol:1":return import("./chunk-b.js").then((mod)=>mod.symbol_1)}}',
		);
	});

	// Packing turns a same-chunk import() into a resolved promise or an async loader call, and Vite
	// writes no dependencies as `void 0`.
	test('removes empty preload wrappers around packed same-chunk imports', () => {
		const code =
			'import{__vitePreload as p}from"./preload.js";const a=()=>p(()=>Promise.resolve().then(()=>(init(),ns)),void 0);const b=()=>p(()=>(async()=>(await 0,__marklessPackedAb12()))(),void 0);const c=()=>p(()=>import("./pack.js").then(m=>m.__marklessPackedCd34()),[]);';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__vitePreload as p}from"./preload.js";const a=()=>Promise.resolve().then(()=>(init(),ns));const b=()=>(async()=>(await 0,__marklessPackedAb12()))();const c=()=>import("./pack.js").then(m=>m.__marklessPackedCd34());',
		);
	});

	test('removes empty preload wrappers around registry pack loads', () => {
		const code =
			'import{__vitePreload as i}from"./preload.js";const a=()=>i(()=>$(`./chunk-a.js`,`$mlLNhe`,()=>import(`./chunk-a.js`)),[]);const b=()=>i(()=>load("./b.js","$mlW8LC",()=>import("./b.js")),void 0);';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__vitePreload as i}from"./preload.js";const a=()=>$(`./chunk-a.js`,`$mlLNhe`,()=>import(`./chunk-a.js`));const b=()=>load("./b.js","$mlW8LC",()=>import("./b.js"));',
		);
	});

	test('keeps a pack-load-shaped call whose second argument is not a pack loader', () => {
		const code = 'const a=()=>i(()=>$(`./chunk-a.js`,`other`,()=>import(`./chunk-a.js`)),[]);';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(code);
	});

	test('keeps a void-deps call that does not wrap an import', () => {
		const code = 'const later=()=>p(()=>compute(),void 0);';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(code);
	});

	test('keeps non-empty preload wrappers so dependency preloading still works', () => {
		const code =
			'import{__vitePreload as p}from"./preload.js";const route=()=>p(()=>import("./route.js").then((mod)=>mod.default),["route.css"],import.meta.url);';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(code);
	});

	// Removing the then-unused helper is the bundle-wide pass's job (preload-helper-removal.test.ts).
	test('unwraps a call to the helper the chunk defines, leaving the helper to the bundle-wide pass', () => {
		const helper =
			'import{__esmMin as e}from"./shared.js";var A=e((()=>{})),O,k,S,p,M=e((()=>{O=(function(){let e=typeof document<`u`&&document.createElement(`link`).relList;return e&&e.supports&&e.supports(`modulepreload`)?`modulepreload`:`preload`})(),k=function(e){return`/`+e},S={},p=function(e,t,n){let r=Promise.resolve();function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>e().catch(i))}}));';
		const code = `${helper}async function load(id){return p(()=>import("./chunk.js").then(e=>e.symbol),[],import.meta.url)}var F=e((()=>{M()})),I=e((()=>{F()}));e((()=>{A(),I()}))();`;

		expect(stripEmptyVitePreloadWrappers(code, definesHelper('p'))).toBe(
			`${helper}async function load(id){return import("./chunk.js").then(e=>e.symbol)}var F=e((()=>{M()})),I=e((()=>{F()}));e((()=>{A(),I()}))();`,
		);
	});

	test('removes an imported Vite preload helper when no wrappers remain', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";import{__vitePreload as t,init_preload_helper as n}from"./preload.js";async function load(){return import("./chunk.js")}function t(e){return e}var A=e((()=>{n()})),B=e((()=>{A()})),C=e((()=>{n(),d=["./symbol.js"]}));e((()=>{B(),C()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__esmMin as e}from"./shared.js";async function load(){return import("./chunk.js")}function t(e){return e}var A=e((()=>{})),B=e((()=>{A()})),C=e((()=>{d=["./symbol.js"]}));e((()=>{B(),C()}))();',
		);
	});

	test('removes imported Vite preload helper init calls from the middle of module init sequences', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";import{__vitePreload as t,init_preload_helper as n}from"./preload.js";var f=e((()=>{})),m=e((()=>{})),v=e((()=>{f(),m(),n(),g=["./symbol.js"]}));e((()=>{v()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__esmMin as e}from"./shared.js";var f=e((()=>{})),m=e((()=>{})),v=e((()=>{f(),m(),g=["./symbol.js"]}));e((()=>{v()}))();',
		);
	});

	test('removes an imported Vite preload helper regardless of import specifier order', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";import{init_preload_helper as n,__vitePreload as t}from"./preload.js";async function load(){return import("./chunk.js")}var A=e((()=>{n()}));e((()=>{A()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__esmMin as e}from"./shared.js";async function load(){return import("./chunk.js")}var A=e((()=>{}));e((()=>{A()}))();',
		);
	});

	test('removes an imported Vite preload helper call in the middle of an init block', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";import{__vitePreload as t,init_preload_helper as n}from"./preload.js";async function load(){return import("./chunk.js")}var m,h=e((()=>{f(),n(),m=()=>import("./symbols.js")}));e((()=>{h()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__esmMin as e}from"./shared.js";async function load(){return import("./chunk.js")}var m,h=e((()=>{f(),m=()=>import("./symbols.js")}));e((()=>{h()}))();',
		);
	});
	test('removes unminified Vite preload helper init calls written as their own statements', () => {
		const code = [
			'import { rF as init_resume_locators } from "@markless/c/5DN-Wwks";',
			'import { __vitePreload, init_preload_helper } from "@markless/c/_C2pHzSj";',
			'var held;',
			'function init_canonical() {',
			'\treturn (init_canonical = __esmMin((() => {',
			'\t\tinit_resume_locators();',
			'\t\tinit_preload_helper();',
			'\t\theld = new Map();',
			'\t\tif (held.size) init_preload_helper();',
			'\t})))();',
			'}',
			'init_canonical();',
		].join('\n');

		const stripped = stripEmptyVitePreloadWrappers(code);
		expect(stripped).not.toContain('init_preload_helper');
		expect(stripped).toContain('\t\tinit_resume_locators();\n\t\t\n\t\theld = new Map();');
		expect(stripped).toContain('if (held.size) ;');
	});

	test('keeps an imported Vite preload helper whose init call is not a statement of its own', () => {
		const code = [
			'import { __vitePreload, init_preload_helper } from "./preload.js";',
			'var ready = init_preload_helper();',
		].join('\n');

		expect(stripEmptyVitePreloadWrappers(code)).toBe(code);
	});

	test('keeps other bindings imported beside a removed Vite preload helper', () => {
		const code =
			'import{__vitePreload as t,init_pending as r,init_preload_helper as n,settle as s}from"./shared.js";import{__esmMin as e}from"./runtime.js";async function load(){return import("./chunk.js")}var A=e((()=>{n(),r()}));async function hold(v){return s(v)}e((()=>{A()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{init_pending as r,settle as s}from"./shared.js";import{__esmMin as e}from"./runtime.js";async function load(){return import("./chunk.js")}var A=e((()=>{r()}));async function hold(v){return s(v)}e((()=>{A()}))();',
		);
	});

	test('keeps an imported Vite preload helper when the preload function is still called', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";import{init_preload_helper as n,__vitePreload as t}from"./preload.js";async function load(){return t(()=>import("./chunk.js"),["chunk.css"],import.meta.url)}var A=e((()=>{n()}));e((()=>{A()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(code);
	});

	test('keeps an imported Vite preload helper that its removal would join into a call', () => {
		const code =
			'var q=t\nimport{__vitePreload as t,init_preload_helper as n}from"./preload.js"\n(0);n();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(code);
	});

	test('removes empty preload wrappers around async fallback loaders', async () => {
		const code =
			'import{__esmMin as e}from"./shared.js";var O,k,S,p,M=e((()=>{O=(function(){let e=typeof document<`u`&&document.createElement(`link`).relList;return e&&e.supports&&e.supports(`modulepreload`)?`modulepreload`:`preload`})(),k=function(e){return`/`+e},S={},p=function(e,t,n){let r=Promise.resolve();function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>e().catch(i))}}));async function load(){let{createRuntimeGraph:e}=await p(async()=>{let{createRuntimeGraph:e}=await import("./graph.js");return{createRuntimeGraph:e}},[]);return e({cells:[]})}var F=e((()=>{M()})),I=e((()=>{F()}));e((()=>{I()}))();';

		expect(await strippedWithHelper(code)).toBe(
			'import{__esmMin as e}from"./shared.js";async function load(){let{createRuntimeGraph:e}=await (async()=>{let{createRuntimeGraph:e}=await import("./graph.js");return{createRuntimeGraph:e}})();return e({cells:[]})}var F=e((()=>{})),I=e((()=>{F()}));e((()=>{I()}))();',
		);
	});

	test('removes helper module init calls left inside other minified modules', async () => {
		const code =
			'import{__esmMin as e}from"./shared.js";var T=e((()=>{})),O,k,S,p,A=e((()=>{O=(function(){let e=typeof document<`u`&&document.createElement(`link`).relList;return e&&e.supports&&e.supports(`modulepreload`)?`modulepreload`:`preload`})(),k=function(e){return`/`+e},S={},p=function(e,t,n){let r=Promise.resolve();function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>e().catch(i))}}));async function load(){let{createRuntimeGraph:e}=await p(async()=>{let{createRuntimeGraph:e}=await import("./graph.js");return{createRuntimeGraph:e}},[]);return e({cells:[]})}var z=e((()=>{T(),A()})),B=e((()=>{z()})),H=e((()=>{})),G=e((()=>{A()})),K=e((()=>{H(),G()}));e((()=>{B(),K()}))();';

		expect(await strippedWithHelper(code)).toBe(
			'import{__esmMin as e}from"./shared.js";var T=e((()=>{}));async function load(){let{createRuntimeGraph:e}=await (async()=>{let{createRuntimeGraph:e}=await import("./graph.js");return{createRuntimeGraph:e}})();return e({cells:[]})}var z=e((()=>{T()})),B=e((()=>{z()})),H=e((()=>{})),G=e((()=>{})),K=e((()=>{H(),G()}));e((()=>{B(),K()}))();',
		);
	});

	test('reads shadowing from scopes: a parameter named like the helper is not a call to it', () => {
		const preamble = 'const __vite__mapDeps=(i)=>i;\n//# allFunctionsCalledOnLoad\n';
		const shadowed = `${preamble}import{__vitePreload as p,init_preload_helper as n}from"./preload.js";function run(p){return p()}var A=e((()=>{n()}));`;
		const free = `${preamble}import{__vitePreload as p,init_preload_helper as n}from"./preload.js";function run(q){return p(()=>q(),["a.css"])}var A=e((()=>{n()}));`;

		expect(stripEmptyVitePreloadWrappers(shadowed)).toBe(
			`${preamble}function run(p){return p()}var A=e((()=>{}));`,
		);
		expect(stripEmptyVitePreloadWrappers(free)).toBe(free);
	});

	// A minifier reuses a short name in an inner scope that never reads the outer binding; the removal must not reach it.
	test('keeps a call to a local that shadows the removed helper init', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";import{__vitePreload as t,init_preload_helper as l}from"./preload.js";function open(d,n){let c=g(),l=h(n);d.cleanup=()=>{n.remove(),l(),c(),d.done=!0}}var A=e((()=>{f(),l(),m=["./symbol.js"]}));e((()=>{A()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__esmMin as e}from"./shared.js";function open(d,n){let c=g(),l=h(n);d.cleanup=()=>{n.remove(),l(),c(),d.done=!0}}var A=e((()=>{f(),m=["./symbol.js"]}));e((()=>{A()}))();',
		);
	});

	test('keeps a call to a local that shadows the removed helper module init', async () => {
		const helper =
			'A=e((()=>{O=(function(){let e=typeof document<`u`&&document.createElement(`link`).relList;return e&&e.supports&&e.supports(`modulepreload`)?`modulepreload`:`preload`})(),k=function(e){return`/`+e},S={},p=function(e,t,n){let r=Promise.resolve();function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>e().catch(i))}}))';
		const code = `import{__esmMin as e}from"./shared.js";var T=e((()=>{})),O,k,S,p,${helper};async function load(){let{run:e}=await p(async()=>{let{run:e}=await import("./graph.js");return{run:e}},[]);return e()}function close(d){let A=d.undo;d.cleanup=()=>{d.x(),A(),d.y()}}var z=e((()=>{T(),A()}));e((()=>{z()}))();`;

		expect(await strippedWithHelper(code)).toBe(
			'import{__esmMin as e}from"./shared.js";var T=e((()=>{}));async function load(){let{run:e}=await (async()=>{let{run:e}=await import("./graph.js");return{run:e}})();return e()}function close(d){let A=d.undo;d.cleanup=()=>{d.x(),A(),d.y()}}var z=e((()=>{T()}));e((()=>{z()}))();',
		);
	});

	test('keeps the imported helper when its init is called where removing the call would change an expression', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";import{__vitePreload as t,init_preload_helper as n}from"./preload.js";var A=e((()=>{f(n())}));e((()=>{A()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(code);
	});

	test('keeps calls to a loop variable or catch parameter named like the removed helper init', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";import{__vitePreload as t,init_preload_helper as l}from"./preload.js";function run(q){for(let l of q)g(),l(),h();try{g()}catch(l){g(),l(),h()}}var A=e((()=>{f(),l(),m=["./symbol.js"]}));e((()=>{A()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__esmMin as e}from"./shared.js";function run(q){for(let l of q)g(),l(),h();try{g()}catch(l){g(),l(),h()}}var A=e((()=>{f(),m=["./symbol.js"]}));e((()=>{A()}))();',
		);
	});

	test('removes the helper init called inside a catch whose pattern has a key named like it', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";import{__vitePreload as t,init_preload_helper as n}from"./preload.js";function run(){try{g()}catch({n:r}){g(),n(),h(r)}}var A=e((()=>{f(),n()}));e((()=>{A()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__esmMin as e}from"./shared.js";function run(){try{g()}catch({n:r}){g(),h(r)}}var A=e((()=>{f()}));e((()=>{A()}))();',
		);
	});

	test('keeps a method called through a sequence without its receiver', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";import{__vitePreload as t,init_preload_helper as n}from"./preload.js";var A=e((()=>{(n(),o.m)()}));e((()=>{A()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__esmMin as e}from"./shared.js";var A=e((()=>{(0,o.m)()}));e((()=>{A()}))();',
		);
	});

	test('keeps a call to a var declared in a loop head and read after the loop', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";import{__vitePreload as t,init_preload_helper as n}from"./preload.js";function run(q){for(var n=q.next;0;);g(),n(),h()}var A=e((()=>{f(),n()}));e((()=>{A()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__esmMin as e}from"./shared.js";function run(q){for(var n=q.next;0;);g(),n(),h()}var A=e((()=>{f()}));e((()=>{A()}))();',
		);
	});

	test('keeps the value of a sequence the helper init ends', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";import{__vitePreload as t,init_preload_helper as n}from"./preload.js";var get=()=>(f(),n()),A=e((()=>{n()}));e((()=>{A()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__esmMin as e}from"./shared.js";var get=()=>(f(),void 0),A=e((()=>{}));e((()=>{A()}))();',
		);
	});

	test('keeps a typeof of a sequence reading its operand as a value', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";import{__vitePreload as t,init_preload_helper as n}from"./preload.js";var A=e((()=>{k=typeof(n(),maybeGlobal)}));e((()=>{A()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__esmMin as e}from"./shared.js";var A=e((()=>{k=typeof(0,maybeGlobal)}));e((()=>{A()}))();',
		);
	});

	// Only a call to Vite's helper is a preload wrapper; a user's call of the same shape keeps running.
	test('keeps a call shaped like an empty preload wrapper whose callee is not the helper', () => {
		const code =
			'import{__vitePreload as p}from"./preload.js";const a=()=>p(()=>import("./a.js"),[]);function f(m){return m(()=>import("./b.js"),[])}const c=useMemo(()=>import("./c.js"),void 0);';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__vitePreload as p}from"./preload.js";const a=()=>import("./a.js");function f(m){return m(()=>import("./b.js"),[])}const c=useMemo(()=>import("./c.js"),void 0);',
		);
	});

	// Without native packing Rolldown minifies the names chunks export, so the helper arrives as `{E as i}`.
	test('unwraps calls to the helper another chunk exports under a minified name', () => {
		const helperChunk =
			'function l(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}function s(e,t,n){let r=Promise.resolve();return r.then(t=>e().catch(l))}function c(e){return e}export{c as D,s as E};';
		expect(definedPreloadHelpers(helperChunk)).toEqual(['s']);
		const code =
			'import{D as r,E as i}from"./chunk-h.js";const a=()=>i(()=>import(`./a.js`),[]);const b=()=>r(()=>import(`./b.js`),[]);';

		expect(
			stripEmptyVitePreloadWrappers(code, {
				fileName: 'build/chunk-u.js',
				helpers: [{ fileName: 'build/chunk-h.js', locals: ['s'], exports: ['E'] }],
			}),
		).toBe(
			'import{D as r,E as i}from"./chunk-h.js";const a=()=>import(`./a.js`);const b=()=>r(()=>import(`./b.js`),[]);',
		);
	});

	test('unwraps an empty wrapper inside another, and the rest of the chunk with them', () => {
		const code =
			'import{__vitePreload as p}from"./preload.js";const a=()=>p(()=>import("./a.js").then(m=>m.boot(()=>p(()=>import("./b.js"),[]))),[]);const c=()=>p(()=>import("./c.js"),void 0);';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__vitePreload as p}from"./preload.js";const a=()=>import("./a.js").then(m=>m.boot(()=>import("./b.js")));const c=()=>import("./c.js");',
		);
	});

	test('keeps a wrapper whose deps argument runs code', () => {
		const code =
			'import{__vitePreload as p}from"./preload.js";const a=()=>p(()=>import("./a.js"),void recordLoad());';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(code);
	});

	test('leaves a function that only resembles the helper alone without the chunk rendering Vite’s helper module', () => {
		const code =
			'function recover(e,t){window.dispatchEvent(new Event(`vite:preloadError`));return e()}const a=()=>recover(()=>import("./a.js"),[]);';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(code);
	});
});
