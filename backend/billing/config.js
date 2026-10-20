const fs = require('node:fs');
const { validateRateCard } = require('./pricing');
function readConfig(env = process.env) {
  const mode = env.BILLING_MODE || 'off';
  if (!['off', 'test', 'live'].includes(mode)) throw new Error('BILLING_MODE must be off, test or live');
  if (mode === 'off') return { enabled: false, mode };
  const origin = new URL(env.BILLING_PUBLIC_ORIGIN);
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      (origin.protocol !== 'https:' && !(mode === 'test' && origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))) throw new Error('Invalid billing public origin');
  if (!env.STRIPE_SECRET_KEY?.startsWith(`sk_${mode}_`) || !env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_') ||
      (env.BILLING_METER_KEY || '').length < 32 || (env.JWT_SECRET || '').length < 32 ||
      /change-in-production|development_only|super_secret|example/i.test(env.JWT_SECRET) || env.BILLING_METER_READY !== 'true') throw new Error('Billing requires Stripe, strong auth/meter secrets and an operator-verified meter');
  if (mode === 'live' && env.BILLING_LIVE_APPROVED !== 'true') throw new Error('Live billing requires explicit operator approval');
  const rateCard = validateRateCard(JSON.parse(fs.readFileSync(env.BILLING_RATE_CARD_FILE, 'utf8')));
  return { enabled: true, mode, origin: origin.origin, secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET, meterKey: env.BILLING_METER_KEY,
    rateCard, tax: env.BILLING_STRIPE_TAX === 'true' };
}
module.exports = { readConfig };
