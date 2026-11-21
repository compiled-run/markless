import type { NativeScript, NativeScriptService } from '@markless/serializer';
import { DEVICE_CALLS } from '@markless/serializer/native-device';
import {
	NATIVE_SCRIPT_POINTER_FIELDS,
	NATIVE_SCRIPT_SUBMITTED_FORM,
	NATIVE_UNBOUND_HANDLE,
} from '@markless/serializer/native-view';
import { SVG_GEOMETRY_SOURCE } from './native-svg-geometry.ts';

/** One module of a payload's script: its own code, the modules its `__i` slots name, and the functions defined in it. */
export type NativeScriptModuleInput = {
	readonly code: string;
	/** The module each `__i` slot loads, or null for a slot nothing the script keeps reads. */
	readonly imports: ReadonlyArray<number | null>;
	readonly functions: ReadonlyArray<{ readonly id: string; readonly code: string }>;
};

// Installed once per engine and shared by every payload's script; each entry's output buffer is the running script's.
const HOST_SERVICES = String.raw`var host = g.__marklessHost;
if (!host) {
	host = g.__marklessHost = { out: null, timers: {}, nextTimer: 1, requests: {}, nextRequest: 1, nextRun: 1, seed: null, counter: 0 };
	var output = function () {
		if (!host.out) throw new Error('a host service was used outside a handler');
		return host.out;
	};
	var format = function (value) {
		if (typeof value === 'string') return value;
		if (value instanceof Error) return value.name + ': ' + value.message;
		if (value === null || typeof value !== 'object') return String(value);
		try { return JSON.stringify(value); } catch (error) { return String(value); }
	};
	var log = function (level) {
		return function () {
			var parts = [];
			for (var index = 0; index < arguments.length; index++) parts.push(format(arguments[index]));
			output().logs.push([level, parts.join(' ')]);
		};
	};
	g.console = { log: log('log'), info: log('info'), warn: log('warn'), error: log('error'), debug: log('debug') };
	var timer = function (repeat) {
		return function (fn, ms) {
			var args = Array.prototype.slice.call(arguments, 2);
			var id = host.nextTimer++;
			var wait = Math.max(0, Number(ms) || 0);
			host.timers[id] = { fn: fn, args: args, ms: wait, repeat: repeat };
			output().timers.push([id, wait]);
			return id;
		};
	};
	g.setTimeout = timer(false);
	g.setInterval = timer(true);
	g.clearTimeout = g.clearInterval = function (id) {
		if (!host.timers[id]) return;
		delete host.timers[id];
		var out = output();
		var set = out.timers.filter(function (timer) { return timer[0] !== id; });
		// A timer set (or set again) in this same entry never reached the host: dropping it is the whole clear.
		if (set.length !== out.timers.length) out.timers = set;
		else out.clears.push(id);
	};
	// The signal an async value's run gets, as the web's computed(async ({ signal }) => ...) does; not a global.
	var Signal = function () { this.aborted = false; this.reason = undefined; this.onabort = null; this.listeners = []; };
	Signal.prototype.addEventListener = function (type, fn) { if (type === 'abort') this.listeners.push(fn); };
	Signal.prototype.removeEventListener = function (type, fn) { this.listeners = this.listeners.filter(function (other) { return other !== fn; }); };
	Signal.prototype.throwIfAborted = function () { if (this.aborted) throw this.reason; };
	host.signal = function () { return new Signal(); };
	host.abort = function (signal) {
		if (signal.aborted) return;
		var reason = new Error('signal is aborted without reason');
		reason.name = 'AbortError';
		signal.aborted = true;
		signal.reason = reason;
		var event = { type: 'abort', target: signal };
		if (typeof signal.onabort === 'function') signal.onabort(event);
		signal.listeners.slice().forEach(function (fn) { fn.call(signal, event); });
	};
	if (typeof g.queueMicrotask !== 'function') g.queueMicrotask = function (fn) { Promise.resolve().then(fn); };
	var Headers = function (pairs) {
		this.get = function (name) {
			var key = String(name).toLowerCase(), found = [];
			for (var index = 0; index < pairs.length; index++) if (pairs[index][0].toLowerCase() === key) found.push(pairs[index][1]);
			return found.length > 0 ? found.join(', ') : null;
		};
		this.has = function (name) { return this.get(name) !== null; };
		this.forEach = function (fn) { for (var index = 0; index < pairs.length; index++) fn(pairs[index][1], pairs[index][0].toLowerCase()); };
	};
	var Response = function (answer, url) {
		var body = answer.body;
		this.status = answer.status;
		this.statusText = answer.statusText;
		this.ok = answer.status >= 200 && answer.status < 300;
		this.url = url;
		this.headers = new Headers(answer.headers);
		this.text = function () { return Promise.resolve(body); };
		this.json = function () { return Promise.resolve().then(function () { return JSON.parse(body); }); };
	};
	g.fetch = function (input, init) {
		return new Promise(function (resolve, reject) {
			var url = typeof input === 'string' ? input : input && (input.href || input.url);
			if (typeof url !== 'string' || !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
				reject(new TypeError('Failed to parse URL from ' + String(url)));
				return;
			}
			var options = init || {};
			var headers = [];
			var given = options.headers;
			if (given && typeof given.forEach === 'function' && !Array.isArray(given)) given.forEach(function (value, name) { headers.push([String(name), String(value)]); });
			else if (Array.isArray(given)) for (var index = 0; index < given.length; index++) headers.push([String(given[index][0]), String(given[index][1])]);
			else if (given) for (var name in given) headers.push([name, String(given[name])]);
			var body = options.body === undefined || options.body === null ? null : options.body;
			if (body !== null && typeof body !== 'string') {
				reject(new TypeError('a phone sends a text body only'));
				return;
			}
			var signal = options.signal;
			if (signal && signal.aborted) {
				reject(signal.reason);
				return;
			}
			var id = host.nextRequest++;
			host.requests[id] = { resolve: resolve, reject: reject, url: url };
			output().requests.push({ id: id, request: { url: url, method: String(options.method || 'GET').toUpperCase(), headers: headers, body: body } });
			if (signal && typeof signal.addEventListener === 'function')
				signal.addEventListener('abort', function () {
					if (!host.requests[id]) return;
					delete host.requests[id];
					output().aborts.push(id);
					reject(signal.reason);
				});
		});
	};
	var rotate = function (value, bits) { return (value << bits) | (value >>> (32 - bits)); };
	var block = function (key, counter) {
		var state = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574].concat(key, [counter, 0, 0, 0]);
		var x = state.slice();
		var quarter = function (a, b, c, d) {
			x[a] = (x[a] + x[b]) | 0; x[d] = rotate(x[d] ^ x[a], 16);
			x[c] = (x[c] + x[d]) | 0; x[b] = rotate(x[b] ^ x[c], 12);
			x[a] = (x[a] + x[b]) | 0; x[d] = rotate(x[d] ^ x[a], 8);
			x[c] = (x[c] + x[d]) | 0; x[b] = rotate(x[b] ^ x[c], 7);
		};
		for (var round = 0; round < 10; round++) {
			quarter(0, 4, 8, 12); quarter(1, 5, 9, 13); quarter(2, 6, 10, 14); quarter(3, 7, 11, 15);
			quarter(0, 5, 10, 15); quarter(1, 6, 11, 12); quarter(2, 7, 8, 13); quarter(3, 4, 9, 14);
		}
		var bytes = [];
		for (var word = 0; word < 16; word++) {
			var value = (x[word] + state[word]) | 0;
			bytes.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
		}
		return bytes;
	};
	var randomBytes = function (count) {
		if (!host.seed) throw new Error('crypto was used outside a handler');
		var key = [];
		for (var word = 0; word < 8; word++) key.push(parseInt(host.seed.slice(word * 8, word * 8 + 8), 16) | 0);
		var bytes = [];
		while (bytes.length < count) bytes = bytes.concat(block(key, host.counter++));
		return bytes.slice(0, count);
	};
	g.crypto = {
		getRandomValues: function (array) {
			var bytes = randomBytes(array.byteLength);
			new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes);
			return array;
		},
		randomUUID: function () {
			var bytes = randomBytes(16);
			bytes[6] = (bytes[6] & 15) | 64;
			bytes[8] = (bytes[8] & 63) | 128;
			var hex = bytes.map(function (byte) { return (byte < 16 ? '0' : '') + byte.toString(16); }).join('');
			return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
		},
	};
	// The web's URL parser for a path (WHATWG): dot segments removed, the path percent-encode set encoded.
	var encodePath = function (path) {
		var out = '';
		for (var index = 0; index < path.length; index++) {
			var code = path.charCodeAt(index);
			var char = path.charAt(index);
			if (code >= 0xd800 && code <= 0xdbff && index + 1 < path.length) {
				var low = path.charCodeAt(index + 1);
				if (low >= 0xdc00 && low <= 0xdfff) {
					out += encodeURIComponent(char + path.charAt(++index));
					continue;
				}
			}
			if (code >= 0xd800 && code <= 0xdfff) out += '%EF%BF%BD';
			else if (code <= 0x20 || code >= 0x7f || '"<>^\x60{}'.indexOf(char) >= 0) out += encodeURIComponent(char);
			else out += char;
		}
		return out;
	};
	var resolvePath = function (text, here) {
		var path = text === '' ? here : text.charAt(0) === '/' ? text : here.slice(0, here.lastIndexOf('/') + 1) + text;
		var segments = path.split('/');
		var kept = [];
		for (var index = 1; index < segments.length; index++) {
			var segment = segments[index];
			var lower = segment.toLowerCase();
			var last = index === segments.length - 1;
			if (segment === '..' || lower === '.%2e' || lower === '%2e.' || lower === '%2e%2e') {
				kept.pop();
				if (last) kept.push('');
			} else if (segment === '.' || lower === '%2e') {
				if (last) kept.push('');
			} else kept.push(segment);
		}
		return encodePath('/' + kept.join('/'));
	};
	var decodeSegment = function (segment) {
		try { return decodeURIComponent(segment); } catch (error) { return segment; }
	};
	// The router's match: routes in its order, a [param] takes one segment (URL-decoded, as a phone keeps params), a [...rest] the rest.
	var matchRoute = function (path, routes) {
		var request = path.length > 1 && path.charAt(path.length - 1) === '/' ? path.slice(0, -1) : path;
		var parts = request === '/' ? [] : request.slice(1).split('/');
		for (var index = 0; index < routes.length; index++) {
			var pattern = routes[index];
			var segments = pattern === '/' ? [] : pattern.slice(1).split('/');
			var rest = -1;
			for (var at = 0; at < segments.length; at++) if (segments[at].indexOf('[...') === 0) rest = at;
			if (rest < 0 ? segments.length !== parts.length : parts.length <= rest) continue;
			var params = {};
			var matched = true;
			for (var at = 0; at < segments.length && matched; at++) {
				var segment = segments[at];
				if (at === rest) break;
				if (segment.charAt(0) === '[') params[segment.slice(1, -1)] = decodeSegment(parts[at]);
				else if (segment !== decodeSegment(parts[at])) matched = false;
			}
			if (matched) return { route: pattern, params: params };
		}
		return null;
	};
	host.navigate = function (href, options) {
		var place = host.place;
		if (!place || !host.out) throw new Error('navigate() runs in an event handler');
		var given = String(href);
		var text = given.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '').replace(/\\/g, '/');
		if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text) || text.slice(0, 2) === '//')
			return Promise.reject(new Error('navigate() to ' + given + ' leaves the app, and a phone app has no browser to load it in'));
		var hash = '';
		var search = '';
		var at = text.indexOf('#');
		if (at >= 0) { hash = text.slice(at); text = text.slice(0, at); }
		at = text.indexOf('?');
		if (at >= 0) { search = text.slice(at); text = text.slice(0, at); }
		if (search === '?') search = '';
		var path = resolvePath(text, place.path);
		// The router keeps the page shown for its own path and query; a '#/' hash names a client route.
		var same = function (a, b) { return a.split('/').map(decodeSegment).join('/') === b.split('/').map(decodeSegment).join('/'); };
		if (same(path, place.path) && search === '' && hash.slice(0, 2) !== '#/') return Promise.resolve();
		var match = matchRoute(path, place.routes);
		if (!match) return Promise.reject(new Error('navigate() to ' + given + ': ' + path + ' is not a page of this app'));
		if (match.route.indexOf('[...') >= 0)
			return Promise.reject(new Error('navigate() to ' + given + ' opens ' + match.route + ', a catch-all page, which a phone does not open yet'));
		host.out.navigate = { route: match.route, params: match.params, replace: !!(options && options.replace) };
		return Promise.resolve();
	};
	// A device call is a call entry the host makes; one that gives a value waits for the host's answer to its id.
	var deviceCalls = ${JSON.stringify(DEVICE_CALLS)};
	var answers = {};
	var nextCall = 1;
	host.device = function (call, object, args) {
		var out = output();
		var given = [];
		for (var index = 0; index < args.length; index++) given.push(args[index] === undefined ? null : JSON.parse(JSON.stringify(args[index])));
		var entry = { call: call, arguments: given };
		if (object) entry.object = object;
		if (!deviceCalls[call].async) {
			out.calls.push(entry);
			return undefined;
		}
		entry.id = nextCall++;
		out.calls.push(entry);
		return new Promise(function (resolve, reject) { answers[entry.id] = { resolve: resolve, reject: reject }; });
	};
	host.answer = function (id, answer) {
		var waiting = answers[id];
		delete answers[id];
		if (!waiting) return;
		if (!('error' in answer)) return waiting.resolve(answer.value);
		var error = new Error(answer.error.message);
		error.name = answer.error.name;
		waiting.reject(error);
	};
	var callsOn = function (device, object) {
		var made = {};
		Object.keys(deviceCalls).forEach(function (call) {
			var dot = call.indexOf('.');
			if (call.slice(0, dot) !== device || !deviceCalls[call].object !== !object) return;
			made[call.slice(dot + 1)] = function () { return host.device(call, object, Array.prototype.slice.call(arguments)); };
		});
		return made;
	};
	host.devices = {};
	Object.keys(deviceCalls).forEach(function (call) {
		var device = call.slice(0, call.indexOf('.'));
		if (!deviceCalls[call].object) host.devices[device] = callsOn(device, null);
	});
	host.deviceObject = callsOn;
	g.window = g.self = g;
	host.Response = Response;
	// The HTML structured clone, as Chromium runs it, for an engine that has none.
	if (typeof g.structuredClone !== 'function') {
		var cloneFailed = function (what) {
			var message = "Failed to execute 'structuredClone' on 'Window': " + what + ' could not be cloned.';
			if (typeof g.DOMException === 'function') return new g.DOMException(message, 'DataCloneError');
			var error = new Error(message);
			error.name = 'DataCloneError';
			return error;
		};
		var ERRORS = ['Error', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError'];
		var tag = function (value) { return Object.prototype.toString.call(value).slice(8, -1); };
		g.structuredClone = function structuredClone(value) {
			if (arguments.length === 0)
				throw new TypeError("Failed to execute 'structuredClone' on 'Window': 1 argument required, but only 0 present.");
			var memory = new Map();
			var copy = function (input) {
				var type = typeof input;
				if (type === 'symbol' || type === 'function') throw cloneFailed(String(input));
				if (input === null || type !== 'object') return input;
				if (memory.has(input)) return memory.get(input);
				// The host's own objects stand for the web's platform objects, which do not clone.
				if (input instanceof host.Form) throw cloneFailed('HTMLFormElement object');
				if (typeof g.FormData === 'function' && input instanceof g.FormData) throw cloneFailed('FormData object');
				var kind = tag(input), output;
				if (kind === 'Boolean') output = Object(Boolean.prototype.valueOf.call(input));
				else if (kind === 'Number') output = Object(Number.prototype.valueOf.call(input));
				else if (kind === 'String') output = Object(String.prototype.valueOf.call(input));
				else if (kind === 'BigInt') output = Object(BigInt.prototype.valueOf.call(input));
				else if (kind === 'Date') output = new Date(input.getTime());
				else if (kind === 'RegExp') output = new RegExp(input.source, input.flags);
				else if (kind === 'ArrayBuffer') output = input.slice(0);
				else if (ArrayBuffer.isView(input)) {
					var buffer = copy(input.buffer);
					output = kind === 'DataView'
						? new DataView(buffer, input.byteOffset, input.byteLength)
						: new input.constructor(buffer, input.byteOffset, input.length);
				} else if (kind === 'Map') {
					output = new Map();
					memory.set(input, output);
					input.forEach(function (entry, key) { output.set(copy(key), copy(entry)); });
					return output;
				} else if (kind === 'Set') {
					output = new Set();
					memory.set(input, output);
					input.forEach(function (entry) { output.add(copy(entry)); });
					return output;
				} else if (kind === 'Error') {
					var name = ERRORS.indexOf(input.name) >= 0 ? input.name : 'Error';
					var own = Object.getOwnPropertyDescriptor(input, 'message');
					output = own && 'value' in own ? new g[name](String(own.value)) : new g[name]();
					if (typeof input.stack === 'string') output.stack = input.stack;
				} else if (kind === 'Array' || kind === 'Object' || kind === 'Arguments') {
					output = kind === 'Array' ? new Array(input.length) : {};
					memory.set(input, output);
					Object.keys(input).forEach(function (key) { output[key] = copy(input[key]); });
					return output;
				} else throw cloneFailed(kind + ' object');
				memory.set(input, output);
				return output;
			};
			return copy(value);
		};
	}
	// The form a submit handler's event names: only FormData reads it, as its entries when the form was sent.
	host.Form = function (entries) { Object.defineProperty(this, 'entries', { value: entries }); };
	if (typeof g.FormData !== 'function') {
		var FormData = function FormData(form, submitter) {
			if (!(this instanceof FormData)) throw new TypeError("Failed to construct 'FormData': Please use the 'new' operator");
			if (submitter !== undefined && submitter !== null) throw new TypeError("FormData on a phone does not read a submitter yet");
			if (form !== undefined && !(form instanceof host.Form))
				throw new TypeError("Failed to construct 'FormData': parameter 1 is not of type 'HTMLFormElement'.");
			this.list = form ? form.entries.map(function (entry) { return [String(entry[0]), String(entry[1])]; }) : [];
		};
		var named = function (data, name) { return data.list.filter(function (entry) { return entry[0] === String(name); }); };
		FormData.prototype.get = function (name) { var found = named(this, name); return found.length ? found[0][1] : null; };
		FormData.prototype.getAll = function (name) { return named(this, name).map(function (entry) { return entry[1]; }); };
		FormData.prototype.has = function (name) { return named(this, name).length > 0; };
		FormData.prototype.append = function (name, value) { this.list.push([String(name), String(value)]); };
		FormData.prototype['delete'] = function (name) { this.list = this.list.filter(function (entry) { return entry[0] !== String(name); }); };
		FormData.prototype.set = function (name, value) {
			var at = -1;
			for (var index = 0; index < this.list.length; index++) if (this.list[index][0] === String(name)) { at = index; break; }
			if (at < 0) return this.append(name, value);
			this.list[at] = [String(name), String(value)];
			var kept = this.list.slice(0, at + 1);
			this.list = kept.concat(this.list.slice(at + 1).filter(function (entry) { return entry[0] !== String(name); }));
		};
		FormData.prototype.forEach = function (fn, that) {
			var self = this;
			this.list.slice().forEach(function (entry) { fn.call(that, entry[1], entry[0], self); });
		};
		var iterate = function (data, pick) {
			var list = data.list.slice(), at = 0;
			var it = { next: function () { return at < list.length ? { value: pick(list[at++]), done: false } : { value: undefined, done: true }; } };
			it[Symbol.iterator] = function () { return it; };
			return it;
		};
		FormData.prototype.entries = function () { return iterate(this, function (entry) { return [entry[0], entry[1]]; }); };
		FormData.prototype.keys = function () { return iterate(this, function (entry) { return entry[0]; }); };
		FormData.prototype.values = function () { return iterate(this, function (entry) { return entry[1]; }); };
		FormData.prototype[Symbol.iterator] = FormData.prototype.entries;
		g.FormData = FormData;
	}
}`;

