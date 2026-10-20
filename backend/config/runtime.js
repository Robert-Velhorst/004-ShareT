const PLACEHOLDER_PATTERNS = [
  /change[-_ ]?in[-_ ]?production/i,
  /your[-_ ]?(super|session|secret|key)/i,
  /example/i,
  /placeholder/i
];

function isConfigured(value, minimumLength = 1) {
  const normalized = String(value || '').trim();
  return normalized.length >= minimumLength
    && !PLACEHOLDER_PATTERNS.some(pattern => pattern.test(normalized));
}

function inspectRuntimeEnvironment(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const errors = [];
  const warnings = [];

  if (!isConfigured(env.JWT_SECRET, 32)) errors.push('JWT_SECRET must be a non-placeholder value of at least 32 characters');
  if (!isConfigured(env.JWT_REFRESH_SECRET, 32)) errors.push('JWT_REFRESH_SECRET must be a non-placeholder value of at least 32 characters');
  if (!isConfigured(env.ENCRYPTION_KEY, 32)) errors.push('ENCRYPTION_KEY must be a non-placeholder value of at least 32 characters');

  if (!isConfigured(env.TRELLO_API_KEY, 8)) warnings.push('TRELLO_API_KEY is not configured; Trello workflows are unavailable');
  if (!isConfigured(env.TRELLO_BOT_TOKEN, 8)) warnings.push('TRELLO_BOT_TOKEN is not configured; owner bell notifications cannot be guaranteed');
  const emailHost = env.SMTP_HOST || env.EMAIL_HOST;
  const emailUser = env.SMTP_USER || env.EMAIL_USER;
  const emailPass = env.SMTP_PASS || env.EMAIL_PASSWORD;
  const emailConfigured = Boolean(emailHost && ((!emailUser && !emailPass) || (emailUser && emailPass)));
  if (!emailConfigured) warnings.push('SMTP is incomplete; freelancer verification and reply email are unavailable');

  if (production) {
    if (!env.PUBLIC_URL || !/^https:\/\//i.test(env.PUBLIC_URL)) {
      errors.push('PUBLIC_URL must be an HTTPS URL in production');
    }
    if (!env.CORS_ORIGIN || env.CORS_ORIGIN.includes('*')) {
      errors.push('CORS_ORIGIN must explicitly list trusted origins in production');
    }
    if (!isConfigured(env.TRELLO_API_KEY, 8)) {
      errors.push('TRELLO_API_KEY is required in production');
    }
  }

  return {
    ok: errors.length === 0,
    production,
    errors,
    warnings,
    capabilities: {
      trello: isConfigured(env.TRELLO_API_KEY, 8),
      relayNotifications: isConfigured(env.TRELLO_BOT_TOKEN, 8),
      email: emailConfigured,
      cloudSync: Boolean(env.COUCHDB_URL),
      publicHttps: Boolean(env.PUBLIC_URL && /^https:\/\//i.test(env.PUBLIC_URL))
    }
  };
}

function validateRuntimeEnvironment(env = process.env) {
  const report = inspectRuntimeEnvironment(env);
  if (!report.ok) {
    const error = new Error(`Invalid ShareT runtime configuration:\n- ${report.errors.join('\n- ')}`);
    error.code = 'SHARET_INVALID_ENV';
    error.report = report;
    throw error;
  }
  return report;
}

module.exports = {
  inspectRuntimeEnvironment,
  isConfigured,
  validateRuntimeEnvironment
};
