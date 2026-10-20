// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PaymentDialog } from './PaymentDialog';
import { prepaid } from '../api';
vi.mock('../api', () => ({ prepaid: { wallet: vi.fn(), history: vi.fn(), checkout: vi.fn(), status: vi.fn() } }));
const wallet = { enabled: true, mode: 'test', currency: 'eur', credits: 1000, balanceNanos: 10000000000,
  canUse: true, held: false, bundlesCents: [1000, 2500, 5000], tax: false,
  rateCard: { version: 'v1', source: 'Supplier', rates: { cpu: { unit: 'second', eurPerUnit: '0.001' } } } };
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, '', '/app');
  prepaid.wallet.mockResolvedValue(wallet);
  prepaid.history.mockResolvedValue({ entries: [], nextCursor: null });
});
afterEach(cleanup);
test('invalid checkout references can be dismissed without blocking wallet access', async () => {
  window.history.replaceState({}, '', '/app?checkout_session=cs_test_other_account');
  prepaid.status.mockRejectedValue(new Error('Purchase not found'));
  render(<PaymentDialog />);
  await screen.findByText('Purchase not found');
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss checkout reference' }));
  await screen.findByText(/1,000 resource credits/);
  expect(window.location.search).toBe('');
});
test('shows balance and supplier markup, and handles a checkout outage without implying payment', async () => {
  prepaid.checkout.mockRejectedValue(new Error('Provider unavailable'));
  render(<PaymentDialog />);
  fireEvent.click(screen.getByRole('button', { name: /Credits & usage/ }));
  await screen.findByText(/1,000 resource credits/);
  expect(screen.getByText(/supplier resource cost × 2\.5/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Continue to secure checkout/ }));
  await screen.findByText('Provider unavailable');
  expect(prepaid.checkout).toHaveBeenCalledWith(1000, expect.any(String));
  expect(screen.getByRole('button', { name: /Continue to secure checkout/ }).disabled).toBe(false);
});
test('unconfigured billing never offers an enabled purchase', async () => {
  prepaid.wallet.mockResolvedValue({ ...wallet, enabled: false, mode: 'off' });
  render(<PaymentDialog />); fireEvent.click(screen.getByRole('button', { name: /Credits & usage/ }));
  await screen.findByText(/not enabled/);
  expect(screen.queryByRole('button', { name: /Continue to secure checkout/ })).toBeNull();
});
test('returning from checkout displays pending until server verification confirms payment', async () => {
  window.history.replaceState({}, '', '/app?checkout_session=cs_test_pending');
  prepaid.status.mockResolvedValue({ ...wallet, status: 'pending' });
  render(<PaymentDialog />);
  await screen.findByText(/Awaiting payment confirmation/);
  expect(screen.queryByText(/Payment confirmed/)).toBeNull();
  prepaid.status.mockResolvedValue({ ...wallet, status: 'paid' });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText(/Payment confirmed/);
  await waitFor(() => expect(window.location.search).toBe(''));
});
