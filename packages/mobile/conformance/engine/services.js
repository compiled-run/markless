var host = g.__marklessHost;
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
	// Events a script makes and dispatches on an element: the host raises them on that element once the script returns.
	var EventBase = function (type, init) {
		init = init || {};
		this.type = String(type);
		this.bubbles = init.bubbles === true;
		this.cancelable = init.cancelable === true;
		this.defaultPrevented = false;
		this.isTrusted = false;
		this.target = null;
		this.currentTarget = null;
	};
	EventBase.prototype.preventDefault = function () { if (this.cancelable) this.defaultPrevented = true; };
	EventBase.prototype.stopPropagation = function () {};
	var eventKind = function (parent, fields) {
		var Kind = function (type, init) {
			parent.call(this, type, init);
			for (var name in fields) this[name] = init && init[name] !== undefined ? init[name] : fields[name];
		};
		Kind.prototype = Object.create(parent.prototype);
		return Kind;
	};
	g.Event = EventBase;
	g.CustomEvent = eventKind(EventBase, { detail: null });
	g.MouseEvent = eventKind(EventBase, { detail: 0, button: 0, buttons: 0, clientX: 0, clientY: 0, relatedTarget: null });
	g.PointerEvent = eventKind(g.MouseEvent, { pointerId: 0, pointerType: '', isPrimary: false, pressure: 0 });
	g.KeyboardEvent = eventKind(EventBase, { key: '', code: '', repeat: false, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false });
	// The DOM's interfaces, so an element proxy answers instanceof as the browser's element does; none can be constructed.
	var domClasses = {"Node":null,"Element":"Node","HTMLElement":"Element","SVGElement":"Element","HTMLAnchorElement":"HTMLElement","HTMLAudioElement":"HTMLElement","HTMLQuoteElement":"HTMLElement","HTMLBodyElement":"HTMLElement","HTMLBRElement":"HTMLElement","HTMLButtonElement":"HTMLElement","HTMLCanvasElement":"HTMLElement","HTMLDetailsElement":"HTMLElement","HTMLDialogElement":"HTMLElement","HTMLDivElement":"HTMLElement","HTMLDListElement":"HTMLElement","HTMLFieldSetElement":"HTMLElement","HTMLFormElement":"HTMLElement","HTMLHeadingElement":"HTMLElement","HTMLHRElement":"HTMLElement","HTMLIFrameElement":"HTMLElement","HTMLImageElement":"HTMLElement","HTMLInputElement":"HTMLElement","HTMLLabelElement":"HTMLElement","HTMLLegendElement":"HTMLElement","HTMLLIElement":"HTMLElement","HTMLOListElement":"HTMLElement","HTMLOptionElement":"HTMLElement","HTMLOutputElement":"HTMLElement","HTMLParagraphElement":"HTMLElement","HTMLPreElement":"HTMLElement","HTMLProgressElement":"HTMLElement","HTMLSelectElement":"HTMLElement","HTMLSpanElement":"HTMLElement","SVGSVGElement":"SVGElement","HTMLTableElement":"HTMLElement","HTMLTableSectionElement":"HTMLElement","HTMLTableCellElement":"HTMLElement","HTMLTextAreaElement":"HTMLElement","HTMLTimeElement":"HTMLElement","HTMLTableRowElement":"HTMLElement","HTMLUListElement":"HTMLElement","HTMLVideoElement":"HTMLElement"};
	var defineClass = function (name) {
		if (Object.prototype.hasOwnProperty.call(g, name) && g[name].__dom) return g[name];
		var parent = domClasses[name] ? defineClass(domClasses[name]) : null;
		var Class = function () { throw new TypeError('Illegal constructor'); };
		if (parent) Class.prototype = Object.create(parent.prototype);
		Object.defineProperty(Class, '__dom', { value: true });
		Object.defineProperty(Class, 'name', { value: name });
		g[name] = Class;
		return Class;
	};
	for (var domName in domClasses) defineClass(domName);
	if (typeof g.performance !== 'object' || typeof g.performance.now !== 'function') {
		var origin = Date.now(), last = 0;
		// Date.now() can step back when the device clock is set; elapsed time never does.
		g.performance = { timeOrigin: origin, now: function () { return (last = Math.max(last, Date.now() - origin)); } };
	}
	if (typeof g.DOMException !== 'function') {
		g.DOMException = function DOMException(message, name) {
			this.message = message === undefined ? '' : String(message);
			this.name = name === undefined ? 'Error' : String(name);
		};
		g.DOMException.prototype = Object.create(Error.prototype, { constructor: { value: g.DOMException, writable: true, configurable: true } });
	}
	// Files as a page holds them: a File's name, size, type and lastModified, a FileList, and a DataTransfer to build one.
	var utf8Length = function (text) { return unescape(encodeURIComponent(text)).length; };
	if (typeof g.File !== 'function') {
		g.File = function File(bits, name, options) {
			this.name = String(name);
			this.type = options && options.type !== undefined ? String(options.type).toLowerCase() : '';
			this.lastModified = options && options.lastModified !== undefined ? Number(options.lastModified) : Date.now();
			var size = 0, text = '', known = true;
			(bits || []).forEach(function (part) {
				size += typeof part === 'string' ? utf8Length(part) : part && typeof part.size === 'number' ? part.size : 0;
				if (typeof part === 'string') text += part;
				else if (part && typeof part.__text === 'string') text += part.__text;
				else known = false;
			});
			this.size = size;
			// What a request sends of it: the text it was made of, or the chosen file the host reads.
			if (known) Object.defineProperty(this, '__text', { value: text });
		};
	}
	// A file a request can send: its name and type, and its text or the host's reference to the chosen file.
	host.filePart = function (file) {
		var part = { name: String(file.name), type: String(file.type) };
		if (typeof file.__ref === 'string') part.ref = file.__ref;
		else if (typeof file.__text === 'string') part.text = file.__text;
		else throw new TypeError('a phone sends only a file a picker chose or one made from text');
		return part;
	};
	host.fileListOf = function (files) {
		var list = files.slice();
		list.item = function (index) { return list[index] || null; };
		return list;
	};
	if (typeof g.DataTransfer !== 'function') {
		g.DataTransfer = function DataTransfer() {
			var held = [];
			this.items = {
				add: function (file) { held.push(file); return { kind: 'file', type: file.type }; },
				remove: function (index) { held.splice(index, 1); },
				clear: function () { held.length = 0; },
			};
			Object.defineProperty(this.items, 'length', { get: function () { return held.length; } });
			Object.defineProperty(this, 'files', { get: function () { return host.fileListOf(held); } });
		};
	}
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
			// A URL from the root reaches the app's site, as the web's reaches the page's origin; the phone shows no page URL.
			if (typeof url === 'string' && host.origin && url.charAt(0) === '/')
				url = url.charAt(1) === '/' ? host.origin.slice(0, host.origin.indexOf(':') + 1) + url : host.origin + url;
			if (typeof url !== 'string' || !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
				reject(new TypeError('Failed to parse URL from ' + String(url) + (host.origin ? '' : ": a phone resolves a URL from the root ('/…') only against the app's origin (app.json \"origin\")")));
				return;
			}
			var options = init || {};
			var headers = [];
			var given = options.headers;
			if (given && typeof given.forEach === 'function' && !Array.isArray(given)) given.forEach(function (value, name) { headers.push([String(name), String(value)]); });
			else if (Array.isArray(given)) for (var index = 0; index < given.length; index++) headers.push([String(given[index][0]), String(given[index][1])]);
			else if (given) for (var name in given) headers.push([name, String(given[name])]);
			var body = options.body === undefined || options.body === null ? null : options.body;
			// A FormData goes as multipart/form-data: its text entries, and its files, which the host reads and encodes.
			if (body !== null && typeof g.FormData === 'function' && body instanceof g.FormData) {
				try {
					body = { form: body.list.map(function (entry) { return [entry[0], typeof entry[1] === 'string' ? entry[1] : host.filePart(entry[1])]; }) };
				} catch (error) {
					reject(error);
					return;
				}
			} else if (body !== null && typeof body !== 'string') {
				reject(new TypeError('a phone sends a text body or a FormData only'));
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
	var deviceCalls = {"haptics.tap":{"feature":"haptics","async":false},"location.current":{"feature":"location","async":true},"camera.takePhoto":{"feature":"camera","async":true,"object":true},"sharesheet.open":{"feature":"sharesheet","async":true},"settings.open":{"feature":"settings","async":false},"browser.open":{"feature":"browser","async":false}};
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
	g.getComputedStyle = function (element) {
		if (!element || typeof element.__style !== 'function') throw new TypeError('getComputedStyle() takes an element');
		return element.__style();
	};
	// A media query, answered from the device's settings in the entry it is read in; a feature a phone has no value for throws.
	var mediaFeature = function (text, query) {
		var colon = text.indexOf(':');
		var name = (colon < 0 ? text : text.slice(0, colon)).trim();
		if (!host.media || !Object.prototype.hasOwnProperty.call(host.media, name))
			throw new TypeError('matchMedia on a phone answers prefers-reduced-motion and prefers-color-scheme, not "' + query + '"');
		return colon < 0 ? host.media[name] !== 'no-preference' : text.slice(colon + 1).trim() === host.media[name];
	};
	var mediaQuery = function (one, query) {
		var words = one.trim().toLowerCase(), negate = false;
		if (words.indexOf('not ') === 0) { negate = true; words = words.slice(4); }
		else if (words.indexOf('only ') === 0) words = words.slice(5);
		var result = true;
		words.split(/\s+and\s+/).forEach(function (part, index) {
			part = part.trim();
			if (part.charAt(0) === '(' && part.charAt(part.length - 1) === ')') result = mediaFeature(part.slice(1, -1), query) && result;
			else if (index === 0 && part === 'print') result = false;
			else if (!(index === 0 && (part === 'all' || part === 'screen')))
				throw new TypeError('matchMedia on a phone does not read "' + query + '"');
		});
		return negate ? !result : result;
	};
	g.matchMedia = function (query) {
		var text = String(query);
		var changes = function () { throw new TypeError('a phone does not tell a script when a media query changes yet'); };
		return {
			media: text,
			matches: text.split(',').some(function (one) { return mediaQuery(one, text); }),
			addEventListener: changes,
			addListener: changes,
		};
	};
	Object.defineProperty(g, 'devicePixelRatio', {
		get: function () {
			if (!host.screen) throw new TypeError('devicePixelRatio is read in a handler on a phone');
			return host.screen.devicePixelRatio;
		},
	});
	g.window = g.self = g;
	// The page answers its focused element (the body when none is) and keeps listeners a handler adds; the host passes each
	// pointer event to them after the element's own handlers, as the browser bubbles it to the document.
	host.listeners = {};
	g.document = {
		get activeElement() { return host.focus(); },
		// A page whose <html> has no lang, as code guarded by typeof document read it before the page had a document.
		documentElement: { lang: '' },
		addEventListener: function (type, listener) {
			var list = host.listeners[String(type)] || (host.listeners[String(type)] = []);
			if (typeof listener === 'function' && list.indexOf(listener) < 0) { list.push(listener); host.listened = true; }
		},
		removeEventListener: function (type, listener) {
			var list = host.listeners[String(type)] || [];
			var at = list.indexOf(listener);
			if (at >= 0) { list.splice(at, 1); host.listened = true; }
		},
	};
	// Each screen is a history entry with its own state; one written after navigate() is the next screen's, as on the web.
	host.historyStates = {};
	host.historyNext = undefined;
	host.screen = null;
	host.screensSeen = 0;
	var historyHasNext = function () { return !!(host.out && host.out.navigate); };
	g.history = {
		get state() {
			if (historyHasNext()) return host.historyNext === undefined ? null : host.historyNext;
			return Object.prototype.hasOwnProperty.call(host.historyStates, host.screen) ? host.historyStates[host.screen] : null;
		},
		replaceState: function (data, unused) {
			if (arguments.length < 2) throw new TypeError("Failed to execute 'replaceState' on 'History': 2 arguments required, but only " + arguments.length + ' present.');
			var kept = data === undefined ? null : g.structuredClone(data);
			if (historyHasNext()) host.historyNext = kept;
			else host.historyStates[host.screen] = kept;
		},
	};
	host.enterScreen = function (screen, leaving) {
		if (typeof screen !== 'number') return;
		if (screen > host.screensSeen) {
			host.screensSeen = screen;
			if (host.historyNext !== undefined) { host.historyStates[screen] = host.historyNext; host.historyNext = undefined; }
		}
		host.screen = screen;
		if (leaving) delete host.historyStates[screen];
	};
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
	// Built in its own function: a hoisted var FormData would hide the global in every later payload's script.
	if (typeof g.FormData !== 'function') (function () {
		var FormData = function FormData(form, submitter) {
			if (!(this instanceof FormData)) throw new TypeError("Failed to construct 'FormData': Please use the 'new' operator");
			if (submitter !== undefined && submitter !== null) throw new TypeError("FormData on a phone does not read a submitter yet");
			if (form !== undefined && !(form instanceof host.Form))
				throw new TypeError("Failed to construct 'FormData': parameter 1 is not of type 'HTMLFormElement'.");
			this.list = form ? form.entries.map(function (entry) { return [String(entry[0]), entry[1] instanceof g.File ? entry[1] : String(entry[1])]; }) : [];
		};
		// A File stays itself (renamed when a name is given); a Blob becomes a File named 'blob'; anything else its text.
		var valueOf = function (value, filename) {
			if (!(value instanceof g.File)) return String(value);
			if (filename === undefined) return value;
			var renamed = new g.File([], String(filename), { type: value.type, lastModified: value.lastModified });
			Object.defineProperty(renamed, 'size', { value: value.size });
			if (typeof value.__ref === 'string') Object.defineProperty(renamed, '__ref', { value: value.__ref });
			if (typeof value.__text === 'string') Object.defineProperty(renamed, '__text', { value: value.__text });
			return renamed;
		};
		var named = function (data, name) { return data.list.filter(function (entry) { return entry[0] === String(name); }); };
		FormData.prototype.get = function (name) { var found = named(this, name); return found.length ? found[0][1] : null; };
		FormData.prototype.getAll = function (name) { return named(this, name).map(function (entry) { return entry[1]; }); };
		FormData.prototype.has = function (name) { return named(this, name).length > 0; };
		FormData.prototype.append = function (name, value, filename) { this.list.push([String(name), valueOf(value, filename)]); };
		FormData.prototype['delete'] = function (name) { this.list = this.list.filter(function (entry) { return entry[0] !== String(name); }); };
		FormData.prototype.set = function (name, value, filename) {
			var at = -1;
			for (var index = 0; index < this.list.length; index++) if (this.list[index][0] === String(name)) { at = index; break; }
			if (at < 0) return this.append(name, value, filename);
			this.list[at] = [String(name), valueOf(value, filename)];
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
	})();
}
