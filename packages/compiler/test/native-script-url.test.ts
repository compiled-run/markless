import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { NATIVE_SCRIPT_URL } from '../src/passes/native-script-url.ts';

// Node's URL and URLSearchParams follow the URL Standard; the phone's copy must answer every case as they do.
const context = createContext({});
runInContext(`(function (g) {\n${NATIVE_SCRIPT_URL}\n})(globalThis);`, context);
const PhoneURL = runInContext('URL', context);
const PhoneURLSearchParams = runInContext('URLSearchParams', context);
const fields = [
	'href',
	'origin',
	'protocol',
	'username',
	'password',
	'host',
	'hostname',
	'port',
	'pathname',
	'search',
	'hash',
];
const view = (U: any, input: string, base?: string) => {
	try {
		const url = base === undefined ? new U(input) : new U(input, base);
		return Object.fromEntries(fields.map((field) => [field, url[field]]));
	} catch {
		return 'invalid';
	}
};
const cases: [string, string?][] = [
	['https://shop.example/account/settings/'],
	['../orders/7?tab=items#top', 'https://shop.example/account/settings/'],
	['HTTP://EXAMPLE.COM:80/a/./b/../c'],
	['https://user:pa ss@host.com:8443/p?q=1 2#f g'],
	['http://[::1]:8080/'],
	['http://[2001:db8:0:0:1:0:0:1]/'],
	['http://[::ffff:192.168.0.1]/'],
	['http://0x7f.1/'],
	['http://192.168.0.257/'],
	['http://1.2.3.4.5/'],
	['http://999999999999/'],
	['mailto:someone@example.com'],
	['javascript:alert(1) '],
	['data:text/plain,hello world'],
	['foo://bar/baz?x#y'],
	['foo:/a/../b'],
	['foo:///x'],
	['file:///C:/Windows/../x'],
	['file:c:\\foo\\bar'],
	['file://localhost/etc'],
	['/x/y?z', 'file:///a/b'],
	['C|/x', 'file:///a/b'],
	['//other.org/p', 'https://a.b/c'],
	['?q', 'https://a.b/c/d?e#f'],
	['#h', 'https://a.b/c/d?e'],
	['', 'https://a.b/c/d?e#f'],
	['   https://a.b/\t\nc  '],
	['https://a.b/%2e%2E/x'],
	['https://a.b/ä?ä#ä'],
	['https://münchen.de/'],
	['https://EXAMPLE.ｃｏｍ/'],
	["https://a.b/c?d='e'"],
	['ws://a.b:80/'],
	['https://a.b:65536/'],
	['https:///'],
	['https://@a.b/'],
	['https://a@b@c/'],
	['http://a b/'],
	['http://a%20b/'],
	['blob:https://a.b/uuid'],
	['non-spec:/.//p'],
	['https://a.b\\c\\d'],
	['sc://ñ/'],
	['https://x/{}^`|'],
	['relative'],
	['https://a.b/?a=%zz'],
	['HTTPS://A.B/%7e'],
	['https://xn--mnchen-3ya.de/'],
	['http://1.2.3.09/'],
	['http://0300.0250.0.1/'],
	['https://a.b/p q#x y'],
	['data:x ?y'],
	['https://a.b/😀'],
	['https://a.b:/x'],
	['https://a.b:0/x'],
	['http://[1::2::3]/'],
	['http://[::1.2.3.4]/'],
	['http://[0:0:0:0:0:0:13.1.68.3]/'],
	['git+ssh://git@github.com/a/b.git'],
];

const setters: [string, string, string][] = [
	['https://a.b/c?d#e', 'search', '?x=1 2'],
	['https://a.b/c?d#e', 'search', ''],
	['https://a.b/c?d#e', 'hash', '#z y'],
	['https://a.b/c?d#e', 'hash', ''],
	['https://a.b/c', 'pathname', '/x/../y z'],
	['https://a.b/c', 'host', 'other.org:8080'],
	['https://a.b/c', 'hostname', 'other.org:8080'],
	['https://a.b/c', 'port', '443'],
	['https://a.b/c', 'port', '8080abc'],
	['https://a.b/c', 'port', 'abc'],
	['https://a.b/c', 'protocol', 'http'],
	['https://a.b/c', 'protocol', 'foo'],
	['foo://a/c', 'protocol', 'https'],
	['https://a.b/c', 'username', 'us er'],
	['https://a.b/c', 'password', 'p@ss'],
	['file:///c', 'username', 'x'],
	['mailto:x', 'pathname', 'y'],
	['https://a.b/c', 'href', 'http://x.y/'],
	['data:x  #f', 'hash', ''],
	['https://a.b:8080/', 'protocol', 'http'],
	['http://a.b:443/', 'protocol', 'https'],
	['https://a.b/c', 'host', ''],
	['file://h/c', 'host', 'localhost'],
];

const sp = (S: any) => {
	const out: any[] = [];
	const p = new S('?a=1&b=2+3&a=%E2%82%AC&c&=d&e=%zz&f=%C3');
	out.push(
		p.toString(),
		p.getAll('a'),
		p.get('b'),
		p.get('c'),
		p.has('a', '1'),
		p.size,
		[...p],
		[...p.keys()],
	);
	p.set('a', 'x y&z');
	p.delete('b');
	p.append("~!*()'", 'é');
	p.sort();
	out.push(p.toString());
	out.push(
		new S({ q: 'hats & caps', page: 2 }).toString(),
		new S([
			['x', '1'],
			['x', '2'],
		]).toString(),
		new S(new S('k=v')).toString(),
		new S(null).toString(),
		new S('\ud800=1').toString(),
	);
	const u = new (S === PhoneURLSearchParams ? PhoneURL : URL)('https://a.b/?x=1#h');
	u.searchParams.set('y', '2 3');
	out.push(u.href);
	u.searchParams.delete('x');
	u.searchParams.delete('y');
	out.push(u.href);
	u.search = '?z=9';
	out.push(u.searchParams.get('z'));
	const f: string[] = [];
	new S('a=1&b=2').forEach((v: string, k: string) => f.push(k + v));
	out.push(f);
	try {
		new S([['a']]);
	} catch {
		out.push('pairerr');
	}
	return JSON.stringify(out);
};

describe('URL and URLSearchParams for phone JavaScript', () => {
	it('is installed only where the engine lacks them', () => {
		expect(runInContext('typeof URL', context)).toBe('function');
		expect(PhoneURL).not.toBe(URL);
	});
	it.each(cases)('parses %j against %j as the URL Standard does', (input, base) => {
		expect(view(PhoneURL, input, base)).toEqual(view(URL, input, base));
	});
	it.each(setters)('%s with %s = %j', (href, field, value) => {
		const run = (U: any) => {
			const url = new U(href);
			url[field] = value;
			return Object.fromEntries(fields.map((name) => [name, url[name]]));
		};
		expect(run(PhoneURL)).toEqual(run(URL));
	});
	it("parses, edits, sorts and serializes search params, and keeps a URL's query in step", () => {
		expect(sp(PhoneURLSearchParams)).toBe(sp(URLSearchParams));
	});
});