// One payload's script: its modules, its functions, and the entry points a host calls (`enter`, then `leave`).
const ENTRIES = String.raw`var cells = {}, before = {}, cache = {}, functions = {}, runs = {};
var load = function (id) {
	var module = cache[id];
	if (module) return module;
	module = cache[id] = {};
	modules[id](module);
	return module;
};
var __export = function (exports, getters) {
	for (var name in getters) Object.defineProperty(exports, name, { enumerable: true, configurable: true, get: getters[name] });
};
var __exportStar = function (exports, module) {
	Object.keys(module).forEach(function (name) {
		if (name !== 'default' && !Object.prototype.hasOwnProperty.call(exports, name))
			Object.defineProperty(exports, name, { enumerable: true, get: function () { return module[name]; } });
	});
};
var fn = function (id) {
	if (!functions[id]) load(owners[id]);
	return functions[id];
};
// A cell still undefined on the web reads so here until something writes it; a write, even of null, is reported.
var unset = {}, forced = {};
var slotValue = function (slot) {
	if (unset[slot]) return undefined;
	if (Object.prototype.hasOwnProperty.call(cells, slot)) return cells[slot];
	var at = slot.indexOf('@');
	return at < 0 ? undefined : cells[slot.slice(0, at)];
};
var cellProperty = function (target, name, slot) {
	Object.defineProperty(target, name, {
		enumerable: true,
		get: function () { return slotValue(slot); },
		set: function (value) {
			if (unset[slot]) {
				delete unset[slot];
				forced[slot] = true;
			}
			cells[slot] = value;
		},
	});
};
var frameOf = function (bindings) {
	var names = {};
	Object.keys(bindings).forEach(function (name) {
		var binding = bindings[name];
		if ('slot' in binding) cellProperty(names, name, binding.slot);
		else if ('fields' in binding) {
			var object = {};
			Object.keys(binding.fields).forEach(function (field) { cellProperty(object, field, binding.fields[field]); });
			Object.defineProperty(names, name, { enumerable: true, value: object });
		} else if ('device' in binding) Object.defineProperty(names, name, { enumerable: true, value: host.deviceObject(binding.device, binding.object) });
		else if ('elements' in binding) Object.defineProperty(names, name, { enumerable: true, value: elementsOf(binding.elements) });
		else if ('object' in binding) Object.defineProperty(names, name, { enumerable: true, value: frameOf(binding.object) });
		else if ('method' in binding) {
			var method = binding.method, own = binding.frame;
			Object.defineProperty(names, name, { enumerable: true, value: function () { return fn(method)(frameOf(own)).apply(this, arguments); } });
		}
		else if ('shared' in binding) {
			var shared = frameOf(binding.shared);
			Object.defineProperty(names, name, { enumerable: true, value: function () { return shared; } });
		} else if ('callback' in binding) {
			// A parent's function prop: its own names are this frame's under '<name>.'.
			var prefix = name + '.', own = {};
			Object.keys(bindings).forEach(function (other) {
				if (other.indexOf(prefix) === 0) own[other.slice(prefix.length)] = bindings[other];
			});
			Object.defineProperty(names, name, {
				enumerable: true,
				value: function () { return fn(binding.callback)(frameOf(own)).apply(this, arguments); },
			});
		} else Object.defineProperty(names, name, { enumerable: true, value: binding.value });
	});
	return names;
};
// The page's path as the web's address bar has it: its route pattern with the params it opened with.
var pathOf = function (pattern, params) {
	if (pattern === '/') return '/';
	return pattern.split('/').map(function (segment) {
		return segment.charAt(0) === '[' ? encodeURIComponent(params[segment.slice(1, -1)]) : segment;
	}).join('/');
};
// An element is a proxy that offers only what the host answers: the attributes it has now, whether it holds another
// element, and the commands a handler's data can run. No tree walking, no selectors, no layout.
var elementFacts = {};
var proxies = {};
var elementOf = function (id) {
	if (typeof id !== 'string') return id;
	if (id === ${JSON.stringify(NATIVE_UNBOUND_HANDLE)}) return undefined;
	if (proxies[id]) return proxies[id];
	var facts = function () {
		if (!elementFacts[id]) throw new Error('the host described no element ' + id);
		return elementFacts[id];
	};
	var own = function (name) { return Object.prototype.hasOwnProperty.call(facts().attributes, String(name).toLowerCase()); };
	var command = function (name, preventScroll) { host.out.commands.push([id, name, preventScroll]); };
	var proxy = {
		getAttribute: function (name) { return own(name) ? facts().attributes[String(name).toLowerCase()] : null; },
		hasAttribute: own,
		contains: function (other) {
			var node = other && other.__node;
			if (typeof node !== 'string') return false;
			return node === id || (!!elementFacts[node] && elementFacts[node].ancestors.indexOf(id) >= 0);
		},
		focus: function (options) { command('focus', !!(options && options.preventScroll)); },
		scrollIntoView: function () { command('scrollIntoView', false); },
		showModal: function () { command('showModal', false); },
		close: function () { command('close', false); },
		getBoundingClientRect: function () {
			throw new Error('getBoundingClientRect() asks the host to measure while JavaScript waits, which a phone does not answer');
		},
	};
	Object.defineProperty(proxy, '__node', { value: id });
	proxies[id] = proxy;
	return proxy;
};
var elementsOf = function (value) { return Array.isArray(value) ? value.map(elementOf) : elementOf(value); };
var begin = function (entry) {
	elementFacts = entry.elements || {};
	proxies = {};
	cells = entry.cells;
	unset = {};
	forced = {};
	(entry.unset || []).forEach(function (slot) { unset[slot] = true; });
	before = {};
	for (var slot in cells) before[slot] = JSON.stringify(cells[slot]);
	host.out = { timers: [], clears: [], requests: [], aborts: [], calls: [], logs: [], commands: [], pending: [], settled: [], navigate: null };
	host.place = navigation && entry.kind !== 'compute' ? { routes: navigation.routes, path: pathOf(navigation.here, entry.params || {}) } : null;
	host.seed = entry.seed || null;
	host.counter = 0;
};
var fail = function (slot, error) {
	host.out.logs.push(['error', error instanceof Error ? error.name + ': ' + error.message : String(error)]);
	if (slot)
		cells[slot] = {
			name: error && error.name !== undefined ? String(error.name) : 'Error',
			message: error && error.message !== undefined ? String(error.message) : String(error),
		};
};
var eventOf = function (given, frame) {
	var entries = frame[${JSON.stringify(NATIVE_SCRIPT_SUBMITTED_FORM)}];
	var target = entries ? new host.Form(entries) : { value: given.value === undefined ? '' : given.value, checked: given.checked === true };
	var event = {
		type: given.type,
		target: target,
		currentTarget: target,
		key: given.key,
		isComposing: false,
		defaultPrevented: false,
		preventDefault: function () { this.defaultPrevented = true; },
		stopPropagation: function () {},
	};
	${JSON.stringify(NATIVE_SCRIPT_POINTER_FIELDS)}.forEach(function (field) { if (field in given) event[field] = given[field]; });
	// A paste carries the pasted plain text, as the edit menu's paste does.
	if ('text' in given)
		event.clipboardData = { getData: function (type) { return type === 'text' || type === 'text/plain' ? given.text : ''; } };
	return event;
};
var errorOf = function (error) {
	return {
		name: error && error.name !== undefined ? String(error.name) : 'Error',
		message: error && error.message !== undefined ? String(error.message) : String(error),
	};
};
// What an async value's run depends on: the values its names read now. A run whose key moved is aborted and started again.
var keyOf = function (frame) {
	return JSON.stringify(Object.keys(frame).sort().map(function (name) {
		var binding = frame[name];
		if ('slot' in binding) return slotValue(binding.slot);
		if ('fields' in binding) return Object.keys(binding.fields).sort().map(function (field) { return slotValue(binding.fields[field]); });
		return binding.value;
	}));
};
var startRun = function (at, task, key) {
	var signal = host.signal();
	var run = runs[at] = { key: key, signal: signal, done: false };
	var settle = function (value) {
		// An answer for a run that was aborted or started again since is dropped, as the web drops a stale one.
		if (runs[at] !== run) return;
		run.done = true;
		cells[task.slot] = value;
	};
	var failed = function (error) {
		var shown = slotValue(task.slot);
		var caught = errorOf(error);
		settle(shown && shown.state === 'value' ? { state: 'value', value: shown.value, error: caught } : { state: 'error', error: caught });
	};
	try {
		Promise.resolve(fn(task.fn)(frameOf(task.frame))({ signal: signal })).then(function (value) {
			settle({ state: 'value', value: plain(value), error: null });
		}, failed);
	} catch (error) {
		failed(error);
	}
};
var json = function (value) { return value === undefined ? null : value; };
// A value the page shows crosses as JSON; anything else (a RegExp, a class instance) as the text the web would show for it.
var plain = function (value) {
	if (value === undefined || value === null) return null;
	var type = typeof value;
	if (type === 'string' || type === 'boolean') return value;
	if (type === 'number') return isFinite(value) ? value : String(value);
	if (Array.isArray(value)) return value.map(plain);
	var proto = type === 'object' ? Object.getPrototypeOf(value) : undefined;
	if (proto === Object.prototype || proto === null) {
		var out = {};
		for (var key in value) out[key] = plain(value[key]);
		return out;
	}
	return String(value);
};
g.__markless[id] = {
	enter: function (text) {
		var entry = JSON.parse(text);
		begin(entry);
		if (entry.kind === 'compute') {
			var value = fn(entry.fn)(frameOf(entry.frame))();
			host.out = null;
			return JSON.stringify(plain(value));
		}
		if (entry.kind === 'dispatch') {
			var settled = function (error) { fail(entry['catch'], error); };
			var event = null;
			try {
				var frame = frameOf(entry.frame);
				event = eventOf(entry.event, frame);
				var result = fn(entry.fn)(frame)(event);
				if (result && typeof result.then === 'function') {
					// The host keeps a submitted form busy from this entry until the entry the promise settles in.
					var run = host.nextRun++;
					host.out.pending.push(run);
					var done = function () { host.out.settled.push(run); };
					result.then(done, function (error) { settled(error); done(); });
				}
			} catch (error) {
				settled(error);
			}
			// A key's or paste's cancel reaches the host, as a browser reads defaultPrevented before the handler first awaits.
			if (event && event.defaultPrevented && (entry.event.type === 'keydown' || entry.event.type === 'paste')) host.out.prevented = true;
		} else if (entry.kind === 'timer') {
			var timer = host.timers[entry.timer];
			if (timer) {
				if (timer.repeat) host.out.timers.push([entry.timer, timer.ms]);
				else delete host.timers[entry.timer];
				try { timer.fn.apply(null, timer.args); } catch (error) { fail(null, error); }
			}
		} else if (entry.kind === 'tasks') {
			var listed = {}, prefix = entry.screen + '\u0000', again = {};
			(entry.retry || []).forEach(function (slot) { again[slot] = true; });
			entry.tasks.forEach(function (task) {
				var at = prefix + task.slot;
				listed[at] = true;
				var key = keyOf(task.frame);
				var run = runs[at];
				var current = slotValue(task.slot);
				// A row or screen that started over shows pending again, so a finished run with the same key runs again too.
				if (run && run.key === key && !again[task.slot] && (!run.done || !current || current.state !== 'pending')) return;
				if (run && !run.done) host.abort(run.signal);
				startRun(at, task, key);
			});
			for (var at in runs) {
				if (at.indexOf(prefix) !== 0 || listed[at]) continue;
				if (!runs[at].done) host.abort(runs[at].signal);
				// A @try shown again shows a refresh that failed as @catch alone, as a first answer that failed is.
				var slot = at.slice(prefix.length), kept = slotValue(slot);
				if (runs[at].done && kept && kept.state === 'value' && kept.error) cells[slot] = { state: 'error', error: kept.error };
				if (!runs[at].done || entry.leave) delete runs[at];
			}
		} else if (entry.kind === 'answer') {
			host.answer(entry.call, entry);
		} else if (entry.kind === 'response') {
			var request = host.requests[entry.request];
			delete host.requests[entry.request];
			if (request) {
				if ('error' in entry.response) request.reject(new TypeError(entry.response.error));
				else request.resolve(new host.Response(entry.response, request.url));
			}
		}
		return '';
	},
	leave: function () {
		var writes = [];
		for (var slot in cells) {
			var now = JSON.stringify(cells[slot]);
			if (now !== before[slot] || forced[slot]) writes.push([slot, now === undefined ? null : JSON.parse(now)]);
		}
		var out = host.out;
		host.out = null;
		var left = { writes: writes, timers: out.timers, clears: out.clears, requests: out.requests, aborts: out.aborts, logs: out.logs, commands: out.commands, pending: out.pending, settled: out.settled };
		if (out.calls.length > 0) left.calls = out.calls;
		if (out.prevented) left.prevented = true;
		if (out.navigate) left.navigate = out.navigate;
		return JSON.stringify(left);
	},
};`;

