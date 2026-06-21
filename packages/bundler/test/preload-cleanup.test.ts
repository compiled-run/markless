import { describe, expect, test } from 'vitest';
import { stripEmptyVitePreloadWrappers } from '../src/build/preload-cleanup.ts';

describe('Vite preload cleanup', () => {
	test('removes empty dynamic import preload wrappers without touching the import', () => {
		const code =
			'async function load(id){switch(id){case"symbol:0":return p(()=>import("./chunk-a.js").then((mod)=>mod.symbol_0),[]);case"symbol:1":return p(()=>import("./chunk-b.js").then((mod)=>mod.symbol_1),[],import.meta.url)}}';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'async function load(id){switch(id){case"symbol:0":return import("./chunk-a.js").then((mod)=>mod.symbol_0);case"symbol:1":return import("./chunk-b.js").then((mod)=>mod.symbol_1)}}',
		);
	});

	test('keeps non-empty preload wrappers so dependency preloading still works', () => {
		const code =
			'const route=()=>p(()=>import("./route.js").then((mod)=>mod.default),["route.css"],import.meta.url);';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(code);
	});

	test('removes the unused minified Vite helper after empty wrappers are gone', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";var A=e((()=>{})),O,k,S,p,M=e((()=>{O=(function(){let e=typeof document<`u`&&document.createElement(`link`).relList;return e&&e.supports&&e.supports(`modulepreload`)?`modulepreload`:`preload`})(),k=function(e){return`/`+e},S={},p=function(e,t,n){let r=Promise.resolve();function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>e().catch(i))}}));async function load(id){return p(()=>import("./chunk.js").then(e=>e.symbol),[],import.meta.url)}var F=e((()=>{M()})),I=e((()=>{F()}));e((()=>{A(),I()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__esmMin as e}from"./shared.js";var A=e((()=>{}));async function load(id){return import("./chunk.js").then(e=>e.symbol)}e((()=>{A()}))();',
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

	test('keeps an imported Vite preload helper when the preload function is still called', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";import{init_preload_helper as n,__vitePreload as t}from"./preload.js";async function load(){return t(()=>import("./chunk.js"),["chunk.css"],import.meta.url)}var A=e((()=>{n()}));e((()=>{A()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(code);
	});

	test('removes empty preload wrappers around async fallback loaders', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";var O,k,S,p,M=e((()=>{O=(function(){let e=typeof document<`u`&&document.createElement(`link`).relList;return e&&e.supports&&e.supports(`modulepreload`)?`modulepreload`:`preload`})(),k=function(e){return`/`+e},S={},p=function(e,t,n){let r=Promise.resolve();function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>e().catch(i))}}));async function load(){let{createRuntimeGraph:e}=await p(async()=>{let{createRuntimeGraph:e}=await import("./graph.js");return{createRuntimeGraph:e}},[]);return e({cells:[]})}var F=e((()=>{M()})),I=e((()=>{F()}));e((()=>{I()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__esmMin as e}from"./shared.js";async function load(){let{createRuntimeGraph:e}=await (async()=>{let{createRuntimeGraph:e}=await import("./graph.js");return{createRuntimeGraph:e}})();return e({cells:[]})}e((()=>{}))();',
		);
	});

	test('removes helper module init calls left inside other minified modules', () => {
		const code =
			'import{__esmMin as e}from"./shared.js";var T=e((()=>{})),O,k,S,p,A=e((()=>{O=(function(){let e=typeof document<`u`&&document.createElement(`link`).relList;return e&&e.supports&&e.supports(`modulepreload`)?`modulepreload`:`preload`})(),k=function(e){return`/`+e},S={},p=function(e,t,n){let r=Promise.resolve();function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>e().catch(i))}}));async function load(){let{createRuntimeGraph:e}=await p(async()=>{let{createRuntimeGraph:e}=await import("./graph.js");return{createRuntimeGraph:e}},[]);return e({cells:[]})}var z=e((()=>{T(),A()})),B=e((()=>{z()})),H=e((()=>{})),G=e((()=>{A()})),K=e((()=>{H(),G()}));e((()=>{B(),K()}))();';

		expect(stripEmptyVitePreloadWrappers(code)).toBe(
			'import{__esmMin as e}from"./shared.js";var T=e((()=>{}));async function load(){let{createRuntimeGraph:e}=await (async()=>{let{createRuntimeGraph:e}=await import("./graph.js");return{createRuntimeGraph:e}})();return e({cells:[]})}var z=e((()=>{T()})),B=e((()=>{z()})),H=e((()=>{})),G=e((()=>{})),K=e((()=>{H(),G()}));e((()=>{B(),K()}))();',
		);
	});
});
