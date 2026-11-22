// The WHATWG URL Standard's URL and URLSearchParams as plain JavaScript, for phone engines that lack them (JavaScriptCore
// and Hermes give a host neither). Runs inside the host services, where `g` is the engine's global object.
export const NATIVE_SCRIPT_URL = String.raw`if (typeof g.URL !== 'function' || typeof g.URLSearchParams !== 'function') (function () {
	var FAILURE = {};
	var SPECIAL = { 'ftp:': 21, 'file:': null, 'http:': 80, 'https:': 443, 'ws:': 80, 'wss:': 443 };
	var isSpecialScheme = function (scheme) { return Object.prototype.hasOwnProperty.call(SPECIAL, scheme + ':'); };
	var defaultPort = function (scheme) { return isSpecialScheme(scheme) ? SPECIAL[scheme + ':'] : null; };
	var codePoints = function (text) {
		var out = [];
		for (var index = 0; index < text.length; index++) {
			var unit = text.charCodeAt(index);
			if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < text.length) {
				var next = text.charCodeAt(index + 1);
				if (next >= 0xdc00 && next <= 0xdfff) { out.push(text.slice(index, index + 2)); index++; continue; }
			}
			out.push(text.charAt(index));
		}
		return out;
	};
	var toUSV = function (value) {
		var text = String(value), out = '';
		for (var index = 0; index < text.length; index++) {
			var unit = text.charCodeAt(index);
			if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < text.length && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
				out += text.slice(index, index + 2);
				index++;
			} else out += unit >= 0xd800 && unit <= 0xdfff ? '\ufffd' : text.charAt(index);
		}
		return out;
	};
	var codeOf = function (c) { return c.length === 2 ? (c.charCodeAt(0) - 0xd800) * 0x400 + c.charCodeAt(1) - 0xdc00 + 0x10000 : c.charCodeAt(0); };
	var utf8 = function (c) {
		var code = codeOf(c);
		if (c.length === 1 && code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
		if (code < 0x80) return [code];
		if (code < 0x800) return [0xc0 | (code >> 6), 0x80 | (code & 63)];
		if (code < 0x10000) return [0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63)];
		return [0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63)];
	};
	var hex = '0123456789ABCDEF';
	var byteText = function (byte) { return '%' + hex.charAt(byte >> 4) + hex.charAt(byte & 15); };
	var C0 = function (code) { return code <= 0x1f || code > 0x7e; };
	var inChars = function (chars, inner) { return function (code) { return inner(code) || chars.indexOf(String.fromCharCode(code)) >= 0; }; };
	var FRAGMENT_SET = inChars(' "<>\x60', C0);
	var QUERY_SET = inChars(' "#<>', C0);
	var SPECIAL_QUERY_SET = inChars("'", QUERY_SET);
	var PATH_SET = inChars('?^\x60{}', QUERY_SET);
	var USERINFO_SET = inChars('/:;=@[\\]^|', PATH_SET);
	var COMPONENT_SET = inChars('$%&+,', USERINFO_SET);
	var FORM_SET = inChars("!'()~", COMPONENT_SET);
	var encode = function (c, set, spaceAsPlus) {
		if (spaceAsPlus && c === ' ') return '+';
		var bytes = utf8(c), out = '';
		if (bytes.length === 1 && !set(bytes[0])) return c;
		for (var index = 0; index < bytes.length; index++) out += byteText(bytes[index]);
		return out;
	};
	var encodeText = function (text, set, spaceAsPlus) {
		var cps = codePoints(text), out = '';
		for (var index = 0; index < cps.length; index++) out += encode(cps[index], set, spaceAsPlus);
		return out;
	};
	var isHex = function (c) { return /^[0-9A-Fa-f]$/.test(c); };
	var percentDecode = function (text) {
		var bytes = [], cps = codePoints(text);
		for (var index = 0; index < cps.length; index++) {
			var c = cps[index];
			if (c === '%' && index + 2 < cps.length && isHex(cps[index + 1]) && isHex(cps[index + 2])) {
				bytes.push(parseInt(cps[index + 1] + cps[index + 2], 16));
				index += 2;
			} else bytes = bytes.concat(utf8(c));
		}
		return bytes;
	};
	var fromCode = function (code) {
		if (code < 0x10000) return String.fromCharCode(code);
		code -= 0x10000;
		return String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
	};
	var utf8Decode = function (bytes) {
		var out = '', index = 0;
		if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) index = 3;
		while (index < bytes.length) {
			var byte = bytes[index];
			if (byte < 0x80) { out += String.fromCharCode(byte); index++; continue; }
			var need = 0, code = 0, lower = 0x80, upper = 0xbf;
			if (byte >= 0xc2 && byte <= 0xdf) { need = 1; code = byte & 31; }
			else if (byte >= 0xe0 && byte <= 0xef) { need = 2; code = byte & 15; if (byte === 0xe0) lower = 0xa0; if (byte === 0xed) upper = 0x9f; }
			else if (byte >= 0xf0 && byte <= 0xf4) { need = 3; code = byte & 7; if (byte === 0xf0) lower = 0x90; if (byte === 0xf4) upper = 0x8f; }
			else { out += '\ufffd'; index++; continue; }
			var seen = 1;
			for (; seen <= need; seen++) {
				var next = bytes[index + seen];
				if (next === undefined || next < lower || next > upper) break;
				lower = 0x80; upper = 0xbf;
				code = (code << 6) | (next & 63);
			}
			if (seen <= need) { out += '\ufffd'; index += seen; continue; }
			out += fromCode(code);
			index += need + 1;
		}
		return out;
	};

	var punycode = function (label) {
		var input = codePoints(label).map(codeOf), output = '', n = 128, delta = 0, bias = 72, basic = 0;
		var digit = function (d) { return String.fromCharCode(d < 26 ? d + 97 : d + 22); };
		var adapt = function (value, points, first) {
			value = first ? Math.floor(value / 700) : value >> 1;
			value += Math.floor(value / points);
			var k = 0;
			for (; value > 455; k += 36) value = Math.floor(value / 35);
			return k + Math.floor((36 * value) / (value + 38));
		};
		for (var i = 0; i < input.length; i++) if (input[i] < 128) { output += String.fromCharCode(input[i]); basic++; }
		var handled = basic;
		if (basic > 0) output += '-';
		while (handled < input.length) {
			var m = Infinity;
			for (i = 0; i < input.length; i++) if (input[i] >= n && input[i] < m) m = input[i];
			delta += (m - n) * (handled + 1);
			n = m;
			for (i = 0; i < input.length; i++) {
				if (input[i] < n) delta++;
				if (input[i] === n) {
					var q = delta;
					for (var k = 36; ; k += 36) {
						var t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
						if (q < t) break;
						output += digit(t + ((q - t) % (36 - t)));
						q = Math.floor((q - t) / (36 - t));
					}
					output += digit(q);
					bias = adapt(delta, handled + 1, handled === basic);
					delta = 0;
					handled++;
				}
			}
			delta++;
			n++;
		}
		return output;
	};
	var domainToASCII = function (domain) {
		if (/[^\x00-\x7f]/.test(domain)) {
			var mapped = domain.toLowerCase();
			if (typeof mapped.normalize === 'function') mapped = mapped.normalize('NFKC').toLowerCase();
			mapped = mapped.replace(/[\u3002\uff0e\uff61]/g, '.');
			domain = mapped.split('.').map(function (label) { return /[^\x00-\x7f]/.test(label) ? 'xn--' + punycode(label) : label; }).join('.');
		}
		domain = domain.toLowerCase();
		return domain === '' ? FAILURE : domain;
	};
	var ipv4Number = function (text) {
		if (text === '') return FAILURE;
		var radix = 10;
		if (/^0[xX]/.test(text)) { radix = 16; text = text.slice(2); }
		else if (text.length > 1 && text.charAt(0) === '0') { radix = 8; text = text.slice(1); }
		if (text === '') return 0;
		if (!(radix === 10 ? /^[0-9]+$/ : radix === 16 ? /^[0-9A-Fa-f]+$/ : /^[0-7]+$/).test(text)) return FAILURE;
		return parseInt(text, radix);
	};
	var endsInNumber = function (text) {
		var parts = text.split('.');
		if (parts[parts.length - 1] === '') {
			if (parts.length === 1) return false;
			parts.pop();
		}
		var last = parts[parts.length - 1];
		if (last !== '' && /^[0-9]+$/.test(last)) return true;
		return ipv4Number(last) !== FAILURE;
	};
	var parseIPv4 = function (text) {
		var parts = text.split('.');
		if (parts[parts.length - 1] === '' && parts.length > 1) parts.pop();
		if (parts.length > 4) return FAILURE;
		var numbers = [];
		for (var index = 0; index < parts.length; index++) {
			var number = ipv4Number(parts[index]);
			if (number === FAILURE) return FAILURE;
			numbers.push(number);
		}
		for (index = 0; index < numbers.length - 1; index++) if (numbers[index] > 255) return FAILURE;
		if (numbers[numbers.length - 1] >= Math.pow(256, 5 - numbers.length)) return FAILURE;
		var address = numbers[numbers.length - 1];
		for (index = 0; index < numbers.length - 1; index++) address += numbers[index] * Math.pow(256, 3 - index);
		var out = [];
		for (index = 0; index < 4; index++) { out.unshift(String(address % 256)); address = Math.floor(address / 256); }
		return out.join('.');
	};
	var parseIPv6 = function (text) {
		var address = [0, 0, 0, 0, 0, 0, 0, 0], piece = 0, compress = null, pointer = 0, cps = codePoints(text);
		var at = function (offset) { return cps[pointer + (offset || 0)]; };
		if (at() === ':') {
			if (at(1) !== ':') return FAILURE;
			pointer += 2;
			compress = ++piece;
		}
		while (at() !== undefined) {
			if (piece === 8) return FAILURE;
			if (at() === ':') {
				if (compress !== null) return FAILURE;
				pointer++;
				compress = ++piece;
				continue;
			}
			var value = 0, length = 0;
			while (length < 4 && at() !== undefined && isHex(at())) { value = value * 16 + parseInt(at(), 16); pointer++; length++; }
			if (at() === '.') {
				if (length === 0) return FAILURE;
				pointer -= length;
				if (piece > 6) return FAILURE;
				var numbersSeen = 0;
				while (at() !== undefined) {
					var ipv4Piece = null;
					if (numbersSeen > 0) {
						if (at() === '.' && numbersSeen < 4) pointer++;
						else return FAILURE;
					}
					if (at() === undefined || !/^[0-9]$/.test(at())) return FAILURE;
					while (at() !== undefined && /^[0-9]$/.test(at())) {
						var number = parseInt(at(), 10);
						if (ipv4Piece === null) ipv4Piece = number;
						else if (ipv4Piece === 0) return FAILURE;
						else ipv4Piece = ipv4Piece * 10 + number;
						if (ipv4Piece > 255) return FAILURE;
						pointer++;
					}
					address[piece] = address[piece] * 0x100 + ipv4Piece;
					numbersSeen++;
					if (numbersSeen === 2 || numbersSeen === 4) piece++;
				}
				if (numbersSeen !== 4) return FAILURE;
				break;
			} else if (at() === ':') {
				pointer++;
				if (at() === undefined) return FAILURE;
			} else if (at() !== undefined) return FAILURE;
			address[piece] = value;
			piece++;
		}
		if (compress !== null) {
			var swaps = piece - compress;
			piece = 7;
			while (piece !== 0 && swaps > 0) {
				var swap = address[compress + swaps - 1];
				address[compress + swaps - 1] = address[piece];
				address[piece] = swap;
				piece--;
				swaps--;
			}
		} else if (piece !== 8) return FAILURE;
		var start = -1, best = 1;
		for (var index = 0; index < 8; ) {
			if (address[index] !== 0) { index++; continue; }
			var end = index;
			while (end < 8 && address[end] === 0) end++;
			if (end - index > best) { best = end - index; start = index; }
			index = end;
		}
		var out = '', ignore0 = false;
		for (index = 0; index < 8; index++) {
			if (ignore0 && address[index] === 0) continue;
			ignore0 = false;
			if (start === index) { out += index === 0 ? '::' : ':'; ignore0 = true; continue; }
			out += address[index].toString(16);
			if (index !== 7) out += ':';
		}
		return '[' + out + ']';
	};
	var parseHost = function (input, opaque) {
		if (input.charAt(0) === '[') {
			if (input.charAt(input.length - 1) !== ']') return FAILURE;
			return parseIPv6(input.slice(1, -1));
		}
		if (opaque) {
			if (/[\x00\t\n\r #/:<>?@[\\\]^|]/.test(input)) return FAILURE;
			return encodeText(input, C0);
		}
		var ascii = domainToASCII(utf8Decode(percentDecode(input)));
		if (ascii === FAILURE || /[\x00-\x20#%/:<>?@[\\\]^|\x7f]/.test(ascii)) return FAILURE;
		return endsInNumber(ascii) ? parseIPv4(ascii) : ascii;
	};

	var isDrive = function (text, normalized) { return text.length === 2 && /[A-Za-z]/.test(text.charAt(0)) && (text.charAt(1) === ':' || (!normalized && text.charAt(1) === '|')); };
	var startsWithDrive = function (cps, from) {
		return cps.length - from >= 2 && isDrive(cps[from] + cps[from + 1], false) && (cps.length - from === 2 || '/\\?#'.indexOf(cps[from + 2]) >= 0);
	};
	var shorten = function (url) {
		if (url.scheme === 'file' && url.path.length === 1 && isDrive(url.path[0], true)) return;
		url.path.pop();
	};
	var copyPath = function (path) { return typeof path === 'string' ? path : path.slice(); };
	var hasCredentials = function (url) { return url.username !== '' || url.password !== ''; };
	var stripTrailingSpaces = function (url) {
		if (typeof url.path !== 'string' || url.fragment !== null || url.query !== null) return;
		url.path = url.path.replace(/ +$/, '');
	};

	var parse = function (input, base, url, override) {
		if (!url) {
			url = { scheme: '', username: '', password: '', host: null, port: null, path: [], query: null, fragment: null };
			input = input.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');
		}
		input = input.replace(/[\t\n\r]/g, '');
		var state = override || 'scheme start', buffer = '', atSign = false, inBrackets = false, passwordToken = false;
		var cps = codePoints(input), pointer = 0;
		var special = function () { return isSpecialScheme(url.scheme); };
		var rest = function (offset) { return cps[pointer + offset]; };
		for (;;) {
			var c = cps[pointer];
			switch (state) {
				case 'scheme start':
					if (c !== undefined && /[A-Za-z]/.test(c)) { buffer += c.toLowerCase(); state = 'scheme'; }
					else if (!override) { state = 'no scheme'; pointer--; }
					else return FAILURE;
					break;
				case 'scheme':
					if (c !== undefined && /[A-Za-z0-9+.-]/.test(c)) buffer += c.toLowerCase();
					else if (c === ':') {
						if (override) {
							if (special() !== isSpecialScheme(buffer)) return url;
							if ((hasCredentials(url) || url.port !== null) && buffer === 'file') return url;
							if (url.scheme === 'file' && url.host === '') return url;
						}
						url.scheme = buffer;
						if (override) {
							if (url.port === defaultPort(url.scheme)) url.port = null;
							return url;
						}
						buffer = '';
						if (url.scheme === 'file') state = 'file';
						else if (special() && base && base.scheme === url.scheme) state = 'special relative or authority';
						else if (special()) state = 'special authority slashes';
						else if (rest(1) === '/') { state = 'path or authority'; pointer++; }
						else { url.path = ''; state = 'opaque path'; }
					} else if (!override) { buffer = ''; state = 'no scheme'; pointer = -1; }
					else return FAILURE;
					break;
				case 'no scheme':
					if (!base || (typeof base.path === 'string' && c !== '#')) return FAILURE;
					if (typeof base.path === 'string' && c === '#') {
						url.scheme = base.scheme; url.path = base.path; url.query = base.query; url.fragment = ''; state = 'fragment';
					} else if (base.scheme !== 'file') { state = 'relative'; pointer--; }
					else { state = 'file'; pointer--; }
					break;
				case 'special relative or authority':
					if (c === '/' && rest(1) === '/') { state = 'special authority ignore slashes'; pointer++; }
					else { state = 'relative'; pointer--; }
					break;
				case 'path or authority':
					if (c === '/') state = 'authority';
					else { state = 'path'; pointer--; }
					break;
				case 'relative':
					url.scheme = base.scheme;
					if (c === '/' || (special() && c === '\\')) state = 'relative slash';
					else {
						url.username = base.username; url.password = base.password; url.host = base.host; url.port = base.port;
						url.path = copyPath(base.path); url.query = base.query;
						if (c === '?') { url.query = ''; state = 'query'; }
						else if (c === '#') { url.fragment = ''; state = 'fragment'; }
						else if (c !== undefined) { url.query = null; shorten(url); state = 'path'; pointer--; }
					}
					break;
				case 'relative slash':
					if (special() && (c === '/' || c === '\\')) state = 'special authority ignore slashes';
					else if (c === '/') state = 'authority';
					else {
						url.username = base.username; url.password = base.password; url.host = base.host; url.port = base.port;
						state = 'path'; pointer--;
					}
					break;
				case 'special authority slashes':
					state = 'special authority ignore slashes';
					if (c === '/' && rest(1) === '/') pointer++;
					else pointer--;
					break;
				case 'special authority ignore slashes':
					if (c !== '/' && c !== '\\') { state = 'authority'; pointer--; }
					break;
				case 'authority':
					if (c === '@') {
						if (atSign) buffer = '%40' + buffer;
						atSign = true;
						var userinfo = codePoints(buffer);
						for (var index = 0; index < userinfo.length; index++) {
							if (userinfo[index] === ':' && !passwordToken) { passwordToken = true; continue; }
							if (passwordToken) url.password += encode(userinfo[index], USERINFO_SET);
							else url.username += encode(userinfo[index], USERINFO_SET);
						}
						buffer = '';
					} else if (c === undefined || c === '/' || c === '?' || c === '#' || (special() && c === '\\')) {
						if (atSign && buffer === '') return FAILURE;
						pointer -= codePoints(buffer).length + 1;
						buffer = '';
						state = 'host';
					} else buffer += c;
					break;
				case 'host':
				case 'hostname':
					if (override && url.scheme === 'file') { pointer--; state = 'file host'; }
					else if (c === ':' && !inBrackets) {
						if (buffer === '') return FAILURE;
						if (override === 'hostname') return FAILURE;
						var host = parseHost(buffer, !special());
						if (host === FAILURE) return FAILURE;
						url.host = host; buffer = ''; state = 'port';
					} else if (c === undefined || c === '/' || c === '?' || c === '#' || (special() && c === '\\')) {
						pointer--;
						if (special() && buffer === '') return FAILURE;
						if (override && buffer === '' && (hasCredentials(url) || url.port !== null)) return FAILURE;
						host = parseHost(buffer, !special());
						if (host === FAILURE) return FAILURE;
						url.host = host; buffer = ''; state = 'path start';
						if (override) return url;
					} else {
						if (c === '[') inBrackets = true;
						if (c === ']') inBrackets = false;
						buffer += c;
					}
					break;
				case 'port':
					if (c !== undefined && /[0-9]/.test(c)) buffer += c;
					else if (c === undefined || c === '/' || c === '?' || c === '#' || (special() && c === '\\') || override) {
						if (buffer !== '') {
							var port = parseInt(buffer, 10);
							if (port > 65535) return FAILURE;
							url.port = port === defaultPort(url.scheme) ? null : port;
							buffer = '';
							if (override) return url;
						}
						if (override) return FAILURE;
						state = 'path start'; pointer--;
					} else return FAILURE;
					break;
				case 'file':
					url.scheme = 'file';
					url.host = '';
					if (c === '/' || c === '\\') state = 'file slash';
					else if (base && base.scheme === 'file') {
						url.host = base.host; url.path = copyPath(base.path); url.query = base.query;
						if (c === '?') { url.query = ''; state = 'query'; }
						else if (c === '#') { url.fragment = ''; state = 'fragment'; }
						else if (c !== undefined) {
							url.query = null;
							if (!startsWithDrive(cps, pointer)) shorten(url);
							else url.path = [];
							state = 'path'; pointer--;
						}
					} else { state = 'path'; pointer--; }
					break;
				case 'file slash':
					if (c === '/' || c === '\\') state = 'file host';
					else {
						if (base && base.scheme === 'file') {
							url.host = base.host;
							if (!startsWithDrive(cps, pointer) && typeof base.path !== 'string' && base.path.length > 0 && isDrive(base.path[0], true)) url.path.push(base.path[0]);
						}
						state = 'path'; pointer--;
					}
					break;
				case 'file host':
					if (c === undefined || c === '/' || c === '\\' || c === '?' || c === '#') {
						pointer--;
						if (!override && isDrive(buffer, false)) state = 'path';
						else if (buffer === '') {
							url.host = '';
							if (override) return url;
							state = 'path start';
						} else {
							host = parseHost(buffer, !special());
							if (host === FAILURE) return FAILURE;
							if (host === 'localhost') host = '';
							url.host = host;
							if (override) return url;
							buffer = ''; state = 'path start';
						}
					} else buffer += c;
					break;
				case 'path start':
					if (special()) { state = 'path'; if (c !== '/' && c !== '\\') pointer--; }
					else if (!override && c === '?') { url.query = ''; state = 'query'; }
					else if (!override && c === '#') { url.fragment = ''; state = 'fragment'; }
					else if (c !== undefined) { state = 'path'; if (c !== '/') pointer--; }
					else if (override && url.host === null) url.path.push('');
					break;
				case 'path':
					if (c === undefined || c === '/' || (special() && c === '\\') || (!override && (c === '?' || c === '#'))) {
						var slash = c === '/' || (special() && c === '\\');
						var lower = buffer.toLowerCase();
						if (lower === '..' || lower === '.%2e' || lower === '%2e.' || lower === '%2e%2e') {
							shorten(url);
							if (!slash) url.path.push('');
						} else if (lower === '.' || lower === '%2e') {
							if (!slash) url.path.push('');
						} else {
							if (url.scheme === 'file' && url.path.length === 0 && isDrive(buffer, false)) buffer = buffer.charAt(0) + ':';
							url.path.push(buffer);
						}
						buffer = '';
						if (c === '?') { url.query = ''; state = 'query'; }
						if (c === '#') { url.fragment = ''; state = 'fragment'; }
					} else buffer += encode(c, PATH_SET);
					break;
				case 'opaque path':
					if (c === '?') { url.query = ''; state = 'query'; }
					else if (c === '#') { url.fragment = ''; state = 'fragment'; }
					else if (c === ' ') url.path += rest(1) === '?' || rest(1) === '#' ? '%20' : ' ';
					else if (c !== undefined) url.path += encode(c, C0);
					break;
				case 'query':
					if ((!override && c === '#') || c === undefined) {
						url.query += encodeText(buffer, special() ? SPECIAL_QUERY_SET : QUERY_SET);
						buffer = '';
						if (c === '#') { url.fragment = ''; state = 'fragment'; }
					} else buffer += c;
					break;
				case 'fragment':
					if (c !== undefined) url.fragment += encode(c, FRAGMENT_SET);
					break;
			}
			if (pointer >= cps.length) break;
			pointer++;
		}
		return url;
	};
	var pathText = function (url) { return typeof url.path === 'string' ? url.path : url.path.length === 0 ? '' : '/' + url.path.join('/'); };
	var serialize = function (url, excludeFragment) {
		var out = url.scheme + ':';
		if (url.host !== null) {
			out += '//';
			if (hasCredentials(url)) out += url.username + (url.password !== '' ? ':' + url.password : '') + '@';
			out += url.host;
			if (url.port !== null) out += ':' + url.port;
		} else if (typeof url.path !== 'string' && url.path.length > 1 && url.path[0] === '') out += '/.';
		out += pathText(url);
		if (url.query !== null) out += '?' + url.query;
		if (!excludeFragment && url.fragment !== null) out += '#' + url.fragment;
		return out;
	};
	var originOf = function (url) {
		if (url.scheme === 'blob') {
			var inner = parse(pathText(url), null);
			return inner !== FAILURE && (inner.scheme === 'http' || inner.scheme === 'https') ? originOf(inner) : 'null';
		}
		if (!isSpecialScheme(url.scheme) || url.scheme === 'file') return 'null';
		return url.scheme + '://' + url.host + (url.port !== null ? ':' + url.port : '');
	};

	var formParse = function (text) {
		var list = [], sequences = text.split('&');
		for (var index = 0; index < sequences.length; index++) {
			var bytes = sequences[index];
			if (bytes === '') continue;
			var at = bytes.indexOf('='), name = at < 0 ? bytes : bytes.slice(0, at), value = at < 0 ? '' : bytes.slice(at + 1);
			list.push([utf8Decode(percentDecode(name.replace(/\+/g, ' '))), utf8Decode(percentDecode(value.replace(/\+/g, ' ')))]);
		}
		return list;
	};
	var formSerialize = function (list) {
		return list.map(function (pair) { return encodeText(pair[0], FORM_SET, true) + '=' + encodeText(pair[1], FORM_SET, true); }).join('&');
	};
	var iterate = function (source, kind) {
		var index = 0;
		var iterator = {
			next: function () {
				var list = source._list;
				if (index >= list.length) return { value: undefined, done: true };
				var pair = list[index++];
				return { value: kind === 'key' ? pair[0] : kind === 'value' ? pair[1] : [pair[0], pair[1]], done: false };
			},
		};
		if (typeof Symbol === 'function' && Symbol.iterator) iterator[Symbol.iterator] = function () { return this; };
		return iterator;
	};
	var toList = function (value) {
		if (Array.isArray(value)) return value;
		var out = [], iterator = value[Symbol.iterator](), step;
		while (!(step = iterator.next()).done) out.push(step.value);
		return out;
	};

	var URLSearchParams = function URLSearchParams(init) {
		if (!(this instanceof URLSearchParams)) throw new TypeError("Failed to construct 'URLSearchParams': Please use the 'new' operator.");
		var list = [];
		Object.defineProperty(this, '_list', { value: list, writable: true });
		Object.defineProperty(this, '_url', { value: null, writable: true });
		if (init === undefined) return;
		if (init !== null && (typeof init === 'object' || typeof init === 'function')) {
			if (typeof Symbol === 'function' && typeof init[Symbol.iterator] === 'function') {
				var pairs = toList(init);
				for (var index = 0; index < pairs.length; index++) {
					var pair = pairs[index];
					if (pair === null || (typeof pair !== 'object' && typeof pair !== 'function')) throw new TypeError("Failed to construct 'URLSearchParams': The provided value cannot be converted to a sequence.");
					pair = toList(pair);
					if (pair.length !== 2) throw new TypeError("Failed to construct 'URLSearchParams': Sequence initializer must only contain pair elements");
					list.push([toUSV(pair[0]), toUSV(pair[1])]);
				}
			} else {
				var keys = Object.keys(init);
				for (index = 0; index < keys.length; index++) list.push([toUSV(keys[index]), toUSV(init[keys[index]])]);
			}
			return;
		}
		var text = toUSV(init);
		this._list = formParse(text.charAt(0) === '?' ? text.slice(1) : text);
	};
	var update = function (params) {
		var url = params._url;
		if (!url) return;
		var query = formSerialize(params._list);
		url._record.query = query === '' ? null : query;
		if (query === '') stripTrailingSpaces(url._record);
	};
	var needs = function (count, given, method) {
		if (given < count) throw new TypeError("Failed to execute '" + method + "' on 'URLSearchParams': " + count + ' argument' + (count > 1 ? 's' : '') + ' required, but only ' + given + ' present.');
	};
	URLSearchParams.prototype = {
		constructor: URLSearchParams,
		append: function (name, value) { needs(2, arguments.length, 'append'); this._list.push([toUSV(name), toUSV(value)]); update(this); },
		delete: function (name, value) {
			needs(1, arguments.length, 'delete');
			name = toUSV(name);
			var match = value === undefined ? null : toUSV(value);
			this._list = this._list.filter(function (pair) { return !(pair[0] === name && (match === null || pair[1] === match)); });
			update(this);
		},
		get: function (name) {
			needs(1, arguments.length, 'get');
			name = toUSV(name);
			for (var index = 0; index < this._list.length; index++) if (this._list[index][0] === name) return this._list[index][1];
			return null;
		},
		getAll: function (name) {
			needs(1, arguments.length, 'getAll');
			name = toUSV(name);
			return this._list.filter(function (pair) { return pair[0] === name; }).map(function (pair) { return pair[1]; });
		},
		has: function (name, value) {
			needs(1, arguments.length, 'has');
			name = toUSV(name);
			var match = value === undefined ? null : toUSV(value);
			return this._list.some(function (pair) { return pair[0] === name && (match === null || pair[1] === match); });
		},
		set: function (name, value) {
			needs(2, arguments.length, 'set');
			name = toUSV(name);
			value = toUSV(value);
			var found = false;
			this._list = this._list.filter(function (pair) {
				if (pair[0] !== name) return true;
				if (found) return false;
				found = true;
				pair[1] = value;
				return true;
			});
			if (!found) this._list.push([name, value]);
			update(this);
		},
		sort: function () {
			this._list = this._list
				.map(function (pair, index) { return [pair, index]; })
				.sort(function (a, b) { return a[0][0] < b[0][0] ? -1 : a[0][0] > b[0][0] ? 1 : a[1] - b[1]; })
				.map(function (entry) { return entry[0]; });
			update(this);
		},
		forEach: function (callback, thisArg) {
			needs(1, arguments.length, 'forEach');
			for (var index = 0; index < this._list.length; index++) callback.call(thisArg, this._list[index][1], this._list[index][0], this);
		},
		keys: function () { return iterate(this, 'key'); },
		values: function () { return iterate(this, 'value'); },
		entries: function () { return iterate(this, 'pair'); },
		toString: function () { return formSerialize(this._list); },
	};
	Object.defineProperty(URLSearchParams.prototype, 'size', { get: function () { return this._list.length; } });
	if (typeof Symbol === 'function' && Symbol.iterator) URLSearchParams.prototype[Symbol.iterator] = URLSearchParams.prototype.entries;

	var URL = function URL(url, base) {
		if (!(this instanceof URL)) throw new TypeError("Failed to construct 'URL': Please use the 'new' operator.");
		if (arguments.length < 1) throw new TypeError("Failed to construct 'URL': 1 argument required, but only 0 present.");
		var parsedBase = null;
		if (base !== undefined) {
			parsedBase = parse(toUSV(base), null);
			if (parsedBase === FAILURE) throw new TypeError("Failed to construct 'URL': Invalid base URL");
		}
		var record = parse(toUSV(url), parsedBase);
		if (record === FAILURE) throw new TypeError("Failed to construct 'URL': Invalid URL");
		Object.defineProperty(this, '_record', { value: record, writable: true });
		var params = new URLSearchParams(record.query || '');
		params._url = this;
		Object.defineProperty(this, '_params', { value: params });
	};
	var cannotHaveCredentials = function (record) { return record.host === null || record.host === '' || record.scheme === 'file'; };
	var accessor = function (name, get, set) {
		Object.defineProperty(URL.prototype, name, { enumerable: true, configurable: true, get: get, set: set });
	};
	URL.prototype = {
		constructor: URL,
		toString: function () { return serialize(this._record); },
		toJSON: function () { return serialize(this._record); },
	};
	accessor('href', function () { return serialize(this._record); }, function (value) {
		var record = parse(toUSV(value), null);
		if (record === FAILURE) throw new TypeError("Failed to set the 'href' property on 'URL': Invalid URL");
		this._record = record;
		this._params._list = record.query ? formParse(record.query) : [];
	});
	accessor('origin', function () { return originOf(this._record); });
	accessor('protocol', function () { return this._record.scheme + ':'; }, function (value) { parse(toUSV(value) + ':', null, this._record, 'scheme start'); });
	accessor('username', function () { return this._record.username; }, function (value) {
		if (!cannotHaveCredentials(this._record)) this._record.username = encodeText(toUSV(value), USERINFO_SET);
	});
	accessor('password', function () { return this._record.password; }, function (value) {
		if (!cannotHaveCredentials(this._record)) this._record.password = encodeText(toUSV(value), USERINFO_SET);
	});
	accessor('host', function () {
		var record = this._record;
		if (record.host === null) return '';
		return record.port === null ? record.host : record.host + ':' + record.port;
	}, function (value) { if (typeof this._record.path !== 'string') parse(toUSV(value), null, this._record, 'host'); });
	accessor('hostname', function () { return this._record.host === null ? '' : this._record.host; }, function (value) {
		if (typeof this._record.path !== 'string') parse(toUSV(value), null, this._record, 'hostname');
	});
	accessor('port', function () { return this._record.port === null ? '' : String(this._record.port); }, function (value) {
		if (cannotHaveCredentials(this._record)) return;
		value = toUSV(value);
		if (value === '') this._record.port = null;
		else parse(value, null, this._record, 'port');
	});
	accessor('pathname', function () { return pathText(this._record); }, function (value) {
		if (typeof this._record.path === 'string') return;
		this._record.path = [];
		parse(toUSV(value), null, this._record, 'path start');
	});
	accessor('search', function () { var query = this._record.query; return query === null || query === '' ? '' : '?' + query; }, function (value) {
		value = toUSV(value);
		if (value === '') {
			this._record.query = null;
			this._params._list = [];
			stripTrailingSpaces(this._record);
			return;
		}
		var input = value.charAt(0) === '?' ? value.slice(1) : value;
		this._record.query = '';
		parse(input, null, this._record, 'query');
		this._params._list = formParse(input);
	});
	accessor('searchParams', function () { return this._params; });
	accessor('hash', function () { var fragment = this._record.fragment; return fragment === null || fragment === '' ? '' : '#' + fragment; }, function (value) {
		value = toUSV(value);
		if (value === '') {
			this._record.fragment = null;
			stripTrailingSpaces(this._record);
			return;
		}
		this._record.fragment = '';
		parse(value.charAt(0) === '#' ? value.slice(1) : value, null, this._record, 'fragment');
	});
	URL.canParse = function (url, base) {
		try { new URL(url, base); return true; } catch (error) { return false; }
	};
	URL.parse = function (url, base) {
		try { return new URL(url, base); } catch (error) { return null; }
	};
	g.URL = URL;
	g.URLSearchParams = URLSearchParams;
})();`;
