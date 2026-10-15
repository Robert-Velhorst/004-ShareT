import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, LockKeyhole, Mail, PanelsTopLeft, Plus, Smartphone, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Brand from './Brand';
import ConversationPreview, { TrelloPreview, exampleUpdate, exampleReply } from './ConversationPreview';

const steps = [
  ['Choose the work', 'Select a Trello card or list.'],
  ['Send a link', 'Your collaborator opens ShareT. No Trello account needed.'],
  ['Keep work moving', 'Updates reach Trello. Reply from your usual workflow.'],
];
const controls = [
  [PanelsTopLeft, 'Selected cards or lists', 'Share the work you choose.'],
  [LockKeyhole, 'Password and expiry options', 'Set boundaries around each link.'],
  [UserRound, 'Verified email participation', 'Help keep names and replies connected.'],
];
const questions = [
  ['account', 'Do freelancers need a Trello account?', 'No. They open your ShareT link to view the shared work and participate. Commenting requires a name and email verification.'],
  ['mobile', 'Can I reply from the Trello mobile app?', 'Yes. Reply normally on the Trello card, from your phone or computer. When several freelancers are waiting, use the intended person’s full name, or start your reply with their unique first name. Email delivery requires a configured email service.'],
  ['access', 'What can someone see through my link?', 'The card or list you select, according to the link’s settings. Anyone with the link may be able to view that shared content, so use password and expiry options when appropriate and share links carefully.'],
];

export default function HomePage({ signedIn = false }) {
  const destination = signedIn ? '/app' : '/signup';
  const [update, setUpdate] = useState(exampleUpdate);
  const [reply, setReply] = useState(exampleReply);
  return <div className="sharet-marketing">
    <a className="marketing-skip" href="#main-content">Skip to content</a>
    <header className="marketing-header marketing-container">
      <Link to="/" aria-label="ShareT home"><Brand /></Link>
      <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#why-sharet">Why ShareT</a><a href="#faq">FAQ</a></nav>
      <div className="marketing-header-actions"><Link to={signedIn ? '/app' : '/signin'}>{signedIn ? 'Dashboard' : 'Sign in'}</Link><Button asChild><Link to={destination}>Get started</Link></Button></div>
    </header>
    <main id="main-content" tabIndex={-1}>
      <section className="marketing-hero marketing-container" aria-labelledby="hero-heading">
        <div className="marketing-hero-copy">
          <h1 id="hero-heading">Your Trello.<br /><span>Their way in.</span></h1>
          <p>Share work with freelancers and clients—even when they don’t use Trello. They update through ShareT. You reply from Trello.</p>
          <div className="marketing-hero-actions"><Button size="lg" asChild><Link to={destination}>Create a share link</Link></Button><a className="marketing-text-link" href="#how-it-works">See how it works <ArrowRight aria-hidden="true" /></a></div>
        </div>
        <ConversationPreview update={update} reply={reply} onUpdate={setUpdate} onReply={setReply} />
      </section>
      <section id="how-it-works" className="marketing-how" aria-labelledby="how-heading">
        <div className="marketing-container"><h2 id="how-heading">One link. A simpler way to work together.</h2>
          <ol className="marketing-steps">{steps.map(([title, body], index) => <li key={title}><span className="step-number" aria-hidden="true">0{index + 1}</span><h3>{title}</h3><p>{body}</p></li>)}</ol>
        </div>
      </section>
      <section id="why-sharet" className="marketing-benefits" aria-labelledby="benefits-heading">
        <div className="marketing-container">
          <div className="marketing-benefit-main">
            <div className="marketing-benefit-copy"><h2 id="benefits-heading">Stay in Trello.<br />Keep everyone in the loop.</h2><p>Your freelancers send updates through ShareT.<br />You keep the conversation with the work.</p></div>
            <figure className="marketing-reply-preview" aria-label="Example mobile reply and participant email">
              <TrelloPreview compact update={update} reply={reply} />
              <div className="preview-email"><span className="email-icon"><Mail aria-hidden="true" /></span><h3>New reply on<br />Website redesign</h3><p>Jamie replied:</p><p className="email-reply">{reply}</p><a href="#example-conversation">View in ShareT</a></div>
              <figcaption className="sr-only">Illustrative preview only. No actual email is sent.</figcaption>
            </figure>
          </div>
          <div className="marketing-benefit-points"><div><Smartphone aria-hidden="true" /><div><h3>Reply from your phone</h3><p>Use your normal Trello workflow.</p></div></div><div><Mail aria-hidden="true" /><div><h3>Updates that reach both sides</h3><p>Verified participants can receive reply emails.</p></div></div></div>
        </div>
      </section>
      <section className="marketing-controls marketing-container" aria-labelledby="controls-heading">
        <div><h2 id="controls-heading">Share the work.<br />Choose the access.</h2><ul>{controls.map(([Icon, title, body]) => <li key={title}><Icon aria-hidden="true" /><div><h3>{title}</h3><p>{body}</p></div></li>)}</ul></div>
        <figure className="preview-window preview-settings" aria-label="Example share settings: Website redesign, password enabled, expires 30 September 2026">
          <div className="preview-window-bar"><h3>Share settings</h3></div>
          <dl><div><dt>Content</dt><dd>Website redesign</dd></div><div className="settings-password"><dt>Password protection</dt><dd><span className="settings-toggle" aria-hidden="true"><span /></span><span className="sr-only">Enabled in this example</span></dd></div><div><dt>Expiry date</dt><dd><time dateTime="2026-09-30">30 Sep 2026</time><CalendarDays aria-hidden="true" /></dd></div></dl>
          <figcaption className="sr-only">Illustrative settings, not a real share link.</figcaption>
        </figure>
      </section>
      <section id="faq" className="marketing-faq" aria-labelledby="faq-heading"><div className="marketing-container">
        <h2 id="faq-heading">A few things you might be wondering.</h2>
        <Accordion type="single" collapsible defaultValue="account" className="marketing-questions">{questions.map(([id, question, answer]) => <AccordionItem key={id} value={id}><AccordionTrigger><span>{question}</span><Plus aria-hidden="true" className="faq-plus" /></AccordionTrigger><AccordionContent>{answer}</AccordionContent></AccordionItem>)}</Accordion>
      </div></section>
      <section className="marketing-final marketing-container" aria-labelledby="final-heading"><h2 id="final-heading">Less chasing. More progress.</h2><Button size="lg" asChild><Link to={destination}>Create your first share link</Link></Button></section>
    </main>
    <footer className="marketing-footer marketing-container"><Link to="/" aria-label="ShareT home"><Brand /></Link><p>Independent tool. Not affiliated with Atlassian.</p><nav aria-label="Footer navigation"><a href="https://github.com/Robert-Velhorst/004-ShareT">GitHub</a><Link to={signedIn ? '/app' : '/signin'}>{signedIn ? 'Dashboard' : 'Sign in'}</Link></nav></footer>
  </div>;
}
