import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, FileText, Paperclip, Calendar, AlertTriangle, CheckSquare, Link2, History, RefreshCw, ExternalLink, Upload, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { format } from 'date-fns';
import { sharedAccess } from '../api';
import { ThemeToggle } from './ThemeToggle';
import {
  clearShareParticipant,
  readShareParticipant,
  readSharePasswordGrant,
  writeShareParticipant,
} from '../lib/shareParticipant';

const AUTO_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes
const COMMENT_REFRESH_INTERVAL = 30 * 1000;

// Fix #8: URL rendering — make URLs clickable and match Trello style
const renderUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.hostname + (parsed.pathname !== '/' ? parsed.pathname : '');
  } catch {
    return url;
  }
};

// Fix #4 & #16: Markdown renderer component for Trello markup
// remark-breaks makes single newlines render as line breaks, matching Trello's editor behavior
const TrelloMarkdown = ({ content }) => {
  if (!content) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 underline break-all">
            {children}
          </a>
        ),
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-1.5 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-1.5 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1 first:mt-0">{children}</h3>,
        pre: ({ children }) => <pre className="bg-slate-100 dark:bg-slate-800 p-3 rounded overflow-x-auto text-sm font-mono mb-2">{children}</pre>,
        code: ({ children }) => <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[13px] font-mono">{children}</code>,
        blockquote: ({ children }) => <blockquote className="border-l-4 border-slate-300 dark:border-slate-600 pl-3 italic text-muted-foreground">{children}</blockquote>,
        hr: () => <hr className="my-3 border-slate-200 dark:border-slate-700" />,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

