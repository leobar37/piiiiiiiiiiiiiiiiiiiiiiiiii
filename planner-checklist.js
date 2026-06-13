#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const VALID_STATUSES = new Set(['pending', 'in_progress', 'blocked', 'completed', 'skipped'])
const TASK_ID_PATTERN = /^T-\d{3}$/
const PROJECT_ROOT = process.cwd()

function fail(message) {
  console.error(`Error: ${message}`)
  process.exit(1)
}

function usage() {
  console.log(`planner-checklist

Usage:
  node ./planner-checklist.js list [plan-slug-or-path]
  node ./planner-checklist.js remaining [plan-slug-or-path]
  node ./planner-checklist.js next [plan-slug-or-path]
  node ./planner-checklist.js status [plan-slug-or-path] <TASK_ID>
  node ./planner-checklist.js start [plan-slug-or-path] <TASK_ID>
  node ./planner-checklist.js complete [plan-slug-or-path] <TASK_ID>
  node ./planner-checklist.js block [plan-slug-or-path] <TASK_ID>
  node ./planner-checklist.js reset [plan-slug-or-path] <TASK_ID>
  node ./planner-checklist.js export [plan-slug-or-path]

Resolution:
  - The command should be run from the project root
  - If omitted, the script uses the only structured plan found under .plans/
  - If given a slug, it resolves .plans/<slug>/
  - If given a path to a plan folder, it uses that folder
  - New plans use tasks/*.md frontmatter as the source of truth
  - Legacy plans without task frontmatter fall back to checklist.json
`)
}

function discoverPlanDirs() {
  const plansDir = path.join(PROJECT_ROOT, '.plans')
  if (!fs.existsSync(plansDir)) return []

  return fs.readdirSync(plansDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(plansDir, entry.name))
    .filter((planDir) => fs.existsSync(path.join(planDir, 'tasks')) || fs.existsSync(path.join(planDir, 'checklist.json')))
}

function resolvePlanDir(planRef) {
  if (!planRef) {
    const discovered = discoverPlanDirs()
    if (discovered.length === 1) return discovered[0]
    if (discovered.length === 0) fail(`No structured plans found under ${path.join(PROJECT_ROOT, '.plans')}`)
    fail('Multiple structured plans found. Pass a plan slug or path explicitly.')
  }

  const directPath = path.resolve(PROJECT_ROOT, planRef)
  if (fs.existsSync(directPath)) {
    const stats = fs.statSync(directPath)
    if (stats.isDirectory()) return directPath
    if (stats.isFile() && path.basename(directPath) === 'checklist.json') return path.dirname(directPath)
    fail(`Plan reference must be a plan folder or checklist.json: ${directPath}`)
  }

  return path.join(PROJECT_ROOT, '.plans', planRef)
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => path.join(dir, file))
}

