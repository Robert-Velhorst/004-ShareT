import { useState, useMemo } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Share, Copy, Eye, EyeOff, QrCode, CheckCircle2, ChevronDown, ChevronRight, Info } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { sharedLinks } from '../api';
import TrelloTargetPicker from './TrelloTargetPicker';

const NewShareForm = ({ shareType, setShareType, credits, onCreditsChanged, onCreateLink, trelloData, onShowQRCode }) => {
  const { toast: uiToast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [selectedList, setSelectedList] = useState(null);
  const [generatedUrls, setGeneratedUrls] = useState(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);

  const workspaces = useMemo(() => {
    if (!trelloData?.boards) return [];
    if (trelloData.organizations?.length) {
      const orgNames = trelloData.organizations.map(o => o.displayName || o.name);
      const hasPersonal = trelloData.boards.some(b => !b.organizationName || b.organizationName === 'Personal');
      return hasPersonal ? [...orgNames, 'Personal'] : orgNames;
    }
    const seen = new Set();
    trelloData.boards.forEach(b => seen.add(b.organizationName || 'Personal'));
    return [...seen];
  }, [trelloData]);

  const workspaceBoards = useMemo(() => {
    if (!trelloData?.boards) return [];
    return trelloData.boards
      .filter(b => !selectedWorkspace || (b.organizationName || 'Personal') === selectedWorkspace);
  }, [trelloData, selectedWorkspace]);
  const [cardUrl, setCardUrl] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [password, setPassword] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [guestTrelloToken, setGuestTrelloToken] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showGuestToken, setShowGuestToken] = useState(false);
  // Fix #9: Green checkmark indicator instead of obstructive popup
  const [showSuccess, setShowSuccess] = useState(false);

  // Create and persist share links through the server.
  const handleCreateShare = async () => {
    // Validate expiry date
    if (expiryDate && new Date(expiryDate) <= new Date()) {
      uiToast({
        title: "Invalid expiry date",
        description: "Please select a future date for expiry.",
        variant: "destructive",
      });
      return;
    }

    if (credits === null) {
      uiToast({
        title: 'Credits unavailable',
        description: 'ShareT could not verify your balance. Reload or try again before creating a link.',
        variant: 'destructive',
      });
      return;
    }

    if (shareType === 'list' && credits !== Infinity && (selectedList?.cards || []).length > credits) {
      uiToast({
        title: 'Not enough credits',
        description: `This list needs ${(selectedList?.cards || []).length} credits, but ${credits} are available.`,
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);

    try {
      if (shareType === "card") {
        // Determine card info from selection or URL
        let cardId, cardName, boardId, boardName;
        
        if (selectedCard) {
          cardId = selectedCard.id;
          cardName = selectedCard.name;
          boardId = selectedBoard?.id || '';
          boardName = selectedBoard?.displayLabel || selectedBoard?.name || '';
        } else if (cardUrl) {
          // Parse card ID from Trello URL
          const match = cardUrl.match(/\/c\/([a-zA-Z0-9]+)/);
          cardId = match ? match[1] : cardUrl;
          cardName = cardUrl;
        }

        if (!cardId) {
          uiToast({
            title: "No card selected",
            description: "Please select a card or enter a card URL.",
            variant: "destructive",
          });
          setIsCreating(false);
          return;
        }

        if (credits !== Infinity && credits <= 0) {
          uiToast({ title: 'No credits', description: 'Purchase more credits to create share links.', variant: 'destructive' });
          setIsCreating(false);
          return;
        }

        // Create share via backend API (Fix #2: persistent storage)
        const response = await sharedLinks.create({
          cardId,
          cardName: cardName || 'Shared Card',
          boardId: boardId || '',
          boardName: boardName || '',
          permissions: {
            canView: true,
            canComment: true,
            canUpload: true,
            canDownload: true,
            canSetDueDate: false
          },
          password: password || null,
          expiresAt: expiryDate || null,
          guestTrelloToken: guestTrelloToken || null
        });

        if (response.success && response.data) {
          const shareUrl = `${window.location.origin}/shared/${response.data.shareId}`;
          setGeneratedUrls({ cardUrl: shareUrl, shareId: response.data.shareId });
          if (response.duplicate) {
            // An active link to this card already existed; reuse it (no credit spent).
            uiToast({
              title: "Existing link reused",
              description: "An active share link for this card already exists, so we returned it instead of creating a duplicate. No credit was used.",
            });
          }
        }
      } else if (shareType === "list" && selectedList) {
        const cardUrls = [];
        for (const card of (selectedList.cards || [])) {
          const response = await sharedLinks.create({
            cardId: card.id,
            cardName: card.name,
            boardId: selectedBoard?.id || '',
            boardName: selectedBoard?.displayLabel || selectedBoard?.name || '',
            permissions: {
              canView: true,
              canComment: true,
              canUpload: true,
              canDownload: true,
              canSetDueDate: false
            },
            expiresAt: expiryDate || null,
            guestTrelloToken: guestTrelloToken || null
          });
          if (response.success && response.data) {
            cardUrls.push({
              name: card.name,
              url: `${window.location.origin}/shared/${response.data.shareId}`
            });
          }
        }
        setGeneratedUrls({ cardUrls });
      }

      // Update credits
      await onCreditsChanged?.();
      onCreateLink();

      // Fix #9: Show green checkmark instead of toast popup
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Error creating share:', error);
      uiToast({
        title: "Error creating share",
        description: error.message || "Failed to create share link.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="shareType">Share Type</Label>
            <Select
              value={shareType}
              onValueChange={(nextShareType) => {
                setShareType(nextShareType);
                setSelectedBoard(null);
                setSelectedCard(null);
                setSelectedList(null);
              }}
            >
              <SelectTrigger id="shareType" className="h-10">
                <SelectValue placeholder="Select what to share" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="card">Single Card</SelectItem>
                  <SelectItem value="list">List of Cards</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="workspaceSelect">Workspace</Label>
            <Select
              value={selectedWorkspace || '__all__'}
              onValueChange={(ws) => {
                setSelectedWorkspace(ws === '__all__' ? null : ws);
                setSelectedBoard(null);
                setSelectedCard(null);
                setSelectedList(null);
              }}
            >
              <SelectTrigger id="workspaceSelect" className="h-10">
                <SelectValue placeholder={trelloData ? 'All workspaces' : 'Connect Trello first'} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="__all__">All workspaces</SelectItem>
                  {workspaces.map(ws => (
                    <SelectItem key={ws} value={ws}>{ws}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        {trelloData ? (
          <TrelloTargetPicker
            boards={workspaceBoards}
            shareType={shareType}
            selectedBoard={selectedBoard}
            selectedCard={selectedCard}
            selectedList={selectedList}
            onSelect={({ board, list, card }) => {
              setSelectedBoard(board);
              setSelectedList(list);
              setSelectedCard(card);
            }}
          />
        ) : null}

        {!trelloData && shareType === 'card' && (
          <div>
            <Label htmlFor="cardUrl">Or paste card URL</Label>
            <Input
              id="cardUrl"
              placeholder="https://trello.com/c/..."
              value={cardUrl}
              onChange={(e) => setCardUrl(e.target.value)}
              className="h-10"
            />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="w-full sm:w-1/2">
          <Label htmlFor="secret">Secret</Label>
          <div className="flex items-center gap-2">
            <Input 
              id="secret" 
              type={showPassword ? "text" : "password"} 
              placeholder="Optional password" 
              className="h-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="w-full sm:w-1/2">
          <Label htmlFor="expiryDate">Expiry Date</Label>
          <Input 
            id="expiryDate" 
            type="date" 
            className="h-10" 
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </div>
      </div>
      
      {/* Advanced: native Trello author relay */}
      <div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-1"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Advanced options
        </button>
        {showAdvanced && (
          <div className="mt-2 p-3 border rounded-lg bg-muted/20 space-y-2">
            <div>
              <Label htmlFor="guestToken" className="text-xs flex items-center gap-1">
                Native Trello Author Token
                <span className="text-muted-foreground font-normal">(optional)</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Use an admin-managed relay account named for this freelancer, for example Kamal Uddin via ShareT, add it to the board, and paste its token. The freelancer never needs to sign in to Trello, while comments get a native Trello author row.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="guestToken"
                  type={showGuestToken ? 'text' : 'password'}
                  placeholder="Paste the admin-managed relay token"
                  className="h-9 text-sm font-mono"
                  value={guestTrelloToken}
                  onChange={e => setGuestTrelloToken(e.target.value)}
                />
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setShowGuestToken(!showGuestToken)}>
                  {showGuestToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Get the token: sign in to the admin-managed relay account at{' '}
                <a href="https://trello.com/app-key" target="_blank" rel="noopener noreferrer" className="underline">trello.com/app-key</a>,
                click <em>Token</em> and paste it here.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Fix #9: Create button with green checkmark confirmation */}
      <div className="flex items-center gap-3">
        <Button className="flex-1" onClick={handleCreateShare} disabled={isCreating}>
          {isCreating ? (
            <>Creating...</>
          ) : (
            <>
              <Share className="mr-2 h-4 w-4" /> Create Share Link
            </>
          )}
        </Button>
        {showSuccess && (
          <span className="flex items-center text-green-600 animate-in fade-in duration-300">
            <CheckCircle2 className="h-6 w-6" />
          </span>
        )}
      </div>

      {generatedUrls && (
        <div className="mt-4 space-y-2">
          <h3 className="font-semibold">Generated Share Links:</h3>
          {generatedUrls.cardUrl && (
            <div className="flex items-center justify-between">
              <span className="truncate">{generatedUrls.cardUrl}</span>
              <div className="flex space-x-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(generatedUrls.cardUrl)}>
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
                      <Button variant="outline" size="sm" onClick={() => onShowQRCode(generatedUrls.cardUrl)}>
                        <QrCode className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Show QR Code</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          )}
          {generatedUrls.cardUrls && generatedUrls.cardUrls.map((card, index) => (
            <div key={index} className="flex items-center justify-between">
              <span className="truncate">{card.name}: {card.url}</span>
              <div className="flex space-x-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(card.url)}>
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
                      <Button variant="outline" size="sm" onClick={() => onShowQRCode(card.url)}>
                        <QrCode className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Show QR Code</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NewShareForm;
