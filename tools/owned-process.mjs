// A process a tool starts, and the scratch directories it leaves, die with the
// tool: on process.exit, on SIGTERM, SIGINT or SIGHUP, and on SIGKILL, where
// nothing inside the tool runs. Pinned by tools/owned-process-check.
//
// Between the tool and the process sits a small supervisor, this file run as a
// script, in a session of its own so a signal to the tool's process group
// spares it. The tool holds the only write end of the supervisor's stdin, the
// tether, which the kernel closes however the tool ends. On end of file the
// supervisor stops the process's whole group (SIGTERM, then SIGKILL, so a
// browser spinning or stopped goes too), removes the directories and exits. It
// does the same when the process ends by itself or a signal reaches the
// supervisor. Only a SIGKILL of the supervisor itself leaves the process behind.
//
// A returned child is a ChildProcess whose pid is the supervisor's: `stop()`
// closes the tether and resolves when the process is gone and the directories
// are removed, `exitCode` and the 'exit' event follow the process, and `stdout`
// and `stderr` carry its output when asked for. Like any child it holds the
// tool's event loop open until it ends.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { constants, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
/** How long a process has to end on SIGTERM before SIGKILL. */
const TERM_GRACE_MS = 1000
/** How long a SIGKILLed group has to disappear before its directories are removed anyway. */
const KILL_WAIT_MS = 2000
/** The longest temporary root a browser's scratch sits under: Chromium makes a
 * socket two levels below it, and a socket path holds 104 bytes on the Mac,
 * whose default $TMPDIR alone is about 50. */
const LONGEST_TMP_ROOT = 40

function tethered(command, args, { env = process.env, remove = [], stdout = 'ignore', stderr = 'ignore' }) {
  const child = spawn(process.execPath, [SELF, '--supervise', JSON.stringify({ command, args, remove })], {
    detached: true,
    stdio: ['pipe', stdout, stderr],
    env,
  })
  child.stop = () => new Promise((done) => {
    if (child.exitCode !== null || child.signalCode !== null) return done()
    child.once('exit', () => done())
    child.stdin.destroy()
  })
  return child
}

/** Start `command` with `args` so that it dies with this process and `remove`
 * goes with it. `env` is its environment; `stdout` and `stderr` are 'ignore',
 * 'inherit' or 'pipe'. */
export const spawnOwned = (command, args, options = {}) => tethered(command, args, options)

/** A new directory under the temporary root, removed when this process ends.
 * It holds no process open and keeps no event loop alive. */
export function ownedTempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  const child = tethered(null, [], { remove: [dir] })
  child.unref()
  child.stdin.unref()
  return dir
}

/** Start Chromium ($X0K_CHROMIUM, else `chromium` on PATH) with `args` and a
 * profile of its own, as a child of `spawnOwned`. Its profile and the temporary
 * files it makes outside the profile both sit in one directory, `child.profile`
 * inside it, removed with the browser. */
export function spawnBrowser(args, { env = process.env, stderr = 'ignore' } = {}) {
  const root = tmpdir().length > LONGEST_TMP_ROOT ? '/tmp' : tmpdir()
  const dir = mkdtempSync(join(root, 'x0k-browser-'))
  const profile = join(dir, 'profile')
  const child = spawnOwned(process.env.X0K_CHROMIUM ?? 'chromium', [`--user-data-dir=${profile}`, ...args], {
    env: { ...env, TMPDIR: dir },
    remove: [dir],
    stderr,
  })
  child.profile = profile
  return child
}

/** The supervisor: see the top of this file. */
function supervise({ command, args, remove }) {
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
  let group = null
  const groupAlive = () => {
    if (group === null) return false
    try { process.kill(-group, 0); return true } catch (e) { return e.code === 'EPERM' }
  }
  const signalGroup = (signal) => { try { process.kill(-group, signal) } catch { /* the group is gone */ } }
  const groupGoneWithin = async (ms) => {
    for (const end = Date.now() + ms; groupAlive() && Date.now() < end;) await sleep(20)
    return !groupAlive()
  }
  let finishing = false
  const finish = async (code) => {
    if (finishing) return
    finishing = true
    if (groupAlive()) {
      signalGroup('SIGTERM')
      if (!await groupGoneWithin(TERM_GRACE_MS)) {
        signalGroup('SIGKILL')
        await groupGoneWithin(KILL_WAIT_MS)
      }
    }
    for (const dir of remove) {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) } catch (e) {
        console.error(`owned-process: ${dir} was not removed: ${e.message}`)
      }
    }
    process.exit(code)
  }
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => finish(128 + constants.signals[signal]))
  process.stdin.on('end', () => finish(0))
  process.stdin.on('close', () => finish(0))
  process.stdin.on('error', () => finish(0))
  process.stdin.resume()
  if (command === null) return
  const child = spawn(command, args, { detached: true, stdio: ['ignore', 'inherit', 'inherit'] })
  group = child.pid ?? null
  child.on('error', (e) => {
    console.error(`owned-process: ${command} did not start: ${e.message}`)
    finish(127)
  })
  child.on('exit', (code, signal) => finish(code ?? 128 + constants.signals[signal]))
}

if (process.argv[1] === SELF && process.argv[2] === '--supervise') supervise(JSON.parse(process.argv[3]))
