var cells = {}, before = {}, cache = {}, functions = {}, runs = {};
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
		} else if ('url' in binding) Object.defineProperty(names, name, { enumerable: true, value: pageUrl(binding.url) });
		else Object.defineProperty(names, name, { enumerable: true, value: binding.value });
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
// element, its box and direction as the host measured them when the entry began, and the commands a handler's data can
// run. No tree walking, no selectors.
var elementFacts = {};
var BODY = "#body";
var proxies = {};
// Which element holds each touch, as this entry's own capture calls left it; the host's facts answer the rest.
var captured = {};
var elementOf = function (id) {
	if (typeof id !== 'string') return id;
	if (id === "#unbound") return undefined;
	if (proxies[id]) return proxies[id];
	var facts = function () {
		if (id === BODY) return { attributes: {}, ancestors: [] };
		if (!elementFacts[id]) throw new Error('the host described no element ' + id);
		return elementFacts[id];
	};
	var own = function (name) { return Object.prototype.hasOwnProperty.call(facts().attributes, String(name).toLowerCase()); };
	var command = function (name, preventScroll) { host.out.commands.push([id, name, preventScroll]); };
	var isFileInput = function () { return !!elementFacts[id] && String(elementFacts[id].attributes.type || '').toLowerCase() === 'file'; };
	var chosen = [];
	var proxy = {
		getAttribute: function (name) { return own(name) ? facts().attributes[String(name).toLowerCase()] : null; },
		hasAttribute: own,
		contains: function (other) {
			var node = other && other.__node;
			if (typeof node !== 'string') return false;
			return node === id || (!!elementFacts[node] && elementFacts[node].ancestors.indexOf(id) >= 0);
		},
		focus: function (options) { command('focus', !!(options && options.preventScroll)); },
		click: function () {
			host.out.raises.push({ node: id, type: 'click', bubbles: true });
			if (isFileInput()) command('showPicker', false);
		},
		showPicker: function () {
			if (!isFileInput()) throw new g.DOMException('showPicker() is not supported for this element', 'NotSupportedError');
			command('showPicker', false);
		},
		dispatchEvent: function (event) {
			var raised = { node: id, type: String(event.type), bubbles: event.bubbles === true };
			if (event.detail !== null && typeof event.detail === 'object' && typeof event.detail.reason === 'string')
				raised.reason = event.detail.reason;
			if (event.relatedTarget && typeof event.relatedTarget.__node === 'string') raised.relatedTarget = event.relatedTarget.__node;
			['pointerId', 'pointerType', 'isPrimary', 'button', 'buttons', 'clientX', 'clientY', 'key'].forEach(function (field) {
				if (field in event) raised[field] = event[field];
			});
			host.out.raises.push(raised);
			return !event.defaultPrevented;
		},
		hasPointerCapture: function (pointerId) {
			return pointerId in captured ? captured[pointerId] === id : (facts().captures || []).indexOf(pointerId) >= 0;
		},
		setPointerCapture: function (pointerId) { captured[pointerId] = id; host.out.commands.push([id, 'setPointerCapture', pointerId]); },
		releasePointerCapture: function (pointerId) {
			if (proxy.hasPointerCapture(pointerId)) captured[pointerId] = null;
			host.out.commands.push([id, 'releasePointerCapture', pointerId]);
		},
		scrollIntoView: function () { command('scrollIntoView', false); },
		showModal: function () { command('showModal', false); },
		close: function () { command('close', false); },
		getBoundingClientRect: function () {
			var box = facts().box;
			if (!box) throw new Error('the host measured no box for ' + id);
			return { x: box.x, y: box.y, left: box.x, top: box.y, width: box.width, height: box.height, right: box.x + box.width, bottom: box.y + box.height };
		},
	};
	var tag = (typeof classes === 'object' && classes[id.split('@')[0]]) || 'HTMLElement';
	if (g[tag] && g[tag].__dom) Object.setPrototypeOf(proxy, g[tag].prototype);
	Object.defineProperty(proxy, '__node', { value: id });
	// A file input's files are the picker's last choice until a handler assigns a FileList, as the DOM's are.
	Object.defineProperty(proxy, 'files', {
		get: function () { return isFileInput() ? host.fileListOf(chosen) : null; },
		set: function (list) {
			if (!isFileInput() || !list) return;
			chosen = Array.prototype.slice.call(list);
			// The input shows what it now holds, as the browser's does.
			host.out.commands.push([id, 'files', JSON.stringify(chosen.map(function (file) { return file.name; }))]);
		},
	});
	Object.defineProperty(proxy, '__choose', {
		value: function (files) {
			chosen = files.map(function (file) {
				var made = new g.File([], file.name, { type: file.type, lastModified: file.lastModified });
				Object.defineProperty(made, 'size', { value: file.size });
				return made;
			});
		},
	});
	Object.defineProperty(proxy, '__style', {
		value: function () {
			var direction = facts().direction || 'ltr';
			return {
				direction: direction,
				getPropertyValue: function (name) {
					if (name === 'direction') return direction;
					throw new Error('a phone answers only an element\'s direction from getComputedStyle(), not ' + name);
				},
			};
		},
	});
	proxies[id] = proxy;
	return proxy;
};
var elementsOf = function (value) { return Array.isArray(value) ? value.map(elementOf) : elementOf(value); };
// JSON writes Infinity and NaN as null: a value crosses with where each was, as nativeNonFiniteSplit and Join do.
var split = function (value) {
	var found = [];
	var walk = function (v, path) {
		if (typeof v === 'number' && !isFinite(v)) {
			found.push([path, v !== v ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity']);
			return null;
		}
		if (Array.isArray(v)) return v.map(function (item, k) { return walk(item, path.concat([k])); });
		if (v !== null && typeof v === 'object') {
			var out = {};
			for (var key in v) out[key] = walk(v[key], path.concat([key]));
			return out;
		}
		return v;
	};
	return { json: walk(value, []), nonFinite: found };
};
var NON_FINITE = { 'Infinity': Infinity, '-Infinity': -Infinity, 'NaN': NaN };
var join = function (json, nonFinite) {
	var root = json;
	(nonFinite || []).forEach(function (entry) {
		var path = entry[0];
		if (path.length === 0) { root = NON_FINITE[entry[1]]; return; }
		var at = root;
		for (var k = 0; k < path.length - 1; k++) at = at[path[k]];
		at[path[path.length - 1]] = NON_FINITE[entry[1]];
	});
	return root;
};
var stable = function (value) {
	var s = split(value);
	return JSON.stringify([s.json, s.nonFinite]);
};
var begin = function (entry) {
	host.origin = origin;
	elementFacts = entry.elements || {};
	captured = {};
	cells = join(entry.cells, entry.nonFinite);
	unset = {};
	forced = {};
	(entry.unset || []).forEach(function (slot) { unset[slot] = true; });
	before = {};
	for (var slot in cells) before[slot] = stable(cells[slot]);
	host.out = { timers: [], clears: [], requests: [], aborts: [], calls: [], logs: [], commands: [], pending: [], settled: [], raises: [], navigate: null };
	host.place = navigation && entry.kind !== 'compute' ? { routes: navigation.routes, path: pathOf(navigation.here, entry.params || {}) } : null;
	host.seed = entry.seed || null;
	host.focused = entry.focused || null;
	host.media = entry.media || null;
	host.screen = entry.screen || null;
	for (var known in entry.focusElements || {}) if (!elementFacts[known]) elementFacts[known] = entry.focusElements[known];
	host.focus = function () { return elementOf(host.focused || BODY); };
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
	var entries = frame["submitted form"];
	var target = entries ? new host.Form(entries) : { value: given.value === undefined ? '' : given.value, checked: given.checked === true };
	var detail;
	if (given.detail !== null && typeof given.detail === 'object') {
		detail = { reason: given.detail.reason };
		// Escape has no press: the key is absent, as on the web.
		if (given.detail.pressTarget != null) detail.pressTarget = elementOf(given.detail.pressTarget);
	}
	var event = {
		type: given.type,
		detail: detail,
		target: target,
		currentTarget: target,
		key: given.key,
		isTrusted: given.isTrusted !== false,
		isComposing: false,
		// A phone's browser reports a finger as a touch pointer.
		pointerType: String(given.type).indexOf('pointer') === 0 ? 'touch' : undefined,
		defaultPrevented: false,
		preventDefault: function () { this.defaultPrevented = true; },
		propagationStopped: false,
		stopPropagation: function () { this.propagationStopped = true; },
	};
	["button","buttons","clientX","clientY","pointerId","pointerType","isPrimary","timeStamp","detail","shiftKey","ctrlKey","altKey","metaKey","key"].forEach(function (field) { if (field in given) event[field] = given[field]; });
	// A dismiss's detail is an object whose pressTarget is an element; a click's detail is its press count.
	if (detail) event.detail = detail;
	if (typeof given.pointerType === 'string') {
		event.pressure = event.buttons > 0 ? 0.5 : 0;
		event.getCoalescedEvents = function () { return event.type === 'pointermove' ? [event] : []; };
	}
	if (given.nodes)
		["target","currentTarget","relatedTarget"].forEach(function (field) {
			event[field] = given.nodes[field] == null ? null : elementOf(given.nodes[field]);
		});
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
		if ('url' in binding) return binding.url;
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
	if (type === 'number') return value;
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
		host.enterScreen(entry.screen, entry.kind === 'tasks' && entry.leave);
		if (entry.kind === 'compute') {
			var value = fn(entry.fn)(frameOf(entry.frame))();
			host.out = null;
			return JSON.stringify(split(plain(value)));
		}
		if (entry.kind === 'dispatch') {
			var settled = function (error) { fail(entry['catch'], error); };
			var event = null;
			try {
				var frame = frameOf(entry.frame);
				if (entry.event.files && entry.event.nodes && entry.event.nodes.target) elementOf(entry.event.nodes.target).__choose(entry.event.files);
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
			// A click's stopPropagation() before it first awaits keeps the press from the handlers around it, as a browser's.
			if (event && event.propagationStopped && entry.event.type === 'click') host.out.stopped = true;
			// A handler that sets its text field's value writes the field, as the DOM's value setter does.
			if (event && typeof entry.event.value === 'string' && event.target && !(event.target instanceof host.Form) && typeof event.target.value === 'string' && event.target.value !== entry.event.value) host.out.value = event.target.value;
		} else if (entry.kind === 'document') {
			var heard = (host.listeners[entry.event.type] || []).slice();
			var bubbled = heard.length > 0 ? eventOf(entry.event, {}) : null;
			heard.forEach(function (listener) { try { listener(bubbled); } catch (error) { fail(null, error); } });
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
			if (stable(cells[slot]) === before[slot] && !forced[slot]) continue;
			var given = JSON.parse(JSON.stringify(split(cells[slot] === undefined ? null : cells[slot])));
			writes.push(given.nonFinite.length > 0 ? [slot, given.json, given.nonFinite] : [slot, given.json]);
		}
		var out = host.out;
		host.out = null;
		var left = { writes: writes, timers: out.timers, clears: out.clears, requests: out.requests, aborts: out.aborts, logs: out.logs, commands: out.commands, pending: out.pending, settled: out.settled, raises: out.raises };
		if (out.calls.length > 0) left.calls = out.calls;
		if (out.prevented) left.prevented = true;
		if (out.stopped) left.stopped = true;
		if (out.value !== undefined) left.value = out.value;
		if (out.navigate) left.navigate = out.navigate;
		// The document's listener types now, and the elements the entry that changed them held, whose facts later entries need.
		if (host.listened) {
			left.listening = Object.keys(host.listeners).filter(function (type) { return host.listeners[type].length > 0; });
			left.watch = Object.keys(proxies);
			host.listened = false;
		}
		return JSON.stringify(left);
	},
};
