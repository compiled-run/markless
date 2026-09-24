import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function readBuildId(): string {
  try {
    let recorded = JSON.parse(readFileSync(join(process.cwd(), 'build-info.json'), 'utf8'))
    if (typeof recorded.buildId === 'string' && recorded.buildId) return recorded.buildId
  } catch {}
  if (process.env.BENCHMARK_BUILD_ID) return process.env.BENCHMARK_BUILD_ID
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

export const buildId = readBuildId()
