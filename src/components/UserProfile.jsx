
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from '../contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { auth as authAPI } from '../api';
import HAIConnectorSettings from './HAIConnectorSettings';

const formatAccountDate = (value) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleDateString();
};

const UserProfile = () => {
  const { currentUser, signOut, updateProfile } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [fullName, setFullName] = useState(currentUser?.fullName || currentUser?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const displayName = currentUser?.fullName || currentUser?.name || currentUser?.email || 'ShareT user';
  
  // Get initials for avatar
  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const handleDialogChange = (open) => {
    setIsDialogOpen(open);
    if (open) setFullName(displayName);
  };

  const handleUpdateProfile = async () => {
    const trimmedName = fullName.trim();
    if (!trimmedName) return;

    setIsSaving(true);
    try {
      await updateProfile({ name: trimmedName });
      setIsDialogOpen(false);
    } catch {
      // AuthContext presents the API error consistently.
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const { blob } = await authAPI.exportAccount();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sharet-account-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Account export downloaded');
    } catch (error) {
      toast.error(error.message || 'Unable to export account data');
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await authAPI.deleteAccount(deletePassword);
      setIsDeleteOpen(false);
      setDeletePassword('');
      await signOut();
    } catch (error) {
      toast.error(error.message || 'Unable to delete account');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-4">
          <Avatar className="size-12">
            <AvatarImage src={currentUser?.avatarUrl} alt={displayName} />
            <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle>{displayName}</CardTitle>
            <CardDescription>{currentUser?.email}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">
          <p>Account created: {formatAccountDate(currentUser?.createdAt)}</p>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap justify-between gap-3">
        <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button variant="outline">Edit Profile</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Profile</DialogTitle>
              <DialogDescription>Make changes to your profile here.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Full Name</Label>
                <Input 
                  id="name" 
                  value={fullName} 
                  onChange={(e) => setFullName(e.target.value)} 
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={currentUser?.email} disabled />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleUpdateProfile}
                disabled={isSaving || !fullName.trim()}
              >
                {isSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="flex flex-wrap gap-2">
          <HAIConnectorSettings />
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 size-4" /> Export data
          </Button>
          <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-destructive">
                <Trash2 className="mr-2 size-4" /> Delete account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete your ShareT account?</DialogTitle>
                <DialogDescription>
                  This permanently deletes your account, links, access records, and connected-service data. Export first if you need a copy.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="delete-password">Confirm with your password</Label>
                <Input
                  id="delete-password"
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  disabled={!deletePassword || isDeleting}
                  onClick={handleDeleteAccount}
                >
                  {isDeleting ? 'Deleting…' : 'Delete permanently'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="destructive" onClick={signOut}>Sign Out</Button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default UserProfile;
