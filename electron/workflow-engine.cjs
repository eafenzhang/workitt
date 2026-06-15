// workflow-engine.cjs — AI Agent Workflow Engine
// Executes multi-step workflows: ai_call → tool_call → condition → transform → db_action

const { log, query, run, callAI, chatWithAI, getWorkflow, saveExecution, formatReq } = require('./database.cjs');
const { McpClientManager } = require('./mcp-manager.cjs');

const crypto = require('crypto');
function genId() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }

/**
 * Execute a workflow with given inputs.
 * @param {object} db - Database instance
 * @param {string} workflowId - Workflow definition ID
 * @param {object} inputs - Initial inputs
 * @returns {Promise<{success: boolean, outputs?: object, error?: string, executionId?: string}>}
 */
async function executeWorkflow(db, workflowId, inputs = {}) {
  const wf = getWorkflow(db, workflowId);
  if (!wf) return { success: false, error: '工作流不存在: ' + workflowId };
  if (!wf.enabled) return { success: false, error: '工作流已禁用: ' + wf.name };

  const executionId = genId();
  const startedAt = new Date().toISOString();

  saveExecution(db, { id: executionId, workflowId, status: 'running', inputs, outputs: {}, stepResults: [], startedAt });

  log('WorkflowEngine: starting ' + wf.name + ' (' + executionId + ') with ' + (wf.steps?.length || 0) + ' steps');

  const context = { inputs, steps: {} };
  const stepResults = [];

  try {
    for (let i = 0; i < (wf.steps || []).length; i++) {
      const step = wf.steps[i];
      const stepId = step.id || ('step_' + (i + 1));
      log('WorkflowEngine: executing step ' + (i + 1) + '/' + wf.steps.length + ' [' + step.type + '] ' + stepId);

      let result;
      try {
        result = await executeStep(db, step, context);
        context.steps[stepId] = result;
        stepResults.push({ stepId, type: step.type, status: 'completed', output: result });
      } catch (stepErr) {
        const errMsg = stepErr.message || String(stepErr);
        log('WorkflowEngine: step ' + stepId + ' failed: ' + errMsg);
        stepResults.push({ stepId, type: step.type, status: 'failed', error: errMsg });

        if (step.onError === 'skip') continue;
        if (step.onError === 'retry' && (step.retryCount || 0) < 3) {
          step.retryCount = (step.retryCount || 0) + 1;
          i--; // retry same step
          continue;
        }
        throw stepErr; // default: stop
      }
    }

    const finishedAt = new Date().toISOString();
    saveExecution(db, { id: executionId, workflowId, status: 'completed', inputs, outputs: context.steps, stepResults, startedAt, finishedAt });
    log('WorkflowEngine: completed ' + wf.name + ' (' + executionId + ')');
    return { success: true, outputs: context.steps, executionId };
  } catch (e) {
    const finishedAt = new Date().toISOString();
    const errMsg = e.message || String(e);
    saveExecution(db, { id: executionId, workflowId, status: 'failed', inputs, outputs: context.steps, stepResults, startedAt, finishedAt, error: errMsg });
    log('WorkflowEngine: failed ' + wf.name + ' (' + executionId + '): ' + errMsg);
    return { success: false, error: errMsg, executionId, partialOutputs: context.steps };
  }
}

/**
 * Execute a single workflow step.
 */
async function executeStep(db, step, context) {
  switch (step.type) {
    case 'ai_call':
      return executeAICall(db, step.config, context);
    case 'tool_call':
      return executeToolCall(step.config, context);
    case 'condition':
      return evaluateCondition(step.config, context);
    case 'transform':
      return executeTransform(step.config, context);
    case 'db_action':
      return executeDbAction(db, step.config, context);
    default:
      throw new Error('Unknown step type: ' + step.type);
  }
}

/**
 * AI Call step — sends a prompt to the LLM.
 * config: { prompt, systemPrompt?, providerId?, modelId? }
 * The prompt can reference {{steps.stepId.output}} for template interpolation.
 */
