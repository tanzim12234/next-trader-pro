'use strict';

const crypto = require('node:crypto');

const MAX_ERROR_BYTES = 24 * 1024;
const MAX_SOURCE_BYTES = 80 * 1024;
const MAX_PROPOSAL_BYTES = 100 * 1024;

function redactDiagnostic(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED_API_KEY]')
    .replace(/\bgsk_[A-Za-z0-9]{20,}\b/g, '[REDACTED_API_KEY]')
    .replace(/(api[_-]?key|authorization|bearer)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, MAX_ERROR_BYTES);
}

function buildErrorAnalysisInput(error, environment = {}) {
  const safeError = {
    source: redactDiagnostic(error?.source || 'unknown'),
    message: redactDiagnostic(error?.message || 'Unknown error'),
    code: redactDiagnostic(error?.code || ''),
    stack: redactDiagnostic(error?.stack || '')
  };
  return {
    error: safeError,
    environment: {
      platform: redactDiagnostic(environment.platform || 'unknown').slice(0, 80),
      appVersion: redactDiagnostic(environment.appVersion || 'unknown').slice(0, 80),
      electronVersion: redactDiagnostic(environment.electronVersion || 'unknown').slice(0, 80),
      nodeVersion: redactDiagnostic(environment.nodeVersion || 'unknown').slice(0, 80)
    }
  };
}

function parseAnalysis(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_PROPOSAL_BYTES) {
    throw new Error('AI analysis response is empty or too large.');
  }
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('AI returned invalid diagnostic JSON.'); }
  if (!value || typeof value.summary !== 'string' || typeof value.rootCause !== 'string'
    || !Array.isArray(value.steps) || !Array.isArray(value.risks)) {
    throw new Error('AI diagnostic response is missing required fields.');
  }
  return {
    summary: value.summary.slice(0, 1200),
    rootCause: value.rootCause.slice(0, 2000),
    confidence: ['low', 'medium', 'high'].includes(value.confidence) ? value.confidence : 'low',
    steps: value.steps.slice(0, 8).map(step => String(step).slice(0, 500)),
    risks: value.risks.slice(0, 8).map(risk => String(risk).slice(0, 500)),
    requiresHumanApproval: true,
    codeWasExecuted: false
  };
}

function buildRepairPrompt(diagnostic, sourceCode, relativePath) {
  if (typeof relativePath !== 'string' ||
      !(/^(src\/[a-zA-Z0-9._-]+\.(cjs|js|html|css)|test\/[a-zA-Z0-9._-]+\.test\.cjs)$/.test(relativePath))) {
    throw new Error('Repair target must be an approved source or test file path.');
  }
  if (typeof sourceCode !== 'string' || Buffer.byteLength(sourceCode, 'utf8') > MAX_SOURCE_BYTES) {
    throw new Error('Repair source must be text under 80 KB.');
  }
  return {
    path: relativePath,
    diagnostic: {
      summary: String(diagnostic?.summary || '').slice(0, 1200),
      rootCause: String(diagnostic?.rootCause || '').slice(0, 2000),
      steps: Array.isArray(diagnostic?.steps) ? diagnostic.steps.slice(0, 8) : []
    },
    sourceCode
  };
}

function parseRepairProposal(raw, expectedPath) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_PROPOSAL_BYTES) {
    throw new Error('Repair proposal is empty or too large.');
  }
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('AI returned invalid repair proposal JSON.'); }
  if (!value || value.path !== expectedPath || typeof value.content !== 'string'
    || Buffer.byteLength(value.content, 'utf8') > MAX_SOURCE_BYTES) {
    throw new Error('Repair proposal target or content is invalid.');
  }
  return {
    path: expectedPath,
    explanation: String(value.explanation || '').slice(0, 2000),
    content: value.content,
    requiresReview: true,
    autoApplied: false,
    codeWasExecuted: false
  };
}

module.exports = {
  redactDiagnostic,
  buildErrorAnalysisInput,
  parseAnalysis,
  buildRepairPrompt,
  parseRepairProposal
};
