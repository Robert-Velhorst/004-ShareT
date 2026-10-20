const SCALE = 1000000000n;
const RESOURCES = new Set(['cpu', 'ram', 'gpu', 'vram', 'ingress', 'egress', 'storage', 'backup', 'email', 'api', 'electricity']);
function decimal(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,8})(\.\d{1,9})?$/.test(value)) throw new Error('Expected a non-negative decimal string, up to 9 decimals');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(9, '0'));
}
function validateRateCard(card) {
  if (!card || card.currency !== 'eur' || !/^[A-Za-z0-9._-]{1,80}$/.test(card.version || '') ||
      typeof card.source !== 'string' || !card.source.trim() || card.source.length > 500 ||
      !card.rates || !Object.keys(card.rates).length) throw new Error('A versioned EUR supplier rate card is required');
  for (const [resource, rate] of Object.entries(card.rates)) {
    if (!RESOURCES.has(resource) || typeof rate.unit !== 'string' || !rate.unit.trim() || rate.unit.length > 80) throw new Error('Invalid resource unit');
    decimal(rate.eurPerUnit);
  }
  return card;
}
function priceUsage(receipt, card) {
  validateRateCard(card);
  if (receipt.rateVersion !== card.version || !Array.isArray(receipt.lines) || !receipt.lines.length || receipt.lines.length > 30) throw new Error('Invalid usage or rate version');
  let numerator = 0n;
  const seen = new Set();
  const lines = receipt.lines.map(line => {
    const rate = Object.hasOwn(card.rates, line.resource) && card.rates[line.resource];
    if (!rate || seen.has(line.resource)) throw new Error('Unknown or duplicate resource');
    seen.add(line.resource);
    numerator += decimal(line.quantity) * decimal(rate.eurPerUnit);
    return { resource: line.resource, quantity: line.quantity, ...rate };
  });
  // Sum before rounding. Sub-nano-euro fractions are waived, never rounded up.
  const base = numerator / SCALE;
  const charge = numerator * 5n / (2n * SCALE);
  if (charge > 1000000000000000n) throw new Error('Usage exceeds settlement limit');
  return { baseNanos: Number(base), chargeNanos: Number(charge), multiplier: '2.5', lines, rateCard: card };
}
module.exports = { priceUsage, validateRateCard };
