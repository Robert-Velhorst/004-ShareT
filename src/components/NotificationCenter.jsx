import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Bell, Check, CheckCheck, Trash2, MessageSquare } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { notifications as notificationsAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';

function formatTimeAgo(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export const NotificationCenter = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const prevUnreadRef = useRef(0);
  const isInitialLoad = useRef(true);

  const fetchNotifications = useCallback(async (isBackground = false) => {
    if (!currentUser) return;
    try {
      if (!isBackground) setIsLoading(true);
      const res = await notificationsAPI.getAll(30);
      if (res && res.success) {
        const fetched = res.notifications || [];
        const unread = res.unreadCount || 0;

        // Show a live toast notification if a new comment arrives while logged in
        if (!isInitialLoad.current && unread > prevUnreadRef.current) {
          const newest = fetched[0];
          if (newest && !newest.isRead) {
            toast.info(newest.title, {
              description: newest.message ? `"${newest.message.slice(0, 80)}..."` : undefined,
              action: {
                label: 'View',
                onClick: () => {
                  if (newest.linkUrl) {
                    notificationsAPI.markAsRead(newest._id).catch(() => {});
                    navigate(newest.linkUrl);
                  }
                }
              }
            });
          }
        }

        isInitialLoad.current = false;
        prevUnreadRef.current = unread;
        setItems(fetched);
        setUnreadCount(unread);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      if (!isBackground) setIsLoading(false);
    }
  }, [currentUser, navigate]);

  // Initial fetch and periodic polling (every 20s)
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => {
      fetchNotifications(true);
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await notificationsAPI.markAsRead(id);
      setItems(prev => prev.map(item => item._id === id ? { ...item, isRead: true } : item));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationsAPI.markAllAsRead();
      setItems(prev => prev.map(item => ({ ...item, isRead: true })));
      setUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch (err) {
      console.error('Error marking all as read:', err);
      toast.error('Failed to mark all as read');
    }
  };

  const handleDelete = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await notificationsAPI.delete(id);
      setItems(prev => prev.filter(item => item._id !== id));
      setUnreadCount(prev => {
        const item = items.find(i => i._id === id);
        return item && !item.isRead ? Math.max(0, prev - 1) : prev;
      });
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const handleItemClick = (item) => {
    if (!item.isRead) {
      handleMarkAsRead(item._id);
    }
    setIsOpen(false);
    if (item.linkUrl) {
      navigate(item.linkUrl);
    }
  };

  if (!currentUser) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative flex items-center gap-1.5 px-3"
          aria-label="Open notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center animate-in zoom-in"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 sm:w-96 p-0 shadow-lg border">
        <div className="flex items-center justify-between p-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-sm">Notifications</h4>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="h-[340px]">
          {isLoading && items.length === 0 ? (
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
              Loading notifications...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground gap-2">
              <MessageSquare className="h-8 w-8 stroke-1 text-muted-foreground/50" />
              <p className="text-sm font-medium">No notifications yet</p>
              <p className="text-xs text-muted-foreground/80 max-w-[200px]">
                You will be notified here whenever a freelancer comments on your shared cards.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {items.map((item) => {
                const initials = (item.authorName || 'F')
                  .split(' ')
                  .map(w => w[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2) || 'F';

                return (
                  <div
                    key={item._id}
                    onClick={() => handleItemClick(item)}
                    className={`group relative flex items-start gap-3 p-3 text-left transition-colors cursor-pointer hover:bg-muted/50 ${
                      !item.isRead ? 'bg-primary/5' : ''
                    }`}
                  >
                    <Avatar className="h-8 w-8 shrink-0 mt-0.5 border">
                      <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                        {initials}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {item.authorName || 'Freelancer'}
                        </p>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {formatTimeAgo(item.createdAt)}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        commented on <span className="font-medium text-foreground">{item.cardTitle || 'Shared Card'}</span>
                      </p>

                      {item.message && (
                        <p className="text-xs text-foreground/80 line-clamp-2 bg-muted/40 p-1.5 rounded border border-border/40 font-normal italic">
                          "{item.message}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!item.isRead && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title="Mark as read"
                          onClick={(e) => handleMarkAsRead(item._id, e)}
                        >
                          <Check className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        title="Delete notification"
                        onClick={(e) => handleDelete(item._id, e)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>

                    {!item.isRead && (
                      <span className="absolute left-1.5 top-4 h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationCenter;
