
import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TrelloConnect from '../components/TrelloConnect';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LogOut, BookOpen } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useCredits } from '../hooks/useCredits';
import { QRCodeCanvas } from 'qrcode.react';
import { toPng } from 'html-to-image';
import NewShareForm from '../components/NewShareForm';
import PreviousLinks from '../components/PreviousLinks';
import UserProfile from '../components/UserProfile';
import AdminTab from '../components/AdminTab';
import { useAuth } from '../contexts/AuthContext';
import ApiDocumentation from '../components/ApiDocumentation';
import { PaymentDialog } from '../components/PaymentDialog';
import { ThemeToggle } from '../components/ThemeToggle';
import { NotificationCenter } from '../components/NotificationCenter';
import { trello } from '../api';

const ADMIN_EMAIL = 'noodzakelijkonline@gmail.com';

const App = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.email === ADMIN_EMAIL;
  const { credits, creditType, refetch: refetchCredits } = useCredits();
  const [shareType, setShareType] = useState("card");
  const [trelloData, setTrelloData] = useState(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [currentShareLink, setCurrentShareLink] = useState('');
  const [showApiDocs, setShowApiDocs] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const { toast } = useToast();
  const qrRef = useRef(null);

  const handleCreateLink = () => {};

  const handleShowQRCode = (link) => {
    setCurrentShareLink(link);
    setShowQRCode(true);
  };

  const handleDownloadQR = () => {
    if (!qrRef.current) return;
    toPng(qrRef.current, { cacheBust: true })
      .then(dataUrl => {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'sharet-qr.png';
        a.click();
      })
      .catch(err => console.error('QR download failed:', err));
  };

  const handleCopyQRLink = () => {
    navigator.clipboard.writeText(currentShareLink);
    toast({ title: 'Link copied', description: 'Share link copied to clipboard.' });
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await trello.disconnect();
      setTrelloData(null);
      toast({
        title: "Disconnected from Trello",
        description: "The Trello connection has been removed from ShareT.",
      });
    } catch (error) {
      toast({
        title: "Disconnect failed",
        description: error.message || "ShareT could not disconnect Trello.",
        variant: "destructive",
      });
    } finally {
      setIsDisconnecting(false);
    }
  };
  return (
    <div className="bg-background text-foreground min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <UserProfile />
        
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>External Share</CardTitle>
              <div className="flex items-center space-x-2">
                <NotificationCenter />
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowApiDocs(true)}
                  className="flex items-center"
                >
                  <BookOpen className="mr-2 h-4 w-4" />
                  API Docs
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                  Back to Home
                </Button>
                <ThemeToggle />
              </div>
            </div>
            <div className="flex justify-between items-center mt-2">
              {!trelloData ? (
                <TrelloConnect onConnect={setTrelloData} />
              ) : (
                <div className="flex items-center space-x-2">
                  <span>Connected as {trelloData.member?.fullName}</span>
                  <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={isDisconnecting}>
                    <LogOut className="mr-2 h-4 w-4" />
                    {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <span className="text-sm text-muted-foreground">{creditType === 'resource' ? 'Pay for measured resource usage' : credits === Infinity ? 'Unlimited share allowance' : `${credits} shares remaining in your existing allowance`}</span>
              <PaymentDialog />
            </div>
            {trelloData ? (
              <Tabs defaultValue="newShare">
                <div className="flex items-center justify-between mb-2">
                  <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <TabsTrigger value="newShare">New Share</TabsTrigger>
                    <TabsTrigger value="previousLinks">Previous Links</TabsTrigger>
                    {isAdmin && <TabsTrigger value="admin">⚙ Admin</TabsTrigger>}
                  </TabsList>
                </div>
                <TabsContent value="newShare">
                  <NewShareForm
                    shareType={shareType}
                    setShareType={setShareType}
                    credits={credits}
                    onCreditsChanged={refetchCredits}
                    onCreateLink={handleCreateLink}
                    trelloData={trelloData}
                    onShowQRCode={handleShowQRCode}
                  />
                </TabsContent>
                <TabsContent value="previousLinks">
                  <PreviousLinks onShowQRCode={handleShowQRCode} />
                </TabsContent>
                {isAdmin && (
                  <TabsContent value="admin">
                    <AdminTab />
                  </TabsContent>
                )}
              </Tabs>
            ) : (
              <p className="text-center py-4">Connect to Trello to start creating share links.</p>
            )}
          </CardContent>
        </Card>
      </div>
      
      {showQRCode && (
        <Dialog open={showQRCode} onOpenChange={setShowQRCode}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>QR Code for Share Link</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3">
              <div ref={qrRef} className="inline-block p-3 bg-white rounded-lg border">
                <QRCodeCanvas value={currentShareLink} size={240} />
              </div>
              <p className="text-xs text-muted-foreground text-center break-all max-w-xs">{currentShareLink}</p>
            </div>
            <DialogFooter className="flex gap-2 sm:justify-between">
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCopyQRLink}>Copy Link</Button>
                <Button variant="outline" onClick={handleDownloadQR}>Download PNG</Button>
              </div>
              <Button onClick={() => setShowQRCode(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      
      {showApiDocs && (
        <Dialog open={showApiDocs} onOpenChange={setShowApiDocs} className="max-w-4xl">
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>API Documentation</DialogTitle>
            </DialogHeader>
            <ApiDocumentation />
            <DialogFooter>
              <Button onClick={() => setShowApiDocs(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default App;
