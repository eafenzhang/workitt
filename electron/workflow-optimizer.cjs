// workflow-optimizer.cjs — Auto-optimize workflows from execution history
// Analyzes past executions to detect issues and suggest improvements
const { log, query, run, getWorkflow, listWorkflowExecutions } = require('./database.cjs');

const ANALYSIS_INTERVAL_MS = 6 * 60 * 60 * 1000; // Every 6 hours

let _timer = null;

function startWorkflowOptimizer(db) {
  log('WorkflowOptimizer: starting');
  setTimeout(() => analyzeWorkflows(db), 180000); // First run after 3 min
  _timer = setInterval(() => analyzeWorkflows(db), ANALYSIS_INTERVAL_MS);
}

function stopWorkflowOptimizer() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

async function analyzeWorkflows(db) {
  try {
    // Get all workflows
    const wfs = query(db, 'SELECT id, name, enabled FROM workflows');
    for (const [id, name, enabled] of wfs) {
      const executions = listWorkflowExecutions(db, id, 50);
      if (executions.length < 5) continue; // Need enough data

      const total = executions.length;
      const failed = executions.filter(e => e.status === 'failed').length;
      const failureRate = failed / total;

      // Analyze step-level failures
      const stepFailures = new Map();
      for (const ex of executions) {
        for (const sr of (ex.stepResults || [])) {
          if (sr.status === 'failed') {
            const key = sr.stepId + '|' + sr.type;
            stepFailures.set(key, (stepFailures.get(key) || 0) + 1);
          }
        }
      }

      // Auto-disable if > 80% failure rate and enough samples
      if (failureRate > 0.8 && total >= 10 && enabled) {
        log('WorkflowOptimizer: disabling ' + name + ' (' + Math.round(failureRate * 100) + '% failure rate)');
        run(db, 'UPDATE workflows SET enabled = 0 WHERE id = ?', [id]);
        continue;
      }

      // Log step-level warnings
      for (const [key, count] of stepFailures) {
        const [stepId, type] = key.split('|');
        const stepRate = count / total;
        if (stepRate > 0.5) {
          log('WorkflowOptimizer: step ' + stepId + ' in ' + name + ' fails ' + Math.round(stepRate * 100) + '% of time');
        }
      }
    }
  } catch (e) { log('WorkflowOptimizer: analysis error', e); }
}

module.exports = { startWorkflowOptimizer, stopWorkflowOptimizer };
