import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, BellRing } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const TrelloConnect = ({ onConnect }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [trelloConnections, setTrelloConnections] = useState([]);
  // Per-comment notification warnings only reach the freelancer who commented,
  // so the owner needs their own view of whether the bell actually works.
  const [notifyHealth, setNotifyHealth] = useState(null);
  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;

  const loadNotificationHealth = async () => {
    try {
      const res = await axios.get(`${API_URL}/trello/notification-health`, {
        withCredentials: true,
      });
      setNotifyHealth(res.data?.health || null);
    } catch {
      setNotifyHealth(null);
    }
  };

  const fetchBoards = async () => {
    try {
      const res = await axios.get(`${API_URL}/trello/boards`, {
        withCredentials: true,
      });
      return { boards: res.data?.boards || [], organizations: res.data?.organizations || [] };
    } catch {
      return { boards: [], organizations: [] };
    }
  };

  const loadConnections = async () => {
    try {
      const response = await axios.get(`${API_URL}/trello/connections`, {
        withCredentials: true,
      });
      const connections = response.data?.connections || [];
      setTrelloConnections(connections);
      if (connections.length > 0) {
        const { boards, organizations } = await fetchBoards();
        onConnectRef.current({ ...connections[0], boards, organizations });
        loadNotificationHealth();
      }
    } catch (err) {
      console.error("Trello connections fetch error:", err?.response?.status, err?.message);
    }
  };

  // Load existing connection on mount
  useEffect(() => {
    loadConnections();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const response = await axios.get(`${API_URL}/trello/auth-url`, {
        withCredentials: true,
        params: { origin: window.location.origin },
      });

      if (!response.data?.authUrl) {
        throw new Error("Failed to start Trello authentication");
      }

      const popup = window.open(
        response.data.authUrl,
        "TrelloAuth",
        "width=600,height=700,left=200,top=100"
      );

      // Listen for success message from our callback HTML page
      const messageHandler = async (event) => {
        if (event.origin !== window.location.origin) return;
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg?.type !== "trello-connected") return;

        window.removeEventListener("message", messageHandler);
        if (popup && !popup.closed) popup.close();

        if (msg.member) {
          onConnectRef.current({ member: msg.member, boards: [], organizations: [] });
          const { boards, organizations } = await fetchBoards();
          onConnectRef.current({ member: msg.member, boards, organizations });
        }
        toast.success("Trello connected successfully!");
        setIsConnecting(false);
      };

      window.addEventListener("message", messageHandler);

      // Fallback: if popup closed without postMessage, poll backend
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          window.removeEventListener("message", messageHandler);
          loadConnections();
          setIsConnecting(false);
        }
      }, 500);
    } catch (err) {
      toast.error("Failed to connect to Trello");
      setError(err.message);
      setIsConnecting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button onClick={handleConnect} disabled={isConnecting}>
        {isConnecting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Connecting...
          </>
        ) : (
          "Connect to Trello"
        )}
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {notifyHealth && !notifyHealth.ok && (
        <div className="flex gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <div className="space-y-1">
            <p className="font-medium text-amber-700 dark:text-amber-500">
              Your Trello notification bell will not ring for ShareT comments
            </p>
            {notifyHealth.problems?.map((problem, i) => (
              <p key={i} className="text-muted-foreground">{problem}</p>
            ))}
          </div>
        </div>
      )}

      {notifyHealth?.ok && (
        <div className="flex gap-2 rounded-md border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm">
          <BellRing className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
          <p className="text-muted-foreground">
            Comments from share links are posted by{' '}
            <span className="font-medium text-foreground">
              {notifyHealth.relayAccount?.fullName || notifyHealth.relayAccount?.username}
            </span>
            , so they trigger your Trello notification bell.
          </p>
        </div>
      )}

      {trelloConnections.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">Connected Trello Accounts</h3>
          {trelloConnections.map((connection) => (
            <div
              key={connection.id}
              className="flex justify-between items-center border p-3 rounded-md"
            >
              <div>
                <p className="font-medium">
                  {connection.trelloFullName || connection.trelloUsername}
                </p>
                <p className="text-sm text-muted-foreground">
                  @{connection.trelloUsername}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const { boards, organizations } = await fetchBoards();
                  onConnect({ ...connection, boards, organizations });
                }}
              >
                Select
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TrelloConnect;
