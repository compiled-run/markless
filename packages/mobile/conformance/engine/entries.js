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
	if (id === "#unbound") return undefined;
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
	elementFacts = entry.elements || {};
	proxies = {};
	cells = join(entry.cells, entry.nonFinite);
	unset = {};
	forced = {};
	(entry.unset || []).forEach(function (slot) { unset[slot] = true; });
	before = {};
	for (var slot in cells) before[slot] = stable(cells[slot]);
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
	var entries = frame["submitted form"];
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
	["button","buttons","clientX","clientY","pointerId","pointerType","isPrimary","timeStamp"].forEach(function (field) { if (field in given) event[field] = given[field]; });
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
			if (stable(cells[slot]) === before[slot] && !forced[slot]) continue;
			var given = JSON.parse(JSON.stringify(split(cells[slot] === undefined ? null : cells[slot])));
			writes.push(given.nonFinite.length > 0 ? [slot, given.json, given.nonFinite] : [slot, given.json]);
		}
		var out = host.out;
		host.out = null;
		var left = { writes: writes, timers: out.timers, clears: out.clears, requests: out.requests, aborts: out.aborts, logs: out.logs, commands: out.commands, pending: out.pending, settled: out.settled };
		if (out.calls.length > 0) left.calls = out.calls;
		if (out.prevented) left.prevented = true;
		if (out.navigate) left.navigate = out.navigate;
		return JSON.stringify(left);
	},
};
