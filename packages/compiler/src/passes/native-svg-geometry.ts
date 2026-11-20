// What a phone's script engine runs to turn a `d` or `viewBox` that follows state into the numbers a native drawing
// draws: `parsePathData` and the viewBox grammar of native-drawing.ts, as plain JavaScript. A unit test holds the two
// to the same outlines.

/** Defines `__svgPath(d)` (the outline as Dragon's verb-coded numbers, space-separated) and `__svgViewBox(text)`. */
export const SVG_GEOMETRY_SOURCE = String.raw`var __svgNumber = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
var __svgArc = function (x1, y1, rxIn, ryIn, degrees, large, sweep, x2, y2) {
	if (x1 === x2 && y1 === y2) return [];
	var rx = Math.abs(rxIn), ry = Math.abs(ryIn);
	if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
	var phi = ((degrees % 360) * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
	var dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
	var px = cos * dx + sin * dy, py = -sin * dx + cos * dy;
	var lambda = (px * px) / (rx * rx) + (py * py) / (ry * ry);
	if (lambda > 1) {
		rx *= Math.sqrt(lambda);
		ry *= Math.sqrt(lambda);
	}
	var numerator = rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px;
	var denominator = rx * rx * py * py + ry * ry * px * px;
	var factor = Math.sqrt(Math.max(0, numerator / denominator));
	if (large === sweep) factor = -factor;
	var cxp = (factor * rx * py) / ry, cyp = (-factor * ry * px) / rx;
	var cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
	var angle = function (ux, uy, vx, vy) { return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); };
	var theta = angle(1, 0, (px - cxp) / rx, (py - cyp) / ry);
	var delta = angle((px - cxp) / rx, (py - cyp) / ry, (-px - cxp) / rx, (-py - cyp) / ry);
	if (!sweep && delta > 0) delta -= 2 * Math.PI;
	if (sweep && delta < 0) delta += 2 * Math.PI;
	var count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
	var step = delta / count, k = (4 / 3) * Math.tan(step / 4);
	var point = function (t) {
		var ex = Math.cos(t), ey = Math.sin(t);
		return {
			x: cx + rx * cos * ex - ry * sin * ey,
			y: cy + rx * sin * ex + ry * cos * ey,
			dx: -rx * cos * ey - ry * sin * ex,
			dy: -rx * sin * ey + ry * cos * ex,
		};
	};
	var cubics = [];
	for (var n = 0; n < count; n++) {
		var a = point(theta + n * step), b = point(theta + (n + 1) * step), last = n === count - 1;
		cubics.push([a.x + k * a.dx, a.y + k * a.dy, b.x - k * b.dx, b.y - k * b.dy, last ? x2 : b.x, last ? y2 : b.y]);
	}
	return cubics;
};
// The outline drawn up to the first error, as a browser draws a path whose data goes wrong part way.
var __svgOutline = function (raw) {
	var s = raw == null ? '' : String(raw), outline = [], i = 0;
	var skip = function () { while (i < s.length && /[\s,]/.test(s[i])) i++; };
	var readNumber = function () {
		skip();
		var match = __svgNumber.exec(s.slice(i));
		if (!match) return null;
		i += match[0].length;
		return Number(match[0]);
	};
	var readFlag = function () {
		skip();
		var c = s[i];
		if (c !== '0' && c !== '1') return null;
		i++;
		return c === '1' ? 1 : 0;
	};
	var x = 0, y = 0, startX = 0, startY = 0, lastControl = null, command = '', first = true;
	var cubic = function (x1, y1, x2, y2, ex, ey) {
		outline.push(3, x1, y1, x2, y2, ex, ey);
		x = ex;
		y = ey;
	};
	var counts = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2 };
	for (;;) {
		skip();
		if (i >= s.length) break;
		var c = s[i];
		if (/[a-zA-Z]/.test(c)) {
			command = c;
			i++;
		} else if (command === '' || command === 'z' || command === 'Z') return outline;
		if (first && command !== 'M' && command !== 'm') return outline;
		first = false;
		var relative = command === command.toLowerCase();
		var ox = relative ? x : 0, oy = relative ? y : 0, upper = command.toUpperCase();
		if (upper === 'Z') {
			outline.push(4);
			x = startX;
			y = startY;
			lastControl = null;
			continue;
		}
		if (upper === 'A') {
			var rx = readNumber(), ry = readNumber(), rotation = readNumber(), large = readFlag(), sweep = readFlag();
			var endX = readNumber(), endY = readNumber();
			if (rx === null || ry === null || rotation === null || large === null || sweep === null || endX === null || endY === null)
				return outline;
			var arcs = __svgArc(x, y, rx, ry, rotation, large, sweep, endX + ox, endY + oy);
			for (var a = 0; a < arcs.length; a++) cubic(arcs[a][0], arcs[a][1], arcs[a][2], arcs[a][3], arcs[a][4], arcs[a][5]);
			x = endX + ox;
			y = endY + oy;
			lastControl = null;
			continue;
		}
		var count = counts[upper] || 0, values = [];
		for (var n = 0; n < count; n++) {
			var value = readNumber();
			if (value === null) return outline;
			values.push(value);
		}
		if (!(upper in counts)) return outline;
		if (upper === 'M') {
			x = values[0] + ox;
			y = values[1] + oy;
			startX = x;
			startY = y;
			outline.push(0, x, y);
			command = relative ? 'l' : 'L';
			lastControl = null;
		} else if (upper === 'L' || upper === 'H' || upper === 'V') {
			if (upper === 'L') {
				x = values[0] + ox;
				y = values[1] + oy;
			} else if (upper === 'H') x = values[0] + ox;
			else y = values[0] + oy;
			outline.push(1, x, y);
			lastControl = null;
		} else if (upper === 'C') {
			lastControl = { x: values[2] + ox, y: values[3] + oy, quad: false };
			cubic(values[0] + ox, values[1] + oy, values[2] + ox, values[3] + oy, values[4] + ox, values[5] + oy);
		} else if (upper === 'S') {
			var sx1 = lastControl && !lastControl.quad ? 2 * x - lastControl.x : x;
			var sy1 = lastControl && !lastControl.quad ? 2 * y - lastControl.y : y;
			lastControl = { x: values[0] + ox, y: values[1] + oy, quad: false };
			cubic(sx1, sy1, values[0] + ox, values[1] + oy, values[2] + ox, values[3] + oy);
		} else {
			var qx, qy, ex, ey;
			if (upper === 'Q') {
				qx = values[0] + ox;
				qy = values[1] + oy;
				ex = values[2] + ox;
				ey = values[3] + oy;
			} else {
				qx = lastControl && lastControl.quad ? 2 * x - lastControl.x : x;
				qy = lastControl && lastControl.quad ? 2 * y - lastControl.y : y;
				ex = values[0] + ox;
				ey = values[1] + oy;
			}
			lastControl = { x: qx, y: qy, quad: true };
			cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey);
		}
	}
	return outline;
};
var __svgPath = function (d) { return __svgOutline(d).join(' '); };
// min-x, min-y, width and height, or null for a viewBox the browser ignores (not four numbers, or no area).
var __svgViewBox = function (raw) {
	var rest = raw == null ? '' : String(raw).trim(), values = [];
	while (rest.length > 0) {
		var match = __svgNumber.exec(rest);
		if (!match) return null;
		values.push(Number(match[0]));
		rest = rest.slice(match[0].length).replace(/^\s*,?\s*/, '');
	}
	if (values.length !== 4 || values[2] <= 0 || values[3] <= 0) return null;
	return values.join(' ');
};
`;