async function executeAICall(db, config, context) {
  const prompt = interpolateTemplate(config.prompt || '', context);
  const systemPrompt = config.systemPrompt ? interpolateTemplate(config.systemPrompt, context) : undefined;

  const messages = [{ role: 'user', content: prompt }];
  const result = await chatWithAI(db, {
    providerId: config.providerId,
    modelId: config.modelId,
    messages,
    systemPrompt,
  });

  if (result.error) throw new Error('AI call failed: ' + result.error);
  return { content: result.content };
}

/**
 * Tool Call step — executes an MCP or CLI tool.
 * config: { toolName, args }
 * Args can reference {{steps.stepId.output.content}} for template interpolation.
 */
async function executeToolCall(config, context) {
  const toolName = config.toolName;
  if (!toolName) throw new Error('Tool name required');

  const args = {};
  if (config.args) {
    for (const [key, value] of Object.entries(config.args)) {
      args[key] = typeof value === 'string' ? interpolateTemplate(value, context) : value;
    }
  }

  const mcpManager = McpClientManager.getInstance();
  const result = await mcpManager.executeTool(toolName, args);

  if (!result.success) throw new Error('Tool execution failed: ' + (result.error || 'Unknown'));
  return { content: result.content };
}

/**
 * Condition step — evaluates a JavaScript expression or LLM-based condition.
 * config: { expression?, prompt? }
 * expression: JS expression using context (e.g., "steps.ai_summary.content.length > 10")
 */
function evaluateCondition(config, context) {
  if (config.expression) {
    try {
      const fn = new Function('context', `return (${config.expression});`);
      const result = fn(context);
      return { passed: !!result, value: result };
    } catch (e) {
      throw new Error('Condition expression error: ' + e.message);
    }
  }
  // No condition = always pass
  return { passed: true };
}

/**
 * Transform step — applies a JS expression to transform data.
 * config: { expression }
 */
function executeTransform(config, context) {
  if (!config.expression) return context;
  try {
    const fn = new Function('context', `return (${config.expression});`);
    return fn(context);
  } catch (e) {
    throw new Error('Transform expression error: ' + e.message);
  }
}

/**
 * DB Action step — performs a database operation.
 * config: { action, table, data }
 * Actions: create_requirement, update_requirement, create_document
 * data supports {{...}} template interpolation.
 */
function executeDbAction(db, config, context) {
  const action = config.action;
  let data = config.data || {};

  // Interpolate template values
  data = JSON.parse(interpolateTemplate(JSON.stringify(data), context));

  switch (action) {
    case 'create_requirement': {
      const title = data.title || '自动创建的需求';
      const desc = data.desc || '';
      const module = data.module || '用户端';
      const priority = data.priority || '中';
      const images = data.images || [];
      const creator = data.creator || 'Workflow';
      run(db,
        'INSERT INTO requirements (title, description, module, priority, images, creator, status) VALUES (?,?,?,?,?,?,?)',
        [title, desc, module, priority, JSON.stringify(images), creator, '待评估']);
      const newId = query(db, 'SELECT MAX(id) FROM requirements')[0][0];
      return { created: true, id: newId, title };
    }
    case 'create_document': {
      const docTitle = data.title || '自动创建的文档';
      const content = data.content || '';
      const category = data.category || 'guide';
      run(db,
        'INSERT INTO documents (title, content, category, type) VALUES (?,?,?,?)',
        [docTitle, content, category, 'MD']);
      const newId = query(db, 'SELECT MAX(id) FROM documents')[0][0];
      return { created: true, id: newId, title: docTitle };
    }
    default:
      throw new Error('Unknown db_action: ' + action);
  }
}

/**
 * Interpolate {{...}} template references with context values.
 * Supports: {{inputs.key}}, {{steps.stepId.output.field}}
 */
function interpolateTemplate(template, context) {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const parts = path.trim().split('.');
    let value = context;
    for (const part of parts) {
      if (value == null) break;
      value = value[part];
    }
    return value != null ? String(value) : match;
  });
}

module.exports = { executeWorkflow, executeStep };