function parseScalar(value) {
  const trimmed = value.trim()
  if (trimmed === '[]') return []
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim()
    if (!inner) return []
    return inner.split(',').map((item) => item.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseFrontmatter(raw, filePath) {
  if (!raw.startsWith('---\n')) return null
  const end = raw.indexOf('\n---', 4)
  if (end === -1) fail(`Unclosed frontmatter in ${filePath}`)

  const bodyStart = raw.indexOf('\n', end + 4)
  const frontmatterRaw = raw.slice(4, end).trim()
  const body = bodyStart === -1 ? '' : raw.slice(bodyStart + 1)
  const frontmatter = {}

  for (const line of frontmatterRaw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf(':')
    if (separator === -1) fail(`Invalid frontmatter line in ${filePath}: ${line}`)
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1)
    frontmatter[key] = parseScalar(value)
  }

  return { frontmatter, body }
}

function formatValue(value) {
  if (Array.isArray(value)) return `[${value.join(', ')}]`
  return String(value)
}

function serializeFrontmatter(frontmatter, body) {
  const preferredOrder = ['id', 'title', 'status', 'phase', 'dependencies', 'requirements']
  const keys = [
    ...preferredOrder.filter((key) => key in frontmatter),
    ...Object.keys(frontmatter).filter((key) => !preferredOrder.includes(key)).sort(),
  ]

  const lines = keys.map((key) => `${key}: ${formatValue(frontmatter[key])}`)
  return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`
}

function readMarkdownTasks(planDir) {
  const taskDir = path.join(planDir, 'tasks')
  const files = listMarkdownFiles(taskDir)
  const tasks = []

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = parseFrontmatter(raw, filePath)
    if (!parsed) continue

    const relativeFile = path.relative(planDir, filePath)
    const titleFromBody = parsed.body.match(/^#\s+(.+)$/m)?.[1]
    const task = {
      id: parsed.frontmatter.id,
      title: parsed.frontmatter.title || titleFromBody || path.basename(filePath, '.md'),
      file: relativeFile,
      status: parsed.frontmatter.status,
      phase: parsed.frontmatter.phase || 'implementation',
      dependencies: Array.isArray(parsed.frontmatter.dependencies) ? parsed.frontmatter.dependencies : [],
      requirements: Array.isArray(parsed.frontmatter.requirements) ? parsed.frontmatter.requirements : [],
      _source: 'markdown',
      _path: filePath,
      _frontmatter: parsed.frontmatter,
      _body: parsed.body,
    }
    tasks.push(task)
  }

  return tasks
}

function readLegacyChecklist(planDir) {
  const checklistPath = path.join(planDir, 'checklist.json')
  if (!fs.existsSync(checklistPath)) return null

  let data
  try {
    data = JSON.parse(fs.readFileSync(checklistPath, 'utf8'))
  } catch (error) {
    fail(`Invalid JSON in ${checklistPath}: ${error.message}`)
  }

  if (!Array.isArray(data.tasks)) fail(`Legacy checklist must contain a tasks array: ${checklistPath}`)

  return {
    source: 'legacy-json',
    planDir,
    legacyPath: checklistPath,
    tasks: data.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      file: task.file,
      status: task.status,
      phase: task.phase || 'implementation',
      dependencies: task.dependencies || task.dependsOn || [],
      requirements: task.requirements || [],
      _source: 'legacy-json',
    })),
    raw: data,
  }
}

function validateTasks(tasks, sourceLabel) {
  const ids = new Set()

  for (const task of tasks) {
    if (!task.id || typeof task.id !== 'string') fail(`Task missing id in ${sourceLabel}`)
    if (!TASK_ID_PATTERN.test(task.id)) fail(`Task id must match T-001 format, got ${task.id} in ${sourceLabel}`)
    if (ids.has(task.id)) fail(`Duplicate task id ${task.id} in ${sourceLabel}`)
    ids.add(task.id)

    if (!task.title || typeof task.title !== 'string') fail(`Task ${task.id} must have title string in ${sourceLabel}`)
    if (!task.file || typeof task.file !== 'string') fail(`Task ${task.id} must have file string in ${sourceLabel}`)
    if (!task.phase || typeof task.phase !== 'string') fail(`Task ${task.id} must have phase string in ${sourceLabel}`)
    if (!VALID_STATUSES.has(task.status)) fail(`Invalid status ${task.status} for task ${task.id} in ${sourceLabel}`)
    if (!Array.isArray(task.dependencies)) fail(`Task ${task.id} must have dependencies array in ${sourceLabel}`)
    if (!Array.isArray(task.requirements)) fail(`Task ${task.id} must have requirements array in ${sourceLabel}`)
  }

  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!ids.has(dependency)) fail(`Task ${task.id} depends on unknown task ${dependency} in ${sourceLabel}`)
    }
  }
}

function readPlan(planRef) {
  const planDir = resolvePlanDir(planRef)
  if (!fs.existsSync(planDir)) fail(`Plan folder not found: ${planDir}`)

  const markdownTasks = readMarkdownTasks(planDir)
  if (markdownTasks.length > 0) {
    validateTasks(markdownTasks, path.join(planDir, 'tasks'))
    return { source: 'markdown', planDir, tasks: markdownTasks }
  }

  const legacy = readLegacyChecklist(planDir)
  if (legacy) {
    validateTasks(legacy.tasks, legacy.legacyPath)
    return legacy
  }

  fail(`No frontmatter task files or legacy checklist.json found in ${planDir}`)
}

function publicTask(task) {
  const { _source, _path, _frontmatter, _body, ...rest } = task
  return rest
}

function writePlan(plan, tasks) {
  if (plan.source === 'legacy-json') {
    const byId = new Map(tasks.map((task) => [task.id, task]))
    plan.raw.tasks = plan.raw.tasks.map((task) => ({
      ...task,
      status: byId.get(task.id)?.status ?? task.status,
    }))
    fs.writeFileSync(plan.legacyPath, `${JSON.stringify(plan.raw, null, 2)}\n`, 'utf8')
    return
  }

  for (const task of tasks) {
    const frontmatter = {
      ...task._frontmatter,
      id: task.id,
      title: task.title,
      status: task.status,
      phase: task.phase,
      dependencies: task.dependencies,
      requirements: task.requirements,
    }
    fs.writeFileSync(task._path, serializeFrontmatter(frontmatter, task._body), 'utf8')
  }
}

function getTask(plan, taskId) {
  const task = plan.tasks.find((item) => item.id === taskId)
  if (!task) fail(`Task not found: ${taskId}`)
  return task
}

function dependenciesSatisfied(plan, task) {
  return task.dependencies.every((dependencyId) => {
    const dependency = getTask(plan, dependencyId)
    return dependency.status === 'completed' || dependency.status === 'skipped'
  })
}

function formatTask(task) {
  const deps = task.dependencies.length > 0 ? task.dependencies.join(', ') : 'none'
  return `${task.id}\t${task.status}\t${task.title}\t${task.file}\tdeps:${deps}`
}

function listTasks(plan) {
  plan.tasks.forEach((task) => console.log(formatTask(task)))
}

function remainingTasks(plan) {
  plan.tasks
    .filter((task) => task.status !== 'completed' && task.status !== 'skipped')
    .forEach((task) => console.log(formatTask(task)))
}

function nextTasks(plan) {
  const ready = plan.tasks.filter((task) => task.status === 'pending' && dependenciesSatisfied(plan, task))

  if (ready.length === 0) {
    console.log('No ready tasks found.')
    return
  }

  ready.forEach((task) => console.log(formatTask(task)))
}

function taskStatus(plan, taskId) {
  console.log(JSON.stringify(publicTask(getTask(plan, taskId)), null, 2))
}

function updateStatus(plan, taskId, nextStatus) {
  const task = getTask(plan, taskId)

  if (nextStatus === 'in_progress' && !dependenciesSatisfied(plan, task)) {
    fail(`Cannot start ${taskId}; dependencies are not completed`)
  }

  task.status = nextStatus
  writePlan(plan, plan.tasks)
}

function exportChecklist(plan) {
  const output = {
    version: 1,
    plan: path.basename(plan.planDir),
    mode: 'structured',
    source: plan.source,
    tasks: plan.tasks.map(publicTask),
  }

  const stateDir = path.join(plan.planDir, '.state')
  fs.mkdirSync(stateDir, { recursive: true })
  const outputPath = path.join(stateDir, 'checklist.json')
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  console.log(outputPath)
}

function main() {
  const [, , command, planRef, maybeTaskId] = process.argv

  if (!command) {
    usage()
    process.exit(0)
  }

  const commandsWithTaskId = new Set(['status', 'start', 'complete', 'block', 'reset', 'skip'])
  const taskId = commandsWithTaskId.has(command) ? maybeTaskId : undefined

  if (commandsWithTaskId.has(command) && !taskId) fail(`${command} requires TASK_ID`)

  const plan = readPlan(planRef)

  switch (command) {
    case 'list':
      listTasks(plan)
      return
    case 'remaining':
      remainingTasks(plan)
      return
    case 'next':
      nextTasks(plan)
      return
    case 'status':
      taskStatus(plan, taskId)
      return
    case 'start':
      updateStatus(plan, taskId, 'in_progress')
      console.log(`Started ${taskId}`)
      return
    case 'complete':
      updateStatus(plan, taskId, 'completed')
      console.log(`Completed ${taskId}`)
      return
    case 'block':
      updateStatus(plan, taskId, 'blocked')
      console.log(`Blocked ${taskId}`)
      return
    case 'reset':
      updateStatus(plan, taskId, 'pending')
      console.log(`Reset ${taskId} to pending`)
      return
    case 'skip':
      updateStatus(plan, taskId, 'skipped')
      console.log(`Skipped ${taskId}`)
      return
    case 'export':
      exportChecklist(plan)
      return
    default:
      usage()
      fail(`Unknown command: ${command}`)
  }
}

main()
