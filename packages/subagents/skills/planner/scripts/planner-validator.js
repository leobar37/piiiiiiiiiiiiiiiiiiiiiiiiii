#!/usr/bin/env node
/**
 * planner-validator.js
 *
 * Simple CLI for managing validator checklist state.
 * It only manages state. Fixes belong to subagents, not files.
 */

const fs = require('fs')
const path = require('path')

const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed', 'failed'])
const PROJECT_ROOT = process.cwd()

function fail(message) {
  console.error(`Error: ${message}`)
  process.exit(1)
}

function usage() {
  console.log(`planner-validator

Usage:
  node ./planner-validator.js list [plan-slug-or-path]
  node ./planner-validator.js remaining [plan-slug-or-path]
  node ./planner-validator.js next [plan-slug-or-path]
  node ./planner-validator.js status [plan-slug-or-path] <VALIDATOR_ID>
  node ./planner-validator.js start [plan-slug-or-path] <VALIDATOR_ID>
  node ./planner-validator.js complete [plan-slug-or-path] <VALIDATOR_ID>
  node ./planner-validator.js fail [plan-slug-or-path] <VALIDATOR_ID>
  node ./planner-validator.js reset [plan-slug-or-path] <VALIDATOR_ID>
  node ./planner-validator.js init [plan-slug-or-path]
  node ./planner-validator.js sync [plan-slug-or-path]

Commands:
  list         - List all validators
  remaining    - Show validators not completed
  next         - Show next validator ready to run
  status       - Show detailed status of a validator
  start        - Mark validator as in_progress
  complete     - Mark validator as completed
  fail         - Mark validator as failed
  reset        - Reset validator to pending
  init         - Create empty validators/checklist.json
  sync         - Sync checklist with files in validators/ directory
`)
}

function discoverValidatorChecklists() {
  const plansDir = path.join(PROJECT_ROOT, '.plans')
  if (!fs.existsSync(plansDir)) return []

  const entries = fs.readdirSync(plansDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(plansDir, entry.name, 'validators', 'checklist.json'))
    .filter((checklistPath) => fs.existsSync(checklistPath))
}

function resolveChecklistPath(planRef) {
  if (!planRef) {
    const discovered = discoverValidatorChecklists()
    if (discovered.length === 1) return discovered[0]
    if (discovered.length === 0) {
      fail(`No validators/checklist.json found under ${path.join(PROJECT_ROOT, '.plans')}`)
    }
    fail('Multiple plans with validators found. Pass a plan slug or path explicitly.')
  }

  const directPath = path.resolve(PROJECT_ROOT, planRef)
  if (fs.existsSync(directPath)) {
    const stats = fs.statSync(directPath)
    if (stats.isDirectory()) return path.join(directPath, 'validators', 'checklist.json')
    return directPath
  }

  return path.join(PROJECT_ROOT, '.plans', planRef, 'validators', 'checklist.json')
}

function readChecklist(planRef) {
  const resolved = resolveChecklistPath(planRef)
  if (!fs.existsSync(resolved)) {
    fail(`Validators checklist not found: ${resolved}\nRun: node planner-validator.js init [plan]`)
  }

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
  if (data.mode !== 'validators') fail(`Checklist mode must be 'validators': ${resolved}`)
  if (!Array.isArray(data.validators)) fail(`Checklist must contain a validators array: ${resolved}`)

  const ids = new Set()
  for (const validator of data.validators) {
    if (!validator.id || typeof validator.id !== 'string') {
      fail(`Validator missing id in ${resolved}`)
    }
    if (ids.has(validator.id)) {
      fail(`Duplicate validator id ${validator.id} in ${resolved}`)
    }
    ids.add(validator.id)

    if (!VALID_STATUSES.has(validator.status)) {
      fail(`Invalid status ${validator.status} for validator ${validator.id} in ${resolved}`)
    }
  }
}

