/** Exercise the scheduled workflow's shell steps with a credential-free GitHub stub. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { load } from 'js-yaml'

const workflow = load(readFileSync(new URL('./workflows/fork-sync-upstream.yml', import.meta.url), 'utf8'))
const steps = workflow.jobs.sync.steps
const stub = `
gh() {
  case "$*" in
    *merge-upstream*)
      if [ "$SCENARIO" = conflict ]; then echo 'merge conflict' >&2; return 1; fi
      echo '{"message":"sync complete"}' ;;
    *git/ref/heads/master*) echo abc123 ;;
    *actions/workflows/desktop-arm64-package.yml/runs*)
      if [ "$SCENARIO" = query-failure ]; then return 1; fi
      if [ "$SCENARIO" = existing ]; then echo 1; else echo 0; fi ;;
    'workflow run desktop-arm64-package.yml --repo owner/fork --ref master -f build_version=auto')
      if [ "$SCENARIO" = dispatch-failure ]; then return 1; fi
      echo DISPATCHED ;;
    *) echo "Unexpected gh arguments: $*" >&2; return 2 ;;
  esac
}
`

function execute(scenario) {
  const root = mkdtempSync(join(tmpdir(), 'fork-sync-'))
  try {
    const summary = join(root, 'summary.md')
    const result = spawnSync('bash', ['-c', `${stub}\n${steps.map(step => step.run).join('\n')}`], {
      env: { ...process.env, GH_TOKEN: '', GH_REPO: 'owner/fork', SCENARIO: scenario, GITHUB_STEP_SUMMARY: summary },
      encoding: 'utf8', timeout: 10_000,
    })
    assert.equal(result.error, undefined)
    assert.equal(result.signal, null)
    return result
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('schedules only the fork with bounded serialized writes and no stored credentials', () => {
  assert.deepEqual(workflow.on.schedule, [{ cron: '23 * * * *' }])
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'))
  assert.deepEqual(workflow.permissions, { contents: 'write', actions: 'write' })
  assert.equal(workflow.concurrency['cancel-in-progress'], false)
  assert.equal(workflow.jobs.sync.if, "github.repository == 'huohua-dev/deepseek-harness'")
  assert.equal(workflow.jobs.sync['timeout-minutes'], 10)
  assert.equal(workflow.jobs.sync.env.GH_TOKEN, '${{ github.token }}')
  assert.ok(steps.every(step => !step['continue-on-error'] && step.shell === 'bash'))
})

test('dispatches a missing build even when a prior sync already merged the commit', () => {
  const result = execute('missing')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /DISPATCHED/u)
})

test('does not duplicate an existing build', () => {
  const result = execute('existing')
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(result.stdout, /DISPATCHED/u)
})

for (const scenario of ['conflict', 'query-failure', 'dispatch-failure']) {
  test(`${scenario} fails visibly without claiming a dispatched build`, () => {
    const result = execute(scenario)
    assert.notEqual(result.status, 0)
    assert.doesNotMatch(result.stdout, /DISPATCHED/u)
  })
}
