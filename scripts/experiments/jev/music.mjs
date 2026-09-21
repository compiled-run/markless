import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createJev, choice } from './client.mjs';

const output = '/tmp/jev-experiments/music';
mkdirSync(output, { recursive: true });
const url = JSON.parse(readFileSync('/tmp/jev-experiments/server.json')).url;
const mode = process.argv.includes('--replay') ? 'replay' : process.argv.includes('--check') ? 'check' : 'compare';
const api = mode === 'compare' ? createJev() : null;
const browser = await chromium.launch({ headless: true });
const rngFor = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const stateKey = state => `${state.track}:${state.playing}:${state.libraryOpen}`;

async function openPage() {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.YT = {
      PlayerState: { CUED: 5, ENDED: 0, PAUSED: 2, PLAYING: 1 },
      Player: class {
        constructor(target, options) {
          this.options = options;
          const replacement = document.createElement('iframe');
          replacement.title = 'Experiment media test double';
          target.replaceWith(replacement);
          setTimeout(() => options.events.onReady(), 0);
        }
        cueVideoById() { this.options.events.onStateChange({ data: 5 }); }
        loadVideoById() { this.options.events.onStateChange({ data: 1 }); }
        pauseVideo() { this.options.events.onStateChange({ data: 2 }); }
        playVideo() { this.options.events.onStateChange({ data: 1 }); }
        getDuration() { return 180; }
        getCurrentTime() { return 0; }
        seekTo() {}
        destroy() {}
      },
    };
  });
  await context.route('**/*', async route => {
    const target = new URL(route.request().url());
    if (target.origin === new URL(url).origin) return route.continue();
    return route.fulfill({ status: 204, body: '' });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.song-title').waitFor();
  return { context, page, errors };
}

async function observe(page) {
  return page.evaluate(() => {
    const songs = [...document.querySelectorAll('.library-song')].map(el => ({ title: el.querySelector('h3').textContent, selected: el.classList.contains('selected'), image: el.querySelector('img').getAttribute('src') }));
    const title = document.querySelector('.song-title').textContent;
    const host = document.querySelector('.youtube-frame-host');
    return { title, track: songs.findIndex(song => song.title === title), playing: document.querySelector('.play').classList.contains('active'), libraryOpen: document.querySelector('.App').classList.contains('library-active'), rotating: document.querySelector('.record').classList.contains('rotating'), selectedTracks: songs.flatMap((song, i) => song.selected ? [i] : []), commandVersion: Number(host.dataset.commandVersion), videoId: host.dataset.videoId, expectedVideoId: songs.find(song => song.title === title)?.image.match(/\/vi\/([^/]+)/)?.[1], trackCount: songs.length };
  });
}

function actions(state) {
  return {
    toggle_play: state.playing ? 'Pause playback' : 'Start playback',
    next: 'Move to the next track, wrapping at the end',
    previous: 'Move to the previous track, wrapping at the beginning',
    toggle_library: state.libraryOpen ? 'Close the library' : 'Open the library',
    ...(state.libraryOpen ? Object.fromEntries(Array.from({ length: state.trackCount }, (_, i) => [`select_${i}`, `Select library track ${i + 1}`])) : {}),
  };
}

async function execute(page, action) {
  if (action === 'toggle_play') return page.getByRole('button', { name: 'Play or pause', exact: true }).click();
  if (action === 'next') return page.getByRole('button', { name: 'Next track', exact: true }).click();
  if (action === 'previous') return page.getByRole('button', { name: 'Previous track', exact: true }).click();
  if (action === 'toggle_library') return page.locator('.library-button').click();
  return page.locator('.library-song').nth(Number(action.slice(7))).click();
}

function expectedAfter(before, action) {
  return {
    track: action === 'next' ? (before.track + 1) % before.trackCount : action === 'previous' ? (before.track + before.trackCount - 1) % before.trackCount : action.startsWith('select_') ? Number(action.slice(7)) : before.track,
    playing: action === 'toggle_play' ? !before.playing : before.playing,
    libraryOpen: action === 'toggle_library' ? !before.libraryOpen : before.libraryOpen,
    commandVersion: before.commandVersion + (action === 'toggle_library' ? 0 : 1),
  };
}

const results = [];
const replayData = mode === 'replay' ? JSON.parse(readFileSync(`${output}/results.json`)) : null;
const runs = replayData ? replayData.runs.map(r => ({ policy: r.policy, seed: r.seed, fixed: r.steps.map(s => s.action), original: r })) : mode === 'check' ? [{ policy: 'check', seed: 17, fixed: ['toggle_play', 'next', 'toggle_library', 'select_2', 'toggle_play', 'toggle_library'] }] : [17, 29, 43].flatMap((seed, index) => ['random', 'least_visited', 'jev'].map((_, i, policies) => ({ seed, policy: policies[(i + index) % policies.length] })));

try {
  for (const run of runs) {
    const { context, page, errors } = await openPage();
    const start = performance.now();
    const rng = rngFor(run.seed);
    const visits = {};
    const transitions = new Set();
    const states = new Set();
    const steps = [];
    let failure = null;
    for (let step = 0; step < (run.fixed?.length ?? 16); step++) {
      const before = await observe(page);
      states.add(stateKey(before));
      const available = actions(before);
      const ids = Object.keys(available);
      let action = run.fixed?.[step];
      let decisionMilliseconds = 0;
      if (!action && run.policy === 'jev') {
        const started = performance.now();
        const response = await api.ask({ state: { current: before, available, visits, recent: steps.slice(-5).map(s => ({ before: stateKey(s.before), action: s.action, after: stateKey(s.after) })) }, questions: { action: choice('Choose the next available action to explore untested state transitions and expose inconsistent state in this music-player UI. Prefer meaningful new combinations over repeating the same action in the same state. Return one available action.', available) } }, `music/${run.seed}/${step}`);
        action = response.answers.action.choice;
        decisionMilliseconds = performance.now() - started;
      }
      if (!action && run.policy === 'least_visited') {
        const lowest = Math.min(...ids.map(id => visits[`${stateKey(before)}/${id}`] ?? 0));
        const options = ids.filter(id => (visits[`${stateKey(before)}/${id}`] ?? 0) === lowest);
        action = options[Math.floor(rng() * options.length)];
      }
      action ??= ids[Math.floor(rng() * ids.length)];
      const expected = expectedAfter(before, action);
      try {
        await execute(page, action);
        await page.waitForFunction(expected => {
          const songs = [...document.querySelectorAll('.library-song h3')].map(el => el.textContent);
          return songs.indexOf(document.querySelector('.song-title').textContent) === expected.track && document.querySelector('.play').classList.contains('active') === expected.playing && document.querySelector('.App').classList.contains('library-active') === expected.libraryOpen;
        }, expected, { timeout: 3000 });
        await page.waitForTimeout(80);
      } catch (error) { failure = { kind: 'action-or-settle', message: error.message.slice(0, 700) }; }
      const after = await observe(page);
      const mismatches = Object.keys(expected).filter(key => after[key] !== expected[key]);
      if (after.rotating !== after.playing || JSON.stringify(after.selectedTracks) !== JSON.stringify([after.track]) || after.videoId !== after.expectedVideoId) mismatches.push('visible-state-agreement');
      if (errors.length) mismatches.push('pageerror');
      if (mismatches.length) failure ??= { kind: 'invariant', mismatches, errors: [...errors] };
      if (run.original && JSON.stringify(after) !== JSON.stringify(run.original.steps[step].after)) failure ??= { kind: 'replay-divergence', step };
      steps.push({ before, action, after, expected, decisionMilliseconds, failure });
      visits[`${stateKey(before)}/${action}`] = (visits[`${stateKey(before)}/${action}`] ?? 0) + 1;
      transitions.add(`${stateKey(before)}/${action}/${stateKey(after)}`);
      states.add(stateKey(after));
      if (failure) break;
    }
    const result = { policy: run.policy, seed: run.seed, milliseconds: performance.now() - start, uniqueStates: states.size, uniqueTransitions: transitions.size, steps, failure };
    results.push(result);
    writeFileSync(`${output}/${mode === 'compare' ? 'results' : mode}.json`, JSON.stringify({ fixture: 'current SSR music-player', media: 'deterministic test double with foreign DOM replacement', mode, runs: results, usage: api?.usage() }, null, 2));
    console.log(JSON.stringify({ policy: run.policy, seed: run.seed, steps: steps.length, states: states.size, transitions: transitions.size, failure, milliseconds: Math.round(result.milliseconds) }));
    await context.close();
  }
} finally {
  await browser.close();
}