function writeChecklist(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function getValidator(data, validatorId) {
  const validator = data.validators.find((item) => item.id === validatorId)
  if (!validator) fail(`Validator not found: ${validatorId}`)
  return validator
}

function dependenciesSatisfied(data, validator) {
  return validator.dependencies.every((dependencyId) => {
    const dependency = getValidator(data, dependencyId)
    return dependency.status === 'completed'
  })
}

function formatValidator(validator) {
  const deps = validator.dependencies?.length > 0 ? validator.dependencies.join(', ') : 'none'
  const taskRef = validator.task_id ? `(${validator.task_id})` : ''
  return `${validator.id}\t${validator.status}\t${validator.title}\t${taskRef}\tdeps:${deps}`
}

function listValidators(data) {
  console.log(`Total validators: ${data.validators.length}`)
  console.log('')
  data.validators.forEach((validator) => console.log(formatValidator(validator)))
}

function remainingValidators(data) {
  const remaining = data.validators.filter((v) => v.status !== 'completed')
  console.log(`Remaining validators: ${remaining.length}`)
  console.log('')
  remaining.forEach((validator) => console.log(formatValidator(validator)))
}

function nextValidators(data) {
  const ready = data.validators.filter((validator) => {
    if (validator.status !== 'pending') return false
    return dependenciesSatisfied(data, validator)
  })

  if (ready.length === 0) {
    console.log('No ready validators found.')
    return
  }

  console.log(`Ready validators: ${ready.length}`)
  console.log('')
  ready.forEach((validator) => console.log(formatValidator(validator)))
}

function validatorStatus(data, validatorId) {
  const validator = getValidator(data, validatorId)
  console.log(JSON.stringify(validator, null, 2))
}

function updateStatus(data, validatorId, nextStatus) {
  const validator = getValidator(data, validatorId)

  if (nextStatus === 'in_progress' && !dependenciesSatisfied(data, validator)) {
    const incompleteDeps = validator.dependencies.filter((depId) => {
      const dep = getValidator(data, depId)
      return dep.status !== 'completed'
    })
    fail(`Cannot start ${validatorId}; dependencies not completed: ${incompleteDeps.join(', ')}`)
  }

  validator.status = nextStatus
  if (nextStatus === 'in_progress') {
    validator.started_at = new Date().toISOString()
  } else if (nextStatus === 'completed' || nextStatus === 'failed') {
    validator.completed_at = new Date().toISOString()
  }
}

function initChecklist(planRef) {
  const resolved = resolveChecklistPath(planRef)
  const validatorsDir = path.dirname(resolved)

  if (!fs.existsSync(validatorsDir)) {
    fs.mkdirSync(validatorsDir, { recursive: true })
  }

  if (fs.existsSync(resolved)) {
    fail(`Checklist already exists: ${resolved}`)
  }

  const planDir = path.resolve(validatorsDir, '..')
  const planName = path.basename(planDir)

  const initialData = {
    version: 1,
    plan: planName,
    mode: 'validators',
    validators: []
  }

  writeChecklist(resolved, initialData)
  console.log(`✅ Created empty validators checklist: ${resolved}`)
}

function syncChecklist(planRef) {
  const { data, resolved } = readChecklist(planRef)
  const validatorsDir = path.dirname(resolved)

  if (!fs.existsSync(validatorsDir)) {
    fail(`Validators directory not found: ${validatorsDir}`)
  }

  const files = fs.readdirSync(validatorsDir)
    .filter((f) => f.endsWith('.md') && f !== 'checklist.json')
    .sort()

  const existingIds = new Set(data.validators.map((v) => v.id))
  let added = 0

  for (const file of files) {
    const match = file.match(/^(V-\d+)/)
    if (!match) continue

    const id = match[1]
    if (!existingIds.has(id)) {
      const filePath = path.join(validatorsDir, file)
      const content = fs.readFileSync(filePath, 'utf8')
      const taskMatch = content.match(/task_id:\s*"([^"]+)"/)
      const titleMatch = content.match(/title:\s*"([^"]+)"/) || content.match(/^#\s+(.+)$/m)

      data.validators.push({
        id,
        title: titleMatch ? titleMatch[1] : file.replace('.md', ''),
        file: `validators/${file}`,
        status: 'pending',
        task_id: taskMatch ? taskMatch[1] : null,
        dependencies: []
      })
      added++
    }
  }

  data.validators.sort((a, b) => a.id.localeCompare(b.id))
  writeChecklist(resolved, data)
  console.log(`✅ Synced validators: +${added} added, total: ${data.validators.length}`)
}

function main() {
  const [, , command, planRef, maybeValidatorId] = process.argv

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    usage()
    process.exit(0)
  }

  const commandsWithValidatorId = new Set(['status', 'start', 'complete', 'fail', 'reset'])
  const validatorId = commandsWithValidatorId.has(command) ? maybeValidatorId : undefined

  if (commandsWithValidatorId.has(command) && !validatorId) {
    fail(`${command} requires VALIDATOR_ID (e.g., V-001)`)
  }

  if (command === 'init') {
    initChecklist(planRef)
    return
  }

  const { data, resolved } = readChecklist(planRef)

  switch (command) {
    case 'list':
      listValidators(data)
      return
    case 'remaining':
      remainingValidators(data)
      return
    case 'next':
      nextValidators(data)
      return
    case 'status':
      validatorStatus(data, validatorId)
      return
    case 'start':
      updateStatus(data, validatorId, 'in_progress')
      writeChecklist(resolved, data)
      console.log(`🟡 Started ${validatorId}`)
      return
    case 'complete':
      updateStatus(data, validatorId, 'completed')
      writeChecklist(resolved, data)
      console.log(`✅ Completed ${validatorId}`)
      return
    case 'fail':
      updateStatus(data, validatorId, 'failed')
      writeChecklist(resolved, data)
      console.log(`❌ Failed ${validatorId}`)
      return
    case 'reset':
      updateStatus(data, validatorId, 'pending')
      writeChecklist(resolved, data)
      console.log(`🔄 Reset ${validatorId} to pending`)
      return
    case 'sync':
      syncChecklist(planRef)
      return
    default:
      usage()
      fail(`Unknown command: ${command}`)
  }
}

main()
