import { useCallback, useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Copy, Trash2, QrCode, Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import { sharedLinks } from '../api';

const LINKS_PER_PAGE = 25;

const PreviousLinks = ({ onShowQRCode }) => {
  const { toast } = useToast();
  const [links, setLinks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [loadError, setLoadError] = useState('');

  // Fix #2: Fetch links from backend API (persistent, survives logout/restart)
  const fetchLinks = useCallback(async (page) => {
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await sharedLinks.getAll({ page, limit: LINKS_PER_PAGE });
      if (response.success && response.data) {
        setLinks(response.data);
        setPagination({
          total: response.pagination?.total ?? response.data.length,
          pages: Math.max(1, response.pagination?.pages ?? 1),
        });
      }
    } catch (error) {
      console.error('Error fetching links:', error);
      setLinks([]);
      setPagination({ total: 0, pages: 1 });
      setLoadError(error.message || 'ShareT could not load your stored links.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLinks(currentPage);
  }, [currentPage, fetchLinks]);

  const handleCopyLink = (shareId) => {
    const url = `${window.location.origin}/shared/${shareId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied",
      description: "The share link has been copied to your clipboard.",
    });
  };

  const handleDeleteLink = async (id) => {
    try {
      await sharedLinks.delete(id);
      const targetPage = links.length === 1 && currentPage > 1
        ? currentPage - 1
        : currentPage;

      if (targetPage !== currentPage) {
        setCurrentPage(targetPage);
      } else {
        await fetchLinks(targetPage);
      }
      toast({
        title: "Link deleted",
        description: "The share link has been deleted.",
      });
    } catch (error) {
      console.error('Error deleting link:', error);
      toast({
        title: "Error",
        description: "Failed to delete the link.",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (id, currentActive) => {
    try {
      await sharedLinks.update(id, { isActive: !currentActive });
      fetchLinks(currentPage); // Refresh
    } catch (error) {
      console.error('Error toggling link:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <p className="font-medium">Previous links could not be loaded</p>
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button type="button" variant="outline" onClick={() => fetchLinks(currentPage)}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pagination.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <p>
            Showing {(currentPage - 1) * LINKS_PER_PAGE + 1}–{Math.min(currentPage * LINKS_PER_PAGE, pagination.total)} of {pagination.total} links
          </p>
          {pagination.pages > 1 && (
            <p>Page {currentPage} of {pagination.pages}</p>
          )}
        </div>
      )}
      {links.length > 0 ? (
        links.map((link) => (
          <div key={link._id || link.shareId} className="flex justify-between items-center p-3 bg-secondary rounded-md">
            <div className="min-w-0 flex-1">
              <a
                href={`${window.location.origin}/shared/${link.shareId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold truncate hover:underline text-blue-600 hover:text-blue-800 block"
              >
                {link.cardName || 'Unnamed Card'}
              </a>
              <p className="text-sm text-muted-foreground">
                {link.boardName && `${link.boardName} • `}
                {link.isActive ? '🟢 Active' : '🔴 Inactive'}
                {link.expiresAt && ` • Expires: ${new Date(link.expiresAt).toLocaleDateString()}`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Views: {link.accessCount || 0}
                {link.createdAt && ` • Created: ${new Date(link.createdAt).toLocaleDateString()}`}
              </p>
            </div>
            <div className="flex space-x-1 ml-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => handleToggleActive(link._id, link.isActive)}>
                      {link.isActive ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{link.isActive ? 'Deactivate' : 'Activate'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => handleCopyLink(link.shareId)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Copy link</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => onShowQRCode(`${window.location.origin}/shared/${link.shareId}`)}>
                      <QrCode className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Show QR Code</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Dialog>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Delete link</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Are you sure you want to delete this share link?</DialogTitle>
                    <DialogDescription>
                      This action cannot be undone. The link will no longer be accessible.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="destructive" onClick={() => handleDeleteLink(link._id)}>Yes, delete it</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        ))
      ) : (
        <p className="text-muted-foreground">You have no previous share links.</p>
      )}
      {pagination.pages > 1 && (
        <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Previous links pages">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1 || isLoading}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {pagination.pages}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={() => setCurrentPage((page) => Math.min(pagination.pages, page + 1))}
            disabled={currentPage === pagination.pages || isLoading}
          >
            Next
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </nav>
      )}
    </div>
  );
};

export default PreviousLinks;
