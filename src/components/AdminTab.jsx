import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { RefreshCw, Server, Users, Link2, CreditCard, Activity, Database, Cpu, Bell, AlertTriangle, Mail } from "lucide-react";
import { admin as adminAPI } from '../api';

const fmt = (n) => (n === null || n === undefined ? '—' : n);

const StatCard = ({ icon: Icon, title, value, sub, color = 'text-foreground' }) => (
  <Card>
    <CardContent className="pt-4 pb-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0"><Icon className={`h-4 w-4 ${color}`} /></div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className={`text-lg font-semibold leading-tight ${color}`}>{fmt(value)}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </CardContent>
  </Card>
);

export default function AdminTab() {
  const [status, setStatus] = useState(null);
  const [shares, setShares] = useState(null);
  const [users, setUsers] = useState(null);
  const [replyOperations, setReplyOperations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resolvingEventId, setResolvingEventId] = useState('');
  const [creditsUserId, setCreditsUserId] = useState('');
  const [creditsAmount, setCreditsAmount] = useState('');
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, sh, u, replies] = await Promise.all([
        adminAPI.getStatus(),
        adminAPI.getShares(),
        adminAPI.getUsers(),
        adminAPI.getFreelancerReplies(),
      ]);
      if (s.success) setStatus(s.data);
      if (sh.success) setShares(sh.data);
      if (u.success) setUsers(u.data);
      if (replies.success) setReplyOperations(replies.data);
    } catch (e) {
      toast({ title: 'Failed to load admin data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleAddCredits = async () => {
    if (!creditsUserId || !creditsAmount) return;
    try {
      const res = await adminAPI.addCredits(creditsUserId, parseInt(creditsAmount));
      if (res.success) {
        toast({ title: `Added ${creditsAmount} credits`, description: `New balance: ${res.data.credits}` });
        setCreditsUserId('');
        setCreditsAmount('');
        load();
      }
    } catch {
      toast({ title: 'Failed to add credits', variant: 'destructive' });
    }
  };

  const handleResolveReply = async (eventId, participantEmail, participantName) => {
    setResolvingEventId(eventId);
    try {
      const response = await adminAPI.resolveFreelancerReply(eventId, participantEmail);
      if (response.success) {
        toast({
          title: `Reply sent to ${participantName}`,
          description: 'The freelancer received your normal Trello reply by email.'
        });
        await load();
      }
    } catch (error) {
      toast({ title: 'Reply could not be delivered', description: error.message, variant: 'destructive' });
    } finally {
      setResolvingEventId('');
    }
  };

  const uptimeStr = (s) => {
    if (!s) return '—';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">System Status</h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Health + Uptime */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Activity} title="Status" value={status?.status ?? '…'}
          color={status?.status === 'healthy' ? 'text-green-600' : 'text-yellow-500'} />
        <StatCard icon={Server} title="Uptime" value={uptimeStr(status?.uptime)} />
        <StatCard icon={Cpu} title="Memory" value={status ? `${status.memory.processUsedMB} MB` : '…'}
          sub={status ? `of ${status.memory.processTotalMB} MB heap` : ''} />
        <StatCard icon={Database} title="Node" value={status?.nodeVersion ?? '…'}
          sub={status?.environment} />
      </div>

      {/* Trello notification readiness */}
      {status?.trelloNotifications && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell className="h-4 w-4" /> Trello freelancer notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={status.trelloNotifications.sharedRelayConfigured ? 'default' : 'destructive'}>
                {status.trelloNotifications.sharedRelayConfigured ? 'Relay configured' : 'Relay token missing'}
              </Badge>
              <span className="text-muted-foreground">
                Target: {status.trelloNotifications.targetMode === 'explicit-username' ? 'configured username' : 'connected Trello owner'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={status.freelancerReplies?.webhook?.configured ? 'default' : 'secondary'}>
                {status.freelancerReplies?.webhook?.configured ? 'Mobile replies live' : 'Polling fallback'}
              </Badge>
              <span className="text-muted-foreground">
                {status.freelancerReplies?.webhook?.activeCards || 0} card webhook(s) active
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={status.freelancerReplies?.emailConfigured ? 'default' : 'destructive'}>
                {status.freelancerReplies?.emailConfigured ? 'Freelancer email ready' : 'Freelancer email missing'}
              </Badge>
              <span className="text-muted-foreground">
                Background replies: every {Math.round((status.freelancerReplies?.backgroundPollIntervalMs || 60000) / 1000)}s
              </span>
            </div>
            <p className="text-muted-foreground">
              Add the relay to each board once. ShareT automatically assigns it to a card before posting the first freelancer comment there.
            </p>
            <p className="text-muted-foreground">
              Native freelancer names use the optional per-share relay token; successful comment responses report whether a bell notification is expected.
            </p>
          </CardContent>
        </Card>
      )}

      {replyOperations && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mail className="h-4 w-4" /> Freelancer reply delivery
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant={replyOperations.webhook?.configured ? 'default' : 'secondary'}>
                {replyOperations.webhook?.configured ? 'Webhook ready' : 'Webhook not configured'}
              </Badge>
              <Badge variant="outline">{replyOperations.pendingThreads || 0} awaiting reply</Badge>
              <Badge variant={replyOperations.ambiguous?.length ? 'destructive' : 'outline'}>
                {replyOperations.ambiguous?.length || 0} need review
              </Badge>
            </div>

            {replyOperations.ambiguous?.length > 0 ? (
              <div className="space-y-3">
                {replyOperations.ambiguous.map(event => (
                  <div key={event.id} className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div>
                          <p className="text-xs font-semibold">Choose who should receive this Trello reply</p>
                          <p className="text-[11px] text-muted-foreground">
                            {event.cardName || 'Trello card'} · {event.ownerName || 'Card owner'} · {event.replyDate ? new Date(event.replyDate).toLocaleString() : ''}
                          </p>
                        </div>
                        <blockquote className="border-l-2 border-amber-300 pl-2 text-xs text-foreground">
                          {event.replyText || 'A reply was posted in Trello.'}
                        </blockquote>
                        <div className="flex flex-wrap gap-2">
                          {event.candidates.map(candidate => (
                            <Button
                              key={`${event.id}-${candidate.participantEmail}`}
                              size="sm"
                              variant="outline"
                              className="h-auto min-h-8 whitespace-normal text-left text-xs"
                              disabled={resolvingEventId === event.id}
                              onClick={() => handleResolveReply(event.id, candidate.participantEmail, candidate.participantName)}
                            >
                              Send to {candidate.participantName}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Normal Trello replies are being routed automatically. No ambiguous replies need attention.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Shares */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Link2} title="Total shares" value={shares?.total ?? '…'} />
        <StatCard icon={Link2} title="Active" value={shares?.active ?? '…'} color="text-green-600" />
        <StatCard icon={Link2} title="Inactive" value={shares?.inactive ?? '…'} color="text-muted-foreground" />
      </div>

      {/* System */}
      {status?.system && (
        <Card>
          <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">Host Machine</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>Platform: <span className="text-foreground font-medium">{status.system.platform} / {status.system.arch}</span></p>
            <p>CPUs: <span className="text-foreground font-medium">{status.system.cpus}</span></p>
            <p>RAM: <span className="text-foreground font-medium">{status.system.freeMemGB} GB free of {status.system.totalMemGB} GB</span></p>
            <p>Public URL: <span className="text-foreground font-medium break-all">{status.publicUrl || 'Not set'}</span></p>
          </CardContent>
        </Card>
      )}

      {/* Users */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> Users ({users?.length ?? '…'})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {users && users.length > 0 ? (
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded-lg">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{u.email}</p>
                    <p className="text-muted-foreground">{u.name || '—'} · joined {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '?'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">{u.role}</Badge>
                    {u.role !== 'admin' && (
                      <span className="text-muted-foreground">{u.credits ?? 0} cr</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No users found.</p>
          )}
        </CardContent>
      </Card>

      {/* Add credits */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Add Legacy Share Allowance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="User ID"
              value={creditsUserId}
              onChange={e => setCreditsUserId(e.target.value)}
              className="h-8 text-xs font-mono"
            />
            <Input
              placeholder="Amount"
              type="number"
              min="1"
              value={creditsAmount}
              onChange={e => setCreditsAmount(e.target.value)}
              className="h-8 text-xs w-24"
            />
            <Button size="sm" className="h-8 text-xs shrink-0" onClick={handleAddCredits}>
              Add
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">This adjusts the old share-count allowance only, not prepaid money. Resource wallet credits require verified Stripe payment. Copy the User ID from the users table above.</p>
        </CardContent>
      </Card>

      {/* Recent share links */}
      {shares?.links?.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">Recent Share Links</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {shares.links.slice(0, 20).map(l => (
                <div key={l._id} className="flex items-center justify-between text-xs p-1.5 bg-muted/20 rounded">
                  <span className="truncate font-medium">{l.cardName || l.shareId}</span>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <Badge variant={l.isActive ? 'default' : 'secondary'} className="text-[10px]">
                      {l.isActive ? 'active' : 'off'}
                    </Badge>
                    <span className="text-muted-foreground">{l.accessCount || 0} views</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
