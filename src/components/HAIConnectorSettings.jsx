import { useCallback, useEffect, useState } from 'react';
import { Bot, Copy, KeyRound, Trash2 } from 'lucide-react';
import { auth as authAPI } from '../api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const HAIConnectorSettings = () => {
  const [open, setOpen] = useState(false);
  const [tokens, setTokens] = useState([]);
  const [name, setName] = useState('HAI connector');
  const [allowWrite, setAllowWrite] = useState(false);
  const [createdToken, setCreatedToken] = useState('');
  const [loading, setLoading] = useState(false);

  const loadTokens = useCallback(async () => {
    try {
      const response = await authAPI.listApiTokens();
      setTokens(response.data || []);
    } catch (error) {
      toast.error(error.message || 'Unable to load connector tokens');
    }
  }, []);

  useEffect(() => {
    if (open) loadTokens();
  }, [open, loadTokens]);

  const createToken = async () => {
    setLoading(true);
    try {
      const response = await authAPI.createApiToken({
        name,
        scopes: allowWrite ? ['connector:read', 'shares:write'] : ['connector:read'],
        expiresInDays: 90,
      });
      setCreatedToken(response.token);
      await loadTokens();
    } catch (error) {
      toast.error(error.message || 'Unable to create connector token');
    } finally {
      setLoading(false);
    }
  };

  const copy = async (value, label) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const revoke = async (tokenId) => {
    try {
      await authAPI.revokeApiToken(tokenId);
      await loadTokens();
      toast.success('Connector token revoked');
    } catch (error) {
      toast.error(error.message || 'Unable to revoke connector token');
    }
  };

  const openApiUrl = `${window.location.origin}/api/connector/openapi.json`;
  const shareTBaseUrl = window.location.origin;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) setCreatedToken('');
    }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Bot className="mr-2 size-4" /> HAI connector</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect ShareT to HAI</DialogTitle>
          <DialogDescription>
            Create a revocable read-only credential for HAI's native ShareT source. The credential expires after 90 days and is stored by ShareT only as a one-way hash.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>ShareT base URL for HAI</Label>
            <div className="flex gap-2">
              <Input value={shareTBaseUrl} readOnly />
              <Button type="button" variant="outline" size="icon" onClick={() => copy(shareTBaseUrl, 'ShareT base URL')} aria-label="Copy ShareT base URL">
                <Copy className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Set this as <code>HAI_SHARET_BASE_URL</code> and enable the <code>sharet</code> source in HAI.</p>
          </div>

          <div className="space-y-2">
            <Label>OpenAPI contract (optional)</Label>
            <div className="flex gap-2">
              <Input value={openApiUrl} readOnly />
              <Button type="button" variant="outline" size="icon" onClick={() => copy(openApiUrl, 'OpenAPI URL')} aria-label="Copy OpenAPI URL">
                <Copy className="size-4" />
              </Button>
            </div>
          </div>

          {createdToken ? (
            <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-4">
              <p className="font-medium">Copy this token now</p>
              <p className="text-sm text-muted-foreground">It will not be shown again. Set it as <code>HAI_SHARET_CONNECTOR_TOKEN</code> in HAI's protected environment.</p>
              <div className="flex gap-2">
                <Input value={createdToken} readOnly type="password" />
                <Button type="button" onClick={() => copy(createdToken, 'Connector token')}>
                  <Copy className="mr-2 size-4" /> Copy
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-md border p-4">
              <div className="space-y-2">
                <Label htmlFor="connector-name">Credential name</Label>
                <Input id="connector-name" value={name} maxLength={80} onChange={event => setName(event.target.value)} />
              </div>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={allowWrite} onChange={event => setAllowWrite(event.target.checked)} className="mt-1" />
                <span>
                  <span className="block font-medium">Also allow trusted API clients to manage links</span>
                  <span className="text-muted-foreground">HAI's native ShareT source is read-only and does not need this. Enable it only for a separately reviewed API workflow.</span>
                </span>
              </label>
              <Button type="button" onClick={createToken} disabled={loading || !name.trim()}>
                <KeyRound className="mr-2 size-4" /> {loading ? 'Creating…' : 'Create connector token'}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="font-medium">Active credentials</h3>
            {tokens.length === 0 ? <p className="text-sm text-muted-foreground">No connector credentials yet.</p> : tokens.map(token => (
              <div key={token.tokenId} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{token.name}</p>
                  <p className="text-muted-foreground">
                    {token.scopes.includes('shares:write') ? 'Read and manage links' : 'Read only'} · expires {new Date(token.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => revoke(token.tokenId)} aria-label={`Revoke ${token.name}`}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HAIConnectorSettings;
