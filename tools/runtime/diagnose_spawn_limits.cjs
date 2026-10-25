'use strict'

// Disposable hosted-worker diagnostic. Record sizes only, never values, and
// preserve the original spawn implementation, return value and thrown error.
const fs = require('node:fs')
const path = require('node:path')
const { ChildProcess } = require('node:child_process')

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || process.platform !== 'linux') {
  throw new Error('Spawn diagnostics require the disposable hosted Linux worker')
}

const originalSpawn = ChildProcess.prototype.spawn
ChildProcess.prototype.spawn = function (options) {
  try {
    return Reflect.apply(originalSpawn, this, [options])
  } catch (error) {
    if (error && error.code === 'E2BIG') {
      const env = (options.envPairs || []).map(pair => ({
        name: pair.slice(0, pair.indexOf('=')),
        bytes: Buffer.byteLength(pair) + 1,
      })).sort((a, b) => b.bytes - a.bytes)
      const args = (options.args || []).map((arg, index) => ({
        index,
        bytes: Buffer.byteLength(arg) + 1,
      }))
      const report = {
        error: error.code,
        environment_entries: env.length,
        environment_bytes: env.reduce((sum, item) => sum + item.bytes, 0),
        largest_environment_entries: env.slice(0, 20),
        argument_entries: args.length,
        argument_bytes: args.reduce((sum, item) => sum + item.bytes, 0),
        largest_arguments: args.sort((a, b) => b.bytes - a.bytes).slice(0, 10),
        values_recorded: false,
        original_error_rethrown: true,
      }
      const output = path.join(process.env.RUNNER_TEMP,
        'sharet-build-toolchain/reports/npm-source-spawn-limit-diagnostics.jsonl')
      fs.appendFileSync(output, JSON.stringify(report) + '\n')
    }
    throw error
  }
}
