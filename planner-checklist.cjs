#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const VALID_STATUSES = new Set(['pending', 'in_progress', 'blocked', 'completed'])
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

Resolution:
  - The command should be run from the project root
  - If omitted, the script uses the only checklist found under .plans/
  - If given a slug, it resolves .plans/<slug>/checklist.json
  - If given a path to a plan folder, it resolves <path>/checklist.json
  - If given a direct path to checklist.json, it uses that file
`)
}

function discoverChecklistFiles() {
  const plansDir = path.join(PROJECT_ROOT, '.plans')
  if (!fs.existsSync(plansDir)) return []

  const entries = fs.readdirSync(plansDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(plansDir, entry.name, 'checklist.json'))
    .filter((checklistPath) => fs.existsSync(checklistPath))
}

function resolveChecklistPath(planRef) {
  if (!planRef) {
    const discovered = discoverChecklistFiles()
    if (discovered.length === 1) return discovered[0]
    if (discovered.length === 0) {
      fail(`No checklist.json found under ${path.join(PROJECT_ROOT, '.plans')}`)
    }
    fail('Multiple structured plans found. Pass a plan slug or path explicitly.')
  }

  const directPath = path.resolve(PROJECT_ROOT, planRef)
  if (fs.existsSync(directPath)) {
    const stats = fs.statSync(directPath)
    if (stats.isDirectory()) return path.join(directPath, 'checklist.json')
    return directPath
  }

  return path.join(PROJECT_ROOT, '.plans', planRef, 'checklist.json')
}

function readChecklist(planRef) {
  const resolved = resolveChecklistPath(planRef)
  if (!fs.existsSync(resolved)) fail(`Checklist file not found: ${resolved}`)

  let data
  try {
    data = JSON.parse(fs.readFileSync(resolved, 'utf8'))
  } catch (error) {
    fail(`Invalid JSON in ${resolved}: ${error.message}`)
  }

  validateChecklist(data, resolved)
  return { data, resolved }
}

function validateChecklist(data, resolved) {
  if (!data || typeof data !== 'object') fail(`Checklist must be an object: ${resolved}`)
  if (!Array.isArray(data.tasks)) fail(`Checklist must contain a tasks array: ${resolved}`)

  const ids = new Set()
  for (const task of data.tasks) {
    if (!task.id || typeof task.id !== 'string') fail(`Task missing id in ${resolved}`)
    if (ids.has(task.id)) fail(`Duplicate task id ${task.id} in ${resolved}`)
    ids.add(task.id)

    if (!VALID_STATUSES.has(task.status)) {
      fail(`Invalid status ${task.status} for task ${task.id} in ${resolved}`)
    }

    if (!Array.isArray(task.dependencies)) {
      fail(`Task ${task.id} must have dependencies array in ${resolved}`)
    }
  }

  for (const task of data.tasks) {
    for (const dependency of task.dependencies) {
      if (!ids.has(dependency)) {
        fail(`Task ${task.id} depends on unknown task ${dependency} in ${resolved}`)
      }
    }
  }
}

function writeChecklist(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function getTask(data, taskId) {
  const task = data.tasks.find((item) => item.id === taskId)
  if (!task) fail(`Task not found: ${taskId}`)
  return task
}

function dependenciesSatisfied(data, task) {
  return task.dependencies.every((dependencyId) => {
    const dependency = getTask(data, dependencyId)
    return dependency.status === 'completed'
  })
}

function formatTask(task) {
  const deps = task.dependencies.length > 0 ? task.dependencies.join(', ') : 'none'
  return `${task.id}\t${task.status}\t${task.title}\t${task.file}\tdeps:${deps}`
}

function listTasks(data) {
  data.tasks.forEach((task) => console.log(formatTask(task)))
}

function remainingTasks(data) {
  data.tasks
    .filter((task) => task.status !== 'completed')
    .forEach((task) => console.log(formatTask(task)))
}

function nextTasks(data) {
  const ready = data.tasks.filter((task) => {
    if (task.status !== 'pending') return false
    return dependenciesSatisfied(data, task)
  })

  if (ready.length === 0) {
    console.log('No ready tasks found.')
    return
  }

  ready.forEach((task) => console.log(formatTask(task)))
}

function taskStatus(data, taskId) {
  const task = getTask(data, taskId)
  console.log(JSON.stringify(task, null, 2))
}

function updateStatus(data, taskId, nextStatus) {
  const task = getTask(data, taskId)

  if (nextStatus === 'in_progress' && !dependenciesSatisfied(data, task)) {
    fail(`Cannot start ${taskId}; dependencies are not completed`)
  }

  task.status = nextStatus
}

function main() {
  const [, , command, planRef, maybeTaskId] = process.argv

  if (!command) {
    usage()
    process.exit(0)
  }

  const commandsWithTaskId = new Set(['status', 'start', 'complete', 'block', 'reset'])
  const taskId = commandsWithTaskId.has(command) ? maybeTaskId : undefined

  if (commandsWithTaskId.has(command) && !taskId) {
    fail(`${command} requires TASK_ID`)
  }

  const { data, resolved } = readChecklist(planRef)

  switch (command) {
    case 'list':
      listTasks(data)
      return
    case 'remaining':
      remainingTasks(data)
      return
    case 'next':
      nextTasks(data)
      return
    case 'status':
      taskStatus(data, taskId)
      return
    case 'start':
      updateStatus(data, taskId, 'in_progress')
      writeChecklist(resolved, data)
      console.log(`Started ${taskId}`)
      return
    case 'complete':
      updateStatus(data, taskId, 'completed')
      writeChecklist(resolved, data)
      console.log(`Completed ${taskId}`)
      return
    case 'block':
      updateStatus(data, taskId, 'blocked')
      writeChecklist(resolved, data)
      console.log(`Blocked ${taskId}`)
      return
    case 'reset':
      updateStatus(data, taskId, 'pending')
      writeChecklist(resolved, data)
      console.log(`Reset ${taskId} to pending`)
      return
    default:
      usage()
      fail(`Unknown command: ${command}`)
  }
}

main()
