/**
 * In-app feedback: builds pre-filled GitHub "new issue" URLs.
 * No tokens, no API calls. Never include file names or file data.
 */
export const REPO_URL = 'https://github.com/lance6x5/private-file-toolkit';

const TEMPLATES = {
  bug: { template: 'bug_report.yml', title: '[Bug]: ' },
  feature: { template: 'feature_request.yml', title: '[Feature]: ' }
};

/** Trim a user agent string to keep URLs short. */
export function trimEnvironment(ua, max = 160) {
  const s = String(ua ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * @param {'bug'|'feature'} kind
 * @param {{version?: string, userAgent?: string, tool?: string}} [info]
 */
export function buildIssueUrl(kind, { version = '', userAgent = '', tool = '' } = {}) {
  const t = TEMPLATES[kind];
  if (!t) throw new Error(`Unknown feedback kind: ${kind}`);
  const params = new URLSearchParams({ template: t.template, title: t.title });
  if (version) params.set('version', version);
  if (tool) params.set('tool', tool);
  if (kind === 'bug' && userAgent) params.set('environment', trimEnvironment(userAgent));
  // Use %20 rather than + for spaces so every client decodes them the same way.
  return `${REPO_URL}/issues/new?${params.toString().replace(/\+/g, '%20')}`;
}
