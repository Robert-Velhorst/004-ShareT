import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { prepaid } from '../api';

const money = nanos => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 9 }).format(nanos / 1e9);
const number = value => new Intl.NumberFormat('en-IE', { maximumFractionDigits: 7 }).format(value);
const statuses = {
  pending: 'Awaiting payment confirmation. Some payment methods take longer. You can safely close this window.',
  paid: 'Payment confirmed. Your resource credits are available.',
  expired: 'This checkout expired. No credits were added.',
  refunded: 'This purchase has been refunded in full or in part. Your balance has been updated.',
  held: 'This payment is under review. Spending is paused until the review is resolved.',
  disputed: 'This payment was reversed following a dispute. Your balance has been updated.'
};

export const PaymentDialog = () => {
  const [sessionId, setSessionId] = useState(() => new URLSearchParams(window.location.search).get('checkout_session'));
  const [open, setOpen] = useState(() => Boolean(new URLSearchParams(window.location.search).get('checkout_session')) || new URLSearchParams(window.location.search).has('checkout_cancelled'));
  const [wallet, setWallet] = useState(null);
  const [history, setHistory] = useState({ entries: [], nextCursor: null });
  const [bundle, setBundle] = useState('1000');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(() => new URLSearchParams(window.location.search).has('checkout_cancelled') ? 'Checkout cancelled. No credits were added by returning here.' : '');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(null);
  const refreshInFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true; setRefreshing(true);
    try {
      const current = sessionId ? await prepaid.status(sessionId) : await prepaid.wallet();
      const activity = await prepaid.history();
      if (!alive.current) return;
      setWallet(current); setHistory(activity); setError('');
      if (sessionId) {
        setNotice(statuses[current.status] || 'Payment status unavailable. Please refresh.');
        if (current.status && current.status !== 'pending') {
          const url = new URL(window.location.href);
          url.searchParams.delete('checkout_session'); url.searchParams.delete('checkout_cancelled');
          window.history.replaceState({}, '', url.pathname + url.search + url.hash);
          setSessionId(null); requestId.current = null;
          window.dispatchEvent(new Event('sharet-credits-changed'));
        }
      }
    } catch (failure) { if (alive.current) setError(failure.message); }
    finally { refreshInFlight.current = false; if (alive.current) setRefreshing(false); }
  }, [sessionId]);

  useEffect(() => {
    if (!open) return;
    refresh();
    const onFocus = () => { if (!document.hidden) refresh(); };
    const timer = window.setInterval(onFocus, sessionId ? 10000 : 60000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [open, refresh, sessionId]);

  const purchase = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      requestId.current ||= crypto.randomUUID();
      const checkout = await prepaid.checkout(Number(bundle), requestId.current);
      const url = new URL(checkout.url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Checkout returned an unexpected destination');
      window.location.assign(url.href);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await prepaid.history(history.nextCursor);
      setHistory(old => ({ entries: [...old.entries, ...page.entries.filter(entry => !old.entries.some(existing => existing.id === entry.id))], nextCursor: page.nextCursor }));
    } catch (failure) { setError(failure.message); }
    finally { setLoadingMore(false); }
  };
  const dismissCheckout = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('checkout_session'); url.searchParams.delete('checkout_cancelled');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    setSessionId(null); setNotice(''); setError('');
  };

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline">Credits &amp; usage</Button></DialogTrigger>
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>ShareT resource wallet</DialogTitle>
        <DialogDescription>Prepay for the resources your shared links use. Freelancers do not need to pay or create an account.</DialogDescription>
      </DialogHeader>
      {error && <Alert variant="destructive"><AlertTitle>Unable to complete this request</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {sessionId && <Button variant="outline" onClick={dismissCheckout}>Dismiss checkout reference</Button>}
      {notice && <Alert><AlertDescription>{notice}</AlertDescription></Alert>}
      {!wallet && !error && <Skeleton className="h-24 w-full" />}
      {wallet && !wallet.enabled && <Alert><AlertTitle>Resource payments are not enabled</AlertTitle><AlertDescription>The operator must connect payment processing and verified hosting costs first. Your existing share allowance is unchanged.</AlertDescription></Alert>}
      {wallet?.enabled && <>
        {wallet.mode === 'test' && <Badge variant="secondary">Test mode — not real money</Badge>}
        <section aria-label="Resource balance" className="flex flex-col gap-1">
          <p className="text-2xl font-semibold">{number(wallet.credits)} resource credits</p>
          <p className="text-sm text-muted-foreground">{money(wallet.balanceNanos)} prepaid balance · 100 credits = €1</p>
          <p className="text-sm text-muted-foreground">Charge = documented supplier resource cost × 2.5. No subscription or automatic recharge.</p>
        </section>
        {(!wallet.canUse || wallet.balanceNanos < 1e9) && <Alert variant={wallet.held ? 'destructive' : 'default'}>
          <AlertTitle>{wallet.held ? 'Payment review in progress' : wallet.balanceNanos <= 0 ? 'Resource balance exhausted' : 'Low resource balance'}</AlertTitle>
          <AlertDescription>{wallet.held ? 'Adding funds does not clear a payment hold. Contact the operator.' : 'Add credits to keep your links available. Already incurred usage can settle after a request finishes.'}</AlertDescription>
        </Alert>}
        <section aria-label="Buy resource credits" className="flex flex-col gap-3">
          <h3 className="font-semibold">Add credits</h3>
          <ToggleGroup type="single" variant="outline" value={bundle} onValueChange={value => { if (value) { setBundle(value); requestId.current = null; } }} disabled={busy} aria-label="Credit bundle" className="justify-start flex-wrap">
            {wallet.bundlesCents.map(cents => <ToggleGroupItem key={cents} value={String(cents)} aria-label={`${number(cents)} credits for ${money(cents * 1e7)}`}>
              {number(cents)} credits · {money(cents * 1e7)}
            </ToggleGroupItem>)}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">{wallet.tax ? 'Applicable tax is calculated at checkout and is not added to your spendable balance.' : 'Any applicable tax treatment is shown at checkout.'} Payment details are handled by Stripe.</p>
          <Button disabled={busy || refreshing || wallet.held || Boolean(sessionId)} onClick={purchase}>{busy ? 'Opening secure checkout…' : 'Continue to secure checkout'}</Button>
          {error && <Button variant="outline" onClick={() => { requestId.current = null; setError(''); }}>Start a new checkout attempt</Button>}
        </section>
        <details>
          <summary className="cursor-pointer font-medium">Supplier rates and pricing</summary>
          <p className="text-sm text-muted-foreground my-2">Version {wallet.rateCard.version} · {wallet.rateCard.source}</p>
          <Table><TableHeader><TableRow><TableHead>Resource</TableHead><TableHead>Supplier cost per unit</TableHead></TableRow></TableHeader><TableBody>
            {Object.entries(wallet.rateCard.rates).map(([name, rate]) => <TableRow key={name}><TableCell>{name}</TableCell><TableCell>€{rate.eurPerUnit} / {rate.unit}</TableCell></TableRow>)}
          </TableBody></Table>
          <p className="text-xs text-muted-foreground mt-2">Only recorded, attributable usage is charged. GPU/VRAM and other resources are charged only when used and included in this rate card. Existing share allowances are separate, not cash.</p>
        </details>
        <section aria-label="Wallet activity" className="flex flex-col gap-3">
          <h3 className="font-semibold">Purchases &amp; usage</h3>
          {!history.entries.length && <p className="text-sm text-muted-foreground">No wallet activity yet.</p>}
          {history.entries.map(entry => <details key={entry.id} className="border rounded-md p-3">
            <summary className="cursor-pointer text-sm">{new Date(entry.createdAt).toLocaleString()} · {entry.kind.replaceAll('_', ' ')} · {money(entry.amountNanos)}</summary>
            {entry.kind === 'usage' ? <div className="flex flex-col gap-1 text-sm mt-2">
              <p>Supplier cost {money(entry.detail.baseNanos)} · charge {money(entry.detail.chargeNanos)}</p>
              <p>Rate version: {entry.detail.receipt.rateVersion} · receipt: {entry.detail.receipt.id}</p>
              <p>{entry.detail.receipt.startedAt} – {entry.detail.receipt.endedAt}</p>
              {entry.detail.lines.map(line => <p key={line.resource}>{line.quantity} {line.unit} ({line.resource}) at €{line.eurPerUnit} per unit</p>)}
              <p className="break-all">Source: {entry.detail.receipt.source} · evidence: {entry.detail.receipt.evidence}</p>
            </div> : <p className="text-xs break-all mt-2">Purchase reference: {entry.detail.orderId}</p>}
          </details>)}
          {history.nextCursor && <Button variant="outline" onClick={loadMore} disabled={loadingMore || refreshing}>{loadingMore ? 'Loading…' : 'Load older activity'}</Button>}
        </section>
      </>}
      <Button variant="outline" onClick={refresh} disabled={refreshing || busy}>{refreshing ? 'Refreshing…' : 'Refresh'}</Button>
    </DialogContent>
  </Dialog>;
};
