import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from 'react-router';
import { sharedAccess } from '../api';
import {
  clearShareParticipant,
  clearSharePasswordGrant,
  readShareParticipant,
  readSharePasswordGrant,
  writeShareParticipant,
  writeSharePasswordGrant,
} from '../lib/shareParticipant';

const SharedLinkAccess = ({ linkToken }) => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [linkInfo, setLinkInfo] = useState(null);
  const [storedParticipant] = useState(() => readShareParticipant(linkToken));
  const [name, setName] = useState(() => storedParticipant?.participant?.name || '');
  const [email, setEmail] = useState(() => storedParticipant?.participant?.email || '');
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [error, setError] = useState(null);
  const [verificationError, setVerificationError] = useState('');
  const [identityVerified, setIdentityVerified] = useState(false);
  const [secretInput, setSecretInput] = useState('');
  const [secretError, setSecretError] = useState('');
  const [checkingSecret, setCheckingSecret] = useState(false);
  const [passwordToken, setPasswordToken] = useState(() => readSharePasswordGrant(linkToken));
  const secretPassed = Boolean(passwordToken);
  
  const cardUrl = `/shared/${linkToken}/card`;

  const fetchLinkInfo = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const savedParticipant = readShareParticipant(linkToken);
      const response = await sharedAccess.getCard(linkToken, {
        participantToken: savedParticipant?.participantToken || '',
        passwordToken,
      });
      if (response.linkInfo) {
        const info = response.linkInfo;
        setLinkInfo(info);
        if (response.accessRequired === 'PASSWORD_REQUIRED' && passwordToken) {
          clearSharePasswordGrant(linkToken);
          setPasswordToken('');
          return;
        }
        const identityRequired = info.requiresParticipantIdentity || info.requiresEmail;
        let hasVerifiedIdentity = !identityRequired;

        if (identityRequired && savedParticipant?.participantToken) {
          try {
            const status = await sharedAccess.getParticipantStatus(linkToken, savedParticipant.participantToken);
            writeShareParticipant(linkToken, savedParticipant.participantToken, status.participant);
            setName(status.participant.name);
            setEmail(status.participant.email);
            setIdentityVerified(true);
            hasVerifiedIdentity = true;
          } catch {
            clearShareParticipant(linkToken);
          }
        }

        if (response.accessGranted && hasVerifiedIdentity && (!info.requiresPassword || secretPassed)) {
          navigate(cardUrl, { replace: true });
        }
      } else {
        throw new Error('Invalid link or link information not found');
      }
    } catch (error) {
      console.error('Error fetching link info:', error);
      setError(error.message || 'Failed to load link information');
    } finally {
      setIsLoading(false);
    }
  }, [cardUrl, linkToken, navigate, passwordToken, secretPassed]);

  useEffect(() => {
    fetchLinkInfo();
  }, [fetchLinkInfo]);
  
  const handleSendVerification = async () => {
    setIsVerifying(true);
    setVerificationError('');
    
    try {
      const response = await sharedAccess.requestVerification(linkToken, { name, email });
      
      if (response.success) {
        setVerificationSent(true);
        toast.success("Verification code sent to your email");
        
        // For development, if code is returned directly
        if (response.code) {
          setVerificationCode(response.code);
        }
      } else {
        throw new Error(response.error || 'Failed to send verification code');
      }
    } catch (error) {
      console.error('Error sending verification:', error);
      setVerificationError(error.message || 'Failed to send verification code');
    } finally {
      setIsVerifying(false);
    }
  };
  
  const handleVerifyCode = async () => {
    setIsVerifying(true);
    setVerificationError('');
    
    try {
      const response = await sharedAccess.confirmVerification(linkToken, {
        name,
        email,
        code: verificationCode
      });
      
      if (response.success) {
        writeShareParticipant(linkToken, response.participantToken, response.participant);
        setIdentityVerified(true);
        setAccessGranted(true);
        toast.success("Email verified — reply notifications are active");
        
        // Redirect to card view
        setTimeout(() => {
          navigate(cardUrl, { replace: true });
        }, 1000);
      } else {
        throw new Error(response.error || 'Invalid verification code');
      }
    } catch (error) {
      console.error('Error verifying code:', error);
      setVerificationError(error.message || 'Failed to verify code');
    } finally {
      setIsVerifying(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (error) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Access Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>{error}</p>
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
            Try Again
          </Button>
        </CardFooter>
      </Card>
    );
  }
  
  const handleVerifySecret = async () => {
    setCheckingSecret(true);
    setSecretError('');
    try {
      const response = await sharedAccess.verifyPassword(linkToken, secretInput);
      if (response.success) {
        writeSharePasswordGrant(linkToken, response.passwordToken);
        setPasswordToken(response.passwordToken || '');
        if ((!linkInfo.requiresParticipantIdentity && !linkInfo.requiresEmail) || identityVerified) {
          navigate(cardUrl, { replace: true });
        }
      }
    } catch (err) {
      setSecretError(err.message || 'Incorrect secret, please try again.');
    } finally {
      setCheckingSecret(false);
    }
  };

  if (!linkInfo) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Link Not Found
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>The shared link you’re trying to access doesn’t exist or has been revoked.</p>
        </CardContent>
      </Card>
    );
  }
  
  // Password gate — shown before email gate
  if (linkInfo?.requiresPassword && !secretPassed) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Enter Secret</CardTitle>
          <CardDescription>
            This link is protected. Please enter the secret to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={event => {
              event.preventDefault();
              handleVerifySecret();
            }}
          >
          <div>
            <Label htmlFor="secret">Secret</Label>
            <Input
              id="secret"
              name="secret"
              type="password"
              value={secretInput}
              onChange={e => { setSecretInput(e.target.value); setSecretError(''); }}
              placeholder="Enter secret…"
              className="mt-1"
              disabled={checkingSecret}
              autoComplete="off"
              autoFocus
            />
            {secretError && <p className="text-sm text-destructive mt-1">{secretError}</p>}
          </div>
          <Button type="submit" disabled={!secretInput || checkingSecret} className="w-full">
            {checkingSecret ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking…</> : 'Continue'}
          </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Join this ShareT conversation</CardTitle>
        <CardDescription>
          Verify your email once to comment on {linkInfo.trelloCardName}
          {linkInfo.emailNotificationsAvailable ? ' and receive replies.' : '.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!verificationSent ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter your name"
                className="mt-1"
                maxLength={80}
                disabled={isVerifying}
                autoComplete="name"
              />
            </div>
            <div>
              <Label htmlFor="email">Email Address</Label>
              <div className="flex mt-1">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="flex-1"
                  disabled={isVerifying}
                  autoComplete="email"
                />
              </div>
              {linkInfo.emailNotificationsAvailable ? (
                <p className="text-xs text-muted-foreground mt-1">
                  ShareT emails you when the card owner replies after your comment.
                </p>
              ) : (
                <p className="text-xs text-amber-600 mt-1">
                  Reply emails are unavailable until the ShareT operator configures email delivery.
                </p>
              )}
              {linkInfo.requiresEmail && (
                <p className="text-xs text-muted-foreground mt-1">
                  This link is restricted to specific email addresses
                </p>
              )}
            </div>
            
            <Button 
              onClick={handleSendVerification} 
              disabled={!name.trim() || !email.trim() || isVerifying || !linkInfo.verificationAvailable}
              className="w-full"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send Verification Code
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="code">Verification Code</Label>
              <div className="flex mt-1">
                <Input
                  id="code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="Enter verification code"
                  className="flex-1"
                  disabled={isVerifying || accessGranted}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Enter the 6-digit code sent to {email}
              </p>
            </div>
            
            <Button 
              onClick={handleVerifyCode} 
              disabled={!verificationCode || isVerifying || accessGranted}
              className="w-full"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : accessGranted ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Access Granted
                </>
              ) : (
                "Verify Code"
              )}
            </Button>
            
            {!accessGranted && (
              <Button 
                variant="link" 
                onClick={() => setVerificationSent(false)}
                className="w-full"
                disabled={isVerifying}
              >
                Use a different email
              </Button>
            )}
          </div>
        )}
        {verificationError && (
          <p className="text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            {verificationError}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-col space-y-2">
        <div className="text-xs text-muted-foreground">
          {linkInfo.permissionLevel === 'edit' ? (
            <span>You’ll have edit access to this card</span>
          ) : (
            <span>Your verified email keeps this conversation connected</span>
          )}
        </div>
        {linkInfo.expiresAt && (
          <div className="text-xs text-muted-foreground">
            This link expires on {new Date(linkInfo.expiresAt).toLocaleDateString()}
          </div>
        )}
      </CardFooter>
    </Card>
  );
};

export default SharedLinkAccess;
