const list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
const pair = (v, flag) => {
	const eq = v.indexOf('=');
	if (eq < 1) throw new Error(`${flag} expects name=value`);
	return [v.slice(0, eq), v.slice(eq + 1)];
};

export function parseArgs(argv, defaults) {
	const out = { networkShaping: 'proxy', ...defaults, urls: {}, upstreams: {}, proxyPorts: {}, shapedProxyPorts: {}, variants: {}, sourceRevisions: {} };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = () => {
			const v = argv[++i];
			if (v === undefined) throw new Error(`${arg} needs a value`);
			return v;
		};
		const num = () => Number(next());
		switch (arg) {
			case '--visits': out.visits = num(); break;
			case '--warmup': out.warmup = num(); break;
			case '--targets': out.targets = list(next()); break;
			case '--cases': out.cases = list(next()); break;
			case '--phases': out.phases = list(next()); break;
			case '--profiles': out.profiles = list(next()); break;
			case '--browsers': out.browsers = list(next()); break;
			case '--out': out.out = next(); break;
			case '--action-timeout': out.actionTimeoutMs = num(); break;
			case '--nav-timeout': out.navTimeoutMs = num(); break;
			case '--settle-timeout': out.settleTimeoutMs = num(); break;
			case '--drain-timeout': out.drainTimeoutMs = num(); break;
			case '--transport': out.transport = next(); break;
			case '--network-shaping': out.networkShaping = next(); break;
			case '--shaped-proxy-port': { const [k, v] = pair(next(), arg); out.shapedProxyPorts[k] = Number(v); break; }
			case '--chromium-channel': out.chromiumChannel = next(); break;
			case '--headed': out.headed = true; break;
			case '--skip-correctness': out.skipCorrectness = true; break;
			case '--target-url': { const [k, v] = pair(next(), arg); out.urls[k] = v; break; }
			case '--target-upstream': { const [k, v] = pair(next(), arg); out.upstreams[k] = v; break; }
			case '--proxy-port': { const [k, v] = pair(next(), arg); out.proxyPorts[k] = Number(v); break; }
			case '--variant': { const [k, v] = pair(next(), arg); out.variants[k] = v; break; }
			case '--source-revision': { const [k, v] = pair(next(), arg); out.sourceRevisions[k] = v; break; }
			case '--help': case '-h': out.help = true; break;
			default: throw new Error(`unknown argument ${arg}`);
		}
	}
	for (const key of ['visits', 'warmup', 'actionTimeoutMs', 'navTimeoutMs', 'settleTimeoutMs', 'drainTimeoutMs'])
		if (out[key] !== undefined && (!Number.isFinite(out[key]) || out[key] < 0)) throw new Error(`invalid ${key}: ${out[key]}`);
	if (!['proxy', 'cdp'].includes(out.networkShaping)) throw new Error('--network-shaping must be proxy or cdp');
	if (!['proxy', 'direct'].includes(out.transport)) throw new Error('--transport must be proxy or direct');
	return out;
}