const SharedCardView = ({ linkToken }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [cardData, setCardData] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [comments, setComments] = useState([]);
  const [actions, setActions] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [members, setMembers] = useState([]);
  const [hideCompletedMap, setHideCompletedMap] = useState({});
  const [permissions, setPermissions] = useState({});
  const [error, setError] = useState(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newDueDate, setNewDueDate] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [participantSession, setParticipantSession] = useState(() => readShareParticipant(linkToken));
  const participant = participantSession?.participant || null;
  const participantToken = participantSession?.participantToken || '';
  const passwordToken = useMemo(() => readSharePasswordGrant(linkToken), [linkToken]);
  const shareAccess = useMemo(() => ({ participantToken, passwordToken }), [participantToken, passwordToken]);
  
  const refreshTimerRef = useRef(null);
  const commentRefreshRef = useRef(null);
  const backgroundRefreshRef = useRef(null);

  // Keep the open conversation current without replacing in-progress input.
  const fetchComments = useCallback(async () => {
    try {
      const response = await sharedAccess.getComments(linkToken, shareAccess);
      if (response.data) {
        setComments(response.data);
        setLastRefreshed(new Date());
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  }, [linkToken, shareAccess]);
  
  const fetchAttachments = useCallback(async () => {
    try {
      const response = await sharedAccess.getAttachments(linkToken, shareAccess);
      if (response.data) {
        setAttachments(response.data);
      }
    } catch (error) {
      console.error('Error fetching attachments:', error);
    }
  }, [linkToken, shareAccess]);

  // Fix #13: Fetch full action history
  const fetchActions = useCallback(async () => {
    try {
      const response = await sharedAccess.getActions(linkToken, shareAccess);
      if (response.data) {
        setActions(response.data);
      }
    } catch (error) {
      console.error('Error fetching actions:', error);
    }
  }, [linkToken, shareAccess]);

  // Fix #7: Fetch all checklists  
  const fetchChecklists = useCallback(async () => {
    try {
      const response = await sharedAccess.getChecklists(linkToken, shareAccess);
      if (response.data) {
        setChecklists(response.data);
      }
    } catch (error) {
      console.error('Error fetching checklists:', error);
    }
  }, [linkToken, shareAccess]);

  // Fix #10: Fetch card members
  const fetchMembers = useCallback(async () => {
    try {
      const response = await sharedAccess.getMembers(linkToken, shareAccess);
      if (response.data) {
        setMembers(response.data);
      }
    } catch (error) {
      console.error('Error fetching members:', error);
    }
  }, [linkToken, shareAccess]);

  const fetchCardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await sharedAccess.getCard(linkToken, shareAccess);

      if (!response.accessGranted) {
        window.location.href = `/shared/${linkToken}`;
        return;
      }

      if (response.linkInfo?.requiresParticipantIdentity || response.linkInfo?.requiresEmail) {
        if (!participantToken) {
          window.location.href = `/shared/${linkToken}`;
          return;
        }

        try {
          const status = await sharedAccess.getParticipantStatus(linkToken, participantToken);
          const saved = writeShareParticipant(linkToken, participantToken, status.participant);
          setParticipantSession(saved);
        } catch {
          clearShareParticipant(linkToken);
          window.location.href = `/shared/${linkToken}`;
          return;
        }
      }

      if (response.data?.card) {
        setCardData(response.data.card);
        setPermissions(response.data.permissions || {});
        await Promise.allSettled([
          fetchComments(),
          fetchAttachments(),
          fetchChecklists(),
          fetchMembers(),
          fetchActions()
        ]);
      } else {
        throw new Error('Card data not found');
      }
    } catch (error) {
      console.error('Error fetching card data:', error);
      setError(error.message || 'Failed to load card data');
    } finally {
      setIsLoading(false);
      setLastRefreshed(new Date());
    }
  }, [fetchActions, fetchAttachments, fetchChecklists, fetchComments, fetchMembers, linkToken, participantToken, shareAccess]);

  
  useEffect(() => {
    fetchCardData();
    
    // Fix #6: Auto-refresh every 30 minutes
    refreshTimerRef.current = setInterval(() => {
      fetchCardData();
    }, AUTO_REFRESH_INTERVAL);

    commentRefreshRef.current = setInterval(fetchComments, COMMENT_REFRESH_INTERVAL);

    // Less time-sensitive card data can stay on the existing slower cadence.
    backgroundRefreshRef.current = setInterval(() => {
      fetchAttachments();
      fetchActions();
    }, 90 * 1000);

    const refreshVisibleConversation = () => {
      if (document.visibilityState === 'visible') fetchComments();
    };
    window.addEventListener('focus', refreshVisibleConversation);
    document.addEventListener('visibilitychange', refreshVisibleConversation);
    
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      if (commentRefreshRef.current) clearInterval(commentRefreshRef.current);
      if (backgroundRefreshRef.current) clearInterval(backgroundRefreshRef.current);
      window.removeEventListener('focus', refreshVisibleConversation);
      document.removeEventListener('visibilitychange', refreshVisibleConversation);
    };
  }, [fetchActions, fetchAttachments, fetchCardData, fetchComments]);

  const handleChangeIdentity = () => {
    clearShareParticipant(linkToken);
    window.location.href = `/shared/${linkToken}`;
  };

  const toggleHideCompleted = (clId) => {
    setHideCompletedMap(prev => ({ ...prev, [clId]: !prev[clId] }));
  };

  // Fix #16: Comment with full markdown support
  const handleAddComment = async () => {
    if (!comment.trim()) return;
    if (!participantToken || !participant) {
      toast.error('Verify your email before commenting');
      window.location.href = `/shared/${linkToken}`;
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const response = await sharedAccess.addComment(linkToken, {
        text: comment,
        participantToken
      }, shareAccess);
      
      if (response.success) {
        toast.success("Comment added");
        setComment('');
        fetchComments();
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error(error.message || 'Failed to add comment');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleUpdateDueDate = async () => {
    if (!newDueDate) return;
    
    setIsSubmitting(true);
    
    try {
      const response = await sharedAccess.updateDueDate(linkToken, newDueDate, shareAccess);
      
      if (response.success) {
        toast.success("Due date updated");
        fetchCardData();
      }
    } catch (error) {
      console.error('Error updating due date:', error);
      toast.error(error.message || 'Failed to update due date');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Fix #11: Real file upload to Trello via backend
  const handleUploadAttachment = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsSubmitting(true);
    
    try {
      const response = await sharedAccess.uploadAttachment(linkToken, file, shareAccess);
      
      if (response.success) {
        toast.success("Attachment uploaded");
        fetchAttachments();
      }
    } catch (error) {
      console.error('Error uploading attachment:', error);
      toast.error(error.message || 'Failed to upload attachment');
    } finally {
      setIsSubmitting(false);
      e.target.value = ''; // Reset file input
    }
  };

  const handleDownloadAttachment = async (attachment) => {
    try {
      const { blob } = await sharedAccess.downloadAttachment(linkToken, attachment.id, shareAccess);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.name || 'attachment';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading attachment:', error);
      toast.error(error.message || 'Failed to download attachment');
    }
  };

  // Fix #12: Format exact date/time
  const formatExactDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
    } catch {
      return dateStr;
    }
  };

  // Parse **AuthorName**: text format written by ShareT to extract the real commenter name
  const parseCommentAuthor = (text) => {
    if (!text) return { author: null, body: '' };
    const match = text.match(/^\*\*(.+?)\*\*: ([\s\S]*)$/);
    if (match) return { author: match[1], body: match[2] };
    return { author: null, body: text };
  };

  // Describe action type for history
  const describeAction = (action) => {
    const type = action.type;
    const creator = action.memberCreator?.fullName || 'Someone';
    switch (type) {
      case 'commentCard': return `${creator} commented`;
      case 'addAttachmentToCard': return `${creator} added an attachment`;
      case 'deleteAttachmentFromCard': return `${creator} removed an attachment`;
      case 'addChecklistToCard': return `${creator} added a checklist`;
      case 'removeChecklistFromCard': return `${creator} removed a checklist`;
      case 'updateCheckItemStateOnCard': return `${creator} updated a checklist item`;
      case 'addMemberToCard': return `${creator} added a member`;
      case 'removeMemberFromCard': return `${creator} removed a member`;
      case 'updateCard': return `${creator} updated the card`;
      case 'moveCardToBoard': return `${creator} moved the card`;
      case 'createCard': return `${creator} created the card`;
      default: return `${creator} performed "${type}"`;
    }
  };
  
  const TRELLO_COLORS = {
    green: '#4BCE97', yellow: '#F5CD47', orange: '#FAA53D', red: '#F87168',
    purple: '#9F8FEF', blue: '#579DFF', sky: '#6CC3E0', lime: '#94C748',
    pink: '#E774BB', black: '#8590A2',
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#f1f2f4] dark:bg-[#1d2125]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#f1f2f4] dark:bg-[#1d2125] p-4">
        <div className="bg-white dark:bg-[#22272b] rounded-lg shadow p-6 max-w-md w-full text-center">
          <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-700 dark:text-zinc-200 mb-2">Access Error</h2>
          <p className="text-gray-500 dark:text-zinc-400 mb-4">{error}</p>
          <Button onClick={fetchCardData} variant="outline" className="w-full">Try Again</Button>
        </div>
      </div>
    );
  }

  if (!cardData) return null;

  const isOverdue = cardData.due && !cardData.dueComplete && new Date(cardData.due) < new Date();
  const fileAttachments = attachments.filter(a => a.isUpload);
  const trelloCardLinks = attachments.filter(a => !a.isUpload && /trello\.com\/c\//i.test(a.url || ''));
  const otherLinks = attachments.filter(a => !a.isUpload && !/trello\.com\/c\//i.test(a.url || ''));

  return (
    <div className="min-h-screen bg-[#f1f2f4] dark:bg-[#1d2125]">
      {/* Cover */}
      {cardData.cover?.color && (
        <div className="w-full h-32" style={{ backgroundColor: cardData.cover.color }} />
      )}

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Card title + breadcrumb */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-zinc-100 leading-tight">{cardData.name}</h1>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
              Shared via <span className="font-medium text-[#0079bf]">ShareT</span>
              {cardData.idBoard && <span className="ml-2 text-gray-400 dark:text-zinc-500">· Board ID: {cardData.idBoard}</span>}
            </p>
          </div>
          <div className="flex-shrink-0">
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
          {/* ── LEFT: main content ── */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* Members */}
            {members.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Members</h3>
                <div className="flex flex-wrap gap-2">
                  {members.map(m => (
                    <div key={m.id || m.username} className="flex items-center gap-1.5 bg-white dark:bg-[#22272b] dark:border-slate-700 border rounded-full pl-0.5 pr-3 py-0.5 shadow-sm">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={m.avatarUrl ? `${m.avatarUrl}/30.png` : undefined} />
                        <AvatarFallback className="text-xs bg-[#0079bf] text-white">{(m.fullName || '?')[0]}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium text-gray-700 dark:text-zinc-200">{m.fullName}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Labels */}
            {cardData.labels?.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Labels</h3>
                <div className="flex flex-wrap gap-1.5">
                  {cardData.labels.map(label => (
                    <span
                      key={label.id}
                      className="px-3 py-1 rounded text-xs font-semibold text-white"
                      style={{ backgroundColor: TRELLO_COLORS[label.color] || '#8590A2' }}
                    >
                      {label.name || label.color}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Due date */}
            {cardData.due && (
              <section>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Due Date</h3>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-sm font-medium ${
                  cardData.dueComplete ? 'bg-green-100 text-green-700' :
                  isOverdue ? 'bg-red-100 text-red-700' : 'bg-gray-100 dark:bg-slate-700 text-zinc-700 dark:text-zinc-200'
                }`}>
                  <Calendar className="h-3.5 w-3.5" />
                  {formatExactDate(cardData.due)}
                  {cardData.dueComplete && <span className="ml-1">✓ Complete</span>}
                  {isOverdue && !cardData.dueComplete && <span className="ml-1">Overdue</span>}
                </span>
              </section>
            )}

            {/* Description */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-zinc-200 mb-2 flex items-center gap-1.5">
                <FileText className="h-4 w-4" /> Description
              </h3>
              {cardData.desc ? (
                <div className="bg-white dark:bg-[#22272b] dark:border-slate-700 border rounded-lg p-4 text-sm text-gray-700 dark:text-zinc-200 leading-relaxed">
                  <TrelloMarkdown content={cardData.desc} />
                </div>
              ) : (
                <p className="text-sm text-gray-400 dark:text-zinc-500 italic bg-white dark:bg-[#22272b] dark:border-slate-700 border rounded-lg p-4">No description added.</p>
              )}
            </section>

            {/* Checklists */}
            {checklists.map(cl => {
              const total = cl.checkItems?.length || 0;
              const done = cl.checkItems?.filter(i => i.state === 'complete').length || 0;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const hideCompleted = !!hideCompletedMap[cl.id];
              const visibleItems = (cl.checkItems || []).slice().sort((a, b) => a.pos - b.pos).filter(i => !hideCompleted || i.state !== 'complete');
              return (
                <section key={cl.id}>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-zinc-200 flex items-center gap-1.5">
                      <CheckSquare className="h-4 w-4" /> {cl.name}
                    </h3>
                    <div className="flex items-center gap-3">
                      {done > 0 && (
                        <button
                          onClick={() => toggleHideCompleted(cl.id)}
                          className="text-xs text-[#0079bf] hover:underline"
                        >
                          {hideCompleted ? `Show completed (${done})` : 'Hide completed'}
                        </button>
                      )}
                      <span className="text-xs text-gray-500 dark:text-zinc-400">{pct}%</span>
                    </div>
                  </div>
                  <Progress value={pct} className="h-2 mb-3" />
                  <div className="space-y-1">
                    {visibleItems.map(item => (
                      <div key={item.id} className="flex items-center gap-2.5 py-1 px-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700/40">
                        <div className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${item.state === 'complete' ? 'bg-[#0079bf] border-[#0079bf]' : 'border-gray-400 dark:border-slate-500'}`}>
                          {item.state === 'complete' && <span className="text-white text-[9px] font-bold">✓</span>}
                        </div>
                        <span className={`text-sm ${item.state === 'complete' ? 'line-through text-gray-400 dark:text-zinc-500' : 'text-gray-700 dark:text-zinc-200'}`}>{item.name}</span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

            {/* Files — always show section when user can upload, even if no files yet */}
            {(fileAttachments.length > 0 || permissions.canUpload) && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-zinc-200 flex items-center gap-1.5">
                    <Paperclip className="h-4 w-4" /> Attachments
                  </h3>
                  {permissions.canUpload && (
                    <>
                      <input type="file" id="att-upload-main" className="hidden" onChange={handleUploadAttachment} />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => document.getElementById('att-upload-main').click()}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                        Upload File
                      </Button>
                    </>
                  )}
                </div>
                {fileAttachments.length > 0 ? (
                  <div className="space-y-2">
                    {fileAttachments.map(att => (
                      <div key={att.id} className="flex items-center gap-3 p-3 bg-white dark:bg-[#22272b] dark:border-slate-700 border rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/40">
                        <div className="w-16 h-12 bg-gray-100 dark:bg-slate-700 rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {att.previews?.length > 0
                            ? <img src={att.previews[att.previews.length - 1].url} alt="" className="w-full h-full object-cover" />
                            : <Paperclip className="h-5 w-5 text-gray-400 dark:text-zinc-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 dark:text-zinc-200 truncate">{att.name}</p>
                          <p className="text-xs text-gray-400 dark:text-zinc-500">{att.bytes ? `${Math.round(att.bytes / 1024)} KB · ` : ''}{formatExactDate(att.date)}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleDownloadAttachment(att)}>
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-zinc-500 italic bg-white dark:bg-[#22272b] dark:border-slate-700 border rounded-lg p-4">No attachments yet. Use the button above to upload a file.</p>
                )}
              </section>
            )}

            {/* Trello Card Links */}
            {trelloCardLinks.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-zinc-200 mb-2 flex items-center gap-1.5">
                  <Link2 className="h-4 w-4" /> Trello Cards
                </h3>
                <div className="space-y-1.5">
                  {trelloCardLinks.map(link => (
                    <div key={link.id} className="flex items-center gap-2.5 p-2.5 bg-white dark:bg-[#22272b] dark:border-slate-700 border rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/40">
                      <div className="w-8 h-8 rounded bg-[#0079bf] flex items-center justify-center flex-shrink-0">
                        <Link2 className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 dark:text-zinc-200 truncate">{link.name || renderUrl(link.url)}</p>
                        <p className="text-xs text-gray-400 dark:text-zinc-500">{formatExactDate(link.date)}</p>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Other Links */}
            {otherLinks.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-zinc-200 mb-2 flex items-center gap-1.5">
                  <ExternalLink className="h-4 w-4" /> Links
                </h3>
                <div className="space-y-1">
                  {otherLinks.map(link => (
                    <div key={link.id} className="flex items-center gap-2 p-2 bg-white dark:bg-[#22272b] dark:border-slate-700 border rounded hover:bg-gray-50 dark:hover:bg-slate-700/40">
                      <ExternalLink className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:underline truncate flex-1">
                        {link.name || renderUrl(link.url)}
                      </a>
                      <span className="text-xs text-gray-400 dark:text-zinc-500 flex-shrink-0">{formatExactDate(link.date)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Activity + Comments */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-zinc-200 mb-3 flex items-center gap-1.5">
                <History className="h-4 w-4" /> Activity
              </h3>

              {/* Add comment */}
              {permissions.canComment && (
                <div className="flex gap-3 mb-5">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="bg-[#0079bf] text-white text-xs">
                      {(participant?.name || '?')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/30">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                          <ShieldCheck className="h-3.5 w-3.5" /> Commenting as {participant?.name}
                        </p>
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 truncate">
                          Replies will be emailed to {participant?.email}
                        </p>
                      </div>
                      <button type="button" onClick={handleChangeIdentity} className="text-[11px] text-emerald-800 dark:text-emerald-300 underline flex-shrink-0">
                        Change
                      </button>
                    </div>
                    <textarea
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Write a comment…"
                      className="w-full p-3 border dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none min-h-[72px] focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white dark:bg-[#22272b]"
                    />
                    {comment.trim() && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={handleAddComment}
                          disabled={isSubmitting || !participantToken}
                          className="bg-[#0079bf] hover:bg-[#005f99] disabled:opacity-50"
                          title={!participantToken ? 'Verify your email first' : ''}
                        >
                          {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Comments list */}
              <div className="space-y-3">
                {comments.map(c => {
                  const { author, body } = parseCommentAuthor(c.data?.text || '');
                  const displayName = author || c.memberCreator?.fullName || 'Unknown';
                  const isShareTComment = !!author;
                  return (
                    <div key={c.id} className="flex gap-3">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        {!isShareTComment && <AvatarImage src={c.memberCreator?.avatarUrl ? `${c.memberCreator.avatarUrl}/30.png` : undefined} />}
                        <AvatarFallback className="text-xs bg-gray-300 dark:bg-slate-600">{displayName[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-700 dark:text-zinc-200">{displayName}</span>
                          <span className="text-xs text-gray-400 dark:text-zinc-500">{formatExactDate(c.date)}</span>
                        </div>
                        <div className="p-3 bg-white dark:bg-[#22272b] dark:border-slate-700 border rounded-lg text-sm text-gray-700 dark:text-zinc-200">
                          <TrelloMarkdown content={body} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action history */}
              {actions.length > 0 && (
                <div className="mt-4 space-y-1 border-t pt-4">
                  {actions.map(action => (
                    <div key={action.id} className="flex items-start gap-2 py-1.5 text-sm">
                      <Avatar className="h-6 w-6 flex-shrink-0">
                        <AvatarImage src={action.memberCreator?.avatarUrl ? `${action.memberCreator.avatarUrl}/30.png` : undefined} />
                        <AvatarFallback className="text-[10px] bg-gray-200 dark:bg-slate-600">{(action.memberCreator?.fullName || '?')[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <span className="text-gray-600 dark:text-zinc-400">{describeAction(action)}</span>
                        {action.data?.text && (
                          <p className="text-xs text-gray-400 dark:text-zinc-500 truncate mt-0.5">{action.data.text.substring(0, 100)}</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 dark:text-zinc-500 flex-shrink-0">{formatExactDate(action.date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* ── RIGHT: sidebar ── */}
          <div className="w-full lg:w-44 shrink-0 space-y-3">

            {permissions.canComment && (
              <div className="rounded-md border bg-white p-2.5 dark:border-slate-700 dark:bg-[#22272b]">
                <h4 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Reply tracking
                </h4>
                <p className="text-xs font-medium text-gray-700 dark:text-zinc-200 truncate">{participant?.name}</p>
                <p className="text-[10px] text-gray-500 dark:text-zinc-400 break-all">{participant?.email}</p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">Verified · checking every 30 seconds</p>
              </div>
            )}

            {permissions.canUpload && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Add Attachment</h4>
                <input type="file" id="att-upload" className="hidden" onChange={handleUploadAttachment} />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => document.getElementById('att-upload').click()}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Upload className="h-3 w-3 mr-1.5" />}
                  Upload File
                </Button>
              </div>
            )}

            {permissions.canSetDueDate && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Set Due Date</h4>
                <input
                  type="datetime-local"
                  value={newDueDate}
                  onChange={e => setNewDueDate(e.target.value)}
                  className="w-full text-xs text-slate-800 dark:text-slate-100 border dark:border-slate-600 rounded-md p-1.5 mb-1.5 bg-white dark:bg-[#22272b]"
                />
                <Button size="sm" className="w-full text-xs" onClick={handleUpdateDueDate} disabled={!newDueDate || isSubmitting}>
                  Update
                </Button>
              </div>
            )}

            <div className="border-t pt-3">
              <Button variant="ghost" size="sm" className="w-full text-xs text-gray-500 dark:text-zinc-400 justify-start" onClick={fetchCardData}>
                <RefreshCw className="h-3 w-3 mr-1.5" /> Refresh
              </Button>
              <p className="text-[10px] text-gray-400 dark:text-zinc-500 text-center mt-1">
                {format(lastRefreshed, 'h:mm a')}
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-zinc-500 mt-8">Shared via ShareT</p>
      </div>
    </div>
  );
};

export default SharedCardView;
