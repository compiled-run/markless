import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const appDir = fileURLToPath(new URL('..', import.meta.url))
execFileSync(process.execPath, [fileURLToPath(new URL('../../../shared/sync.mjs', import.meta.url)), appDir, 'app/shared', '--check'], { stdio: 'inherit' })

let buildId = process.env.BENCHMARK_BUILD_ID
if (!buildId && process.env.VERCEL_GIT_COMMIT_SHA) buildId = process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8)
if (!buildId) {
  buildId = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: appDir, encoding: 'utf8' }).trim()
}
writeFileSync(new URL('../build-info.json', import.meta.url), JSON.stringify({ buildId }) + '\n')
console.log(`build-info.json buildId=${buildId}`)
