#!/usr/bin/env node
/**
 * Build the desktop app's backend closure: deploy the built `dsh` CLI
 * (`@deepseek-ai/dsh`) plus its production dependency tree into
 * `apps/desktop/resources/backend`, then replace every staged symlink with
 * real bytes so the packaged app needs no repository and no pnpm store.
 *
 * The deploy flags mirror the SDK runtime distribution build
 * (scripts/build-exe-for-python-sdk.ts), which grounds them in measurement:
 * `--legacy` is the mandatory path with inject-workspace-packages off; hoisted
 * gives a stable single-instance layout that the materialization pass makes
 * symlink-free; disabling automatic peer installation prevents undeclared
 * peers from expanding the closure; link-workspace-packages selects direct
 * workspace dependencies. The deploy root is the wrapper manifest
 * apps/desktop/closure (dsh-desktop-backend), which declares the peers the
 * CLI's runtime tree imports but does not depend on — the same mechanism the
 * SDK runtime manifest uses. The web profile serves the frontend from
 * `@deepseek-ai/dsh-web-frontend/dist`, which rides in the closure through
 * `@deepseek-ai/dsh-web-app`'s dependency on it.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, cp, lstat, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// scripts/build-backend.mjs → apps/desktop → apps → repo root (four pops from the file).
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..')
const dest = join(repoRoot, 'apps', 'desktop', 'resources', 'backend')
/** The deployed entry and the frontend dist the web profile serves. The deploy
 * root is the wrapper manifest dsh-desktop-backend, so the CLI and every
 * dependency land under node_modules. */
const ENTRY = join(dest, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const FRONTEND_INDEX = join(dest, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html')
const PRESETS = join(dest, 'node_modules', '@deepseek-ai', 'dsh', 'config', 'agent-presets')

function run(label, command, args) {
  console.log(`build-backend: ${label}: ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' },
  })
  if (result.status !== 0) {
    console.error(`build-backend: ${label} failed (status ${String(result.status)})`)
    process.exit(result.status ?? 1)
  }
}

/** Drop package-manager .bin link directories from the closure. */
async function removeBinLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory() && entry.name === '.bin') {
      await rm(path, { recursive: true, force: true })
      continue
    }
    if (entry.isDirectory()) await removeBinLinks(path)
  }
}

/** Return the first symlink below a directory, if one exists. */
async function findSymlink(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink()) return path
    if (metadata.isDirectory()) {
      const nested = await findSymlink(path)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

/**
 * Copy every workspace package the deployed closure references but omits, in
 * from its workspace source tree (vendor/* and packages/<group>/<pkg>). The
 * deploy runs with auto-install-peers=false and link: overrides, so both
 * undeclared peers and link-overridden dependencies (e.g. cosmokit/schemastery)
 * can be absent; every package the closure's manifests name is resolved
 * against the closure, and the gaps are filled from the workspace by their
 * published layout (the package.json files field). Registry packages are never
 * restored: a missing registry dependency is a genuine deploy failure.
 */
async function restoreMissingPackages() {
  const closureModules = join(dest, 'node_modules')

  // name → workspace source dir + manifest for every workspace package.
  const workspace = new Map()
  const packageGroups = await readdir(join(repoRoot, 'packages'), { withFileTypes: true })
  const bases = ['vendor', ...packageGroups.filter((entry) => entry.isDirectory()).map((group) => join('packages', group.name))]
  for (const base of bases) {
    const baseDir = join(repoRoot, base)
    for (const entry of await readdir(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(baseDir, entry.name)
      try {
        const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
        if (typeof manifest.name === 'string') workspace.set(manifest.name, { dir, manifest })
      } catch {
        // A directory without a manifest is not a package.
      }
    }
  }

  // Every name the closure's installed packages (and the deploy root) reference.
  const needed = new Set()
  const collect = (manifest) => {
    for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const name of Object.keys(manifest[section] ?? {})) needed.add(name)
    }
  }
  const readManifests = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const path = join(dir, entry.name)
      try {
        collect(JSON.parse(await readFile(join(path, 'package.json'), 'utf8')))
      } catch {
        // A directory without a manifest is not a package.
      }
      await readManifests(path)
    }
  }
  await readManifests(closureModules)
  collect(JSON.parse(await readFile(join(dest, 'package.json'), 'utf8')))

  // Expand one package.json files entry to concrete copy targets.
  const pickTargets = (manifest) => {
    const files = manifest.files ?? []
    if (files.length === 0) return ['lib', 'dist', 'config', 'assets', 'cordis.patch.yml', 'package.json']
    const targets = []
    for (const entry of files) {
      if (typeof entry !== 'string' || entry.startsWith('!')) continue
      const star = entry.indexOf('*')
      // A glob names a subtree; copy its base directory.
      const path = star === -1 ? entry : entry.slice(0, star).replace(/\.$/, '')
      if (path !== '' && !targets.includes(path)) targets.push(path)
    }
    if (!targets.includes('package.json')) targets.push('package.json')
    return targets
  }

  const restored = []
  for (const name of [...needed].sort()) {
    if (existsSync(join(closureModules, name))) continue
    const source = workspace.get(name)
    if (source === undefined) {
      console.warn(`build-backend: missing ${name} is not a workspace package; leaving it absent (registry deploy gap)`)
      continue
    }
    const destination = join(closureModules, name)
    await mkdir(destination, { recursive: true })
    for (const rel of pickTargets(source.manifest)) {
      const from = join(source.dir, rel)
      if (!existsSync(from)) continue
      await cp(from, join(destination, rel), { recursive: true, dereference: true })
    }
    restored.push(name)
  }
  if (restored.length > 0) console.log(`build-backend: restored missing workspace packages: ${restored.join(', ')}`)
}


/** Replace every symlink in the closure with its target bytes, repeatedly. */
async function materializeSymlinks(directory) {
  let remaining = await findSymlink(directory)
  while (remaining !== undefined) {
    const source = await realpath(remaining)
    const nestedNodeModules = join(source, 'node_modules')
    await rm(remaining, { recursive: true, force: true })
    const metadata = await lstat(source)
    if (metadata.isDirectory()) {
      await cp(source, remaining, {
        recursive: true,
        dereference: true,
        filter: (path) => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
      })
    } else {
      await mkdir(dirname(remaining), { recursive: true })
      await copyFile(source, remaining)
    }
    remaining = await findSymlink(directory)
  }
}

await rm(dest, { recursive: true, force: true })
await mkdir(dest, { recursive: true })
run('deploy', 'pnpm', [
  '--filter', 'dsh-desktop-backend',
  'deploy',
  '--legacy', '--prod',
  '--config.node-linker=hoisted',
  '--config.auto-install-peers=false',
  '--config.link-workspace-packages=true',
  dest,
])
console.log('build-backend: materializing staged links (this can take a while)')
await removeBinLinks(dest)
await materializeSymlinks(dest)
await restoreMissingPackages()
// Restored packages may contain store links; materialize once more.
await materializeSymlinks(dest)
for (const [label, path] of [['entry', ENTRY], ['frontend index', FRONTEND_INDEX], ['agent presets', PRESETS]]) {
  try {
    await lstat(path)
    console.log(`build-backend: verified ${label}: ${path}`)
  } catch {
    console.error(`build-backend: missing ${label}: ${path}`)
    process.exit(1)
  }
}
console.log(`build-backend: closure ready at ${dest}`)
