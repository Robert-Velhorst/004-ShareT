import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

function LegalLayout({ title, children }) {
  return (
    <main className="min-h-screen bg-background px-6 py-12 text-foreground">
      <article className="mx-auto max-w-3xl space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">{title}</h1>
          <Button asChild variant="outline"><Link to="/">Back to ShareT</Link></Button>
        </div>
        {children}
      </article>
    </main>
  );
}

export function Privacy() {
  return (
    <LegalLayout title="Privacy">
      <p>ShareT stores account details, Trello connection metadata, share policies, access history, and verified freelancer contact details needed to operate each shared conversation.</p>
      <h2 className="text-xl font-semibold">How data is protected</h2>
      <p>Passwords are hashed. Trello credentials are encrypted at rest. Browser sessions use HttpOnly cookies. Access logs store a keyed hash instead of a raw IP address, and expired verification records and access logs are pruned automatically.</p>
      <h2 className="text-xl font-semibold">Control and deletion</h2>
      <p>Account owners can download their ShareT data or permanently delete the account and its owned records from the profile panel. Revoking a share link immediately stops public access.</p>
      <h2 className="text-xl font-semibold">External services</h2>
      <p>Card content and comments are exchanged with Trello under the connected owner and relay accounts. Verification and reply notices use the operator-configured email provider. Those providers apply their own terms and retention policies.</p>
    </LegalLayout>
  );
}

export function Terms() {
  return (
    <LegalLayout title="Terms of use">
      <p>ShareT is a controlled bridge to Trello for collaborators who cannot use their own Trello account. The account owner remains responsible for selecting the card, permissions, recipients, expiry, and content shared through each link.</p>
      <h2 className="text-xl font-semibold">Safe use</h2>
      <p>Do not use ShareT to bypass authorization, Trello access rules, or applicable law. Use email restrictions, passwords, expiry, and revocation whenever card content is sensitive.</p>
      <h2 className="text-xl font-semibold">Service dependencies</h2>
      <p>Delivery depends on Trello, the configured email provider, and the operator's hosting environment. ShareT reports provider failures instead of claiming that an action succeeded.</p>
    </LegalLayout>
  );
}
