import { useState } from 'react';
import { ArrowLeft, ArrowUp, Link2, Menu, MessageCircle, MoreHorizontal, Search, SlidersHorizontal, Trello } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export const exampleUpdate = 'The first draft is ready for your feedback.';
export const exampleReply = 'Looks great. Let’s refine the homepage.';

function Person({ person }) {
  const alex = person === 'Alex Morgan';
  return <Avatar className="preview-avatar"><AvatarImage src={`/marketing/${alex ? 'alex' : 'jamie'}.webp`} alt="" /><AvatarFallback>{alex ? 'AM' : 'JL'}</AvatarFallback></Avatar>;
}

function Comment({ bot = false, announce = false, children }) {
  return <div className="preview-comment">
    {bot ? <span className="preview-bot"><Link2 aria-hidden="true" /></span> : <Person person="Jamie Lee" />}
    <div className="preview-comment-body"><div className="preview-comment-author"><strong>{bot ? 'ShareT' : 'Jamie Lee'}</strong><span>{bot ? 'Today at 10:15' : 'Today at 10:42'}</span></div><p aria-live={announce ? 'polite' : undefined} aria-atomic={announce ? true : undefined}>{children}</p></div>
  </div>;
}

function Composer({ kind, onSend }) {
  const [draft, setDraft] = useState('');
  const submit = event => {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    onSend(message.slice(0, 500));
    setDraft('');
  };
  return <form className="preview-composer" onSubmit={submit} aria-label={`Example ${kind} form`}>
    <label className="sr-only" htmlFor={`example-${kind}`}>Example {kind === 'update' ? 'freelancer update' : 'owner reply'}</label>
    <Input id={`example-${kind}`} aria-label={`Example ${kind === 'update' ? 'freelancer update' : 'owner reply'}`} aria-describedby="example-description" autoComplete="off" maxLength={500} placeholder={kind === 'update' ? 'Write a message…' : 'Write a reply…'} value={draft} onChange={event => setDraft(event.target.value)} />
    <Button type="submit" size="sm" disabled={!draft.trim()} aria-label={kind === 'update' ? 'Send example update' : 'Send example reply'}>
      {kind === 'update' ? 'Send' : <ArrowUp aria-hidden="true" data-icon="inline-start" />}
    </Button>
  </form>;
}

export function TrelloPreview({ update, reply, onReply, compact = false }) {
  return <div className={cn('preview-window trello-preview', compact && 'preview-phone')}>
    <div className="preview-window-bar" aria-hidden="true">
      {compact ? <ArrowLeft /> : <Trello className="trello-symbol" />}<span>{compact ? 'Trello' : 'You · Trello'}</span>{compact && <Search />}<MoreHorizontal />
    </div>
    <div className="preview-window-content">
      <h3>Website redesign</h3>
      <div className="preview-toolbar" aria-hidden="true"><MessageCircle /><span>Comment</span><SlidersHorizontal /><span>Filter</span><MoreHorizontal /></div>
      <div className="preview-thread">
        <Comment bot announce={!compact}>Alex Morgan: {update}</Comment>
        <Comment announce={!compact}>{reply}</Comment>
      </div>
      {compact ? <div className="preview-static-input" aria-hidden="true">Write a reply…</div> : <Composer kind="reply" onSend={onReply} />}
    </div>
  </div>;
}

export default function ConversationPreview({ update, reply, onUpdate, onReply }) {
  return <figure className="conversation-preview" id="example-conversation" aria-label="Interactive example conversation">
    <div className="conversation-windows">
      <svg className="conversation-connection" viewBox="0 0 700 550" fill="none" aria-hidden="true"><path d="M164 323V378Q164 432 218 432H361" /><circle cx="164" cy="323" r="5" /><circle cx="361" cy="432" r="6" /></svg>
      <div className="preview-window freelancer-preview">
        <div className="preview-window-bar"><Link2 aria-hidden="true" /><span>Freelancer · ShareT</span><Menu aria-hidden="true" /></div>
        <div className="preview-window-content">
          <h3>Website redesign</h3>
          <div className="preview-person"><Person person="Alex Morgan" /><span>Alex Morgan</span></div>
          <p className="preview-update">{update}</p>
          <Composer kind="update" onSend={onUpdate} />
        </div>
      </div>
      <TrelloPreview update={update} reply={reply} onReply={onReply} />
    </div>
    <figcaption>Example conversation</figcaption>
    <p id="example-description" className="example-disclaimer">Try an update or reply. These fictional messages stay on this page and are not sent to Trello or by email.</p>
  </figure>;
}