/** A short content hash: the key a payload's script is kept under in an engine several payloads share. */
function contentId(text: string): string {
	let a = 0x811c9dc5;
	let b = 0x01000193;
	for (let index = 0; index < text.length; index++) {
		const code = text.charCodeAt(index);
		a = Math.imul(a ^ code, 0x01000193) >>> 0;
		b = Math.imul(b ^ code, 0x5bd1e995) >>> 0;
	}
	return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/**
 * The script a payload's `script` ops and computeds run. Every module is a function run once on first use, imports first,
 * as ES modules evaluate; each script function is defined inside its module, so the module's own names reach it.
 */
export function nativeScriptOf(
	modules: ReadonlyArray<NativeScriptModuleInput>,
	services: ReadonlyArray<NativeScriptService>,
	/** For `navigate()`: the page's route pattern, and the app's route patterns in the router's order. */
	navigation?: { readonly here: string; readonly routes: ReadonlyArray<string> },
	/** A drawing's geometry follows state: the engine carries the svg grammars (`__svgPath`, `__svgViewBox`). */
	svg = false,
): NativeScript {
	const owners: Record<string, number> = {};
	const definitions = modules.map((module, index) => {
		for (const fn of module.functions) owners[fn.id] = index;
		return [
			`modules[${index}] = function (exports) {`,
			'"use strict";',
			`var __i = [${module.imports.map((target) => (target === null ? 'null' : `load(${target})`)).join(', ')}];`,
			module.code,
			...module.functions.map(
				(fn) => `functions[${JSON.stringify(fn.id)}] = function (__s) {\n${fn.code}\n};`,
			),
			'};',
		].join('\n');
	});
	const body = [
		'var modules = [];',
		`var owners = ${JSON.stringify(owners)};`,
		`var navigation = ${JSON.stringify(navigation ?? null)};`,
		...definitions,
		...(svg ? [SVG_GEOMETRY_SOURCE] : []),
		ENTRIES,
	].join('\n');
	const id = contentId(body);
	const source = `(function (g, id) {\n${HOST_SERVICES}\ng.__markless = g.__markless || {};\n${body}\n})(globalThis, ${JSON.stringify(id)});\n`;
	return { id, source, services };
}
