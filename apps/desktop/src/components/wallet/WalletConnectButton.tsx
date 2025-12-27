/**
 * WalletConnectButton - Cartridge Controller wallet connection
 *
 * Handles wallet connection state and provides UI for:
 * - Connecting to Cartridge Controller (Starknet)
 * - Displaying connected address
 * - Disconnecting wallet
 */

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import {
  ensureMembraneRunning,
  connectController,
  getControllerSession,
  disconnectController,
  getDefaultPolicies,
  type ControllerSession,
  type SessionPolicies,
} from "@/services/membraneService";

interface WalletConnectButtonProps {
  worldAddress?: string;
  onConnect?: (address: string, sessionId: string) => void;
  onDisconnect?: () => void;
  className?: string;
}

type ConnectionState = "disconnected" | "connecting" | "pending" | "connected" | "error";

export function WalletConnectButton({
  worldAddress,
  onConnect,
  onDisconnect,
  className = "",
}: WalletConnectButtonProps) {
  const [state, setState] = useState<ConnectionState>("disconnected");
  const [session, setSession] = useState<ControllerSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Restore session from localStorage on mount
  useEffect(() => {
    const savedSessionId = localStorage.getItem("fab_controller_session_id");
    const savedAddress = localStorage.getItem("fab_controller_address");

    if (savedSessionId && savedAddress) {
      // Validate the session
      getControllerSession(savedSessionId)
        .then((sessionData) => {
          if (sessionData.valid) {
            setSession(sessionData);
            setState("connected");
          } else {
            // Session expired
            localStorage.removeItem("fab_controller_session_id");
            localStorage.removeItem("fab_controller_address");
          }
        })
        .catch(() => {
          localStorage.removeItem("fab_controller_session_id");
          localStorage.removeItem("fab_controller_address");
        });
    }
  }, []);

  const handleConnect = useCallback(async () => {
    setState("connecting");
    setError(null);

    try {
      // Ensure membrane service is running
      await ensureMembraneRunning();

      // Get default policies
      const policies: SessionPolicies = worldAddress
        ? await getDefaultPolicies(worldAddress)
        : { contracts: {} };

      // Initiate connection
      const result = await connectController({
        policies,
        redirectUrl: "http://localhost:8765/controller/callback",
        chainId: "SN_SEPOLIA",
      });

      setState("pending");

      // Open keychain in browser
      window.open(result.keychainUrl, "_blank");

      // Poll for session (the callback will create it)
      const pollInterval = setInterval(async () => {
        try {
          // Check if we have a session now by looking at localStorage
          // (The callback will redirect and set these)
          const sessionId = localStorage.getItem("fab_controller_session_id");
          const address = localStorage.getItem("fab_controller_address");

          if (sessionId && address) {
            clearInterval(pollInterval);
            const sessionData = await getControllerSession(sessionId);
            setSession(sessionData);
            setState("connected");
            onConnect?.(address, sessionId);
          }
        } catch {
          // Continue polling
        }
      }, 2000);

      // Timeout after 5 minutes
      setTimeout(
        () => {
          clearInterval(pollInterval);
          if (state === "pending") {
            setState("disconnected");
            setError("Connection timeout");
          }
        },
        5 * 60 * 1000
      );
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  }, [worldAddress, onConnect, state]);

  const handleDisconnect = useCallback(async () => {
    if (session?.sessionId) {
      try {
        await disconnectController(session.sessionId);
      } catch {
        // Ignore errors on disconnect
      }
    }

    localStorage.removeItem("fab_controller_session_id");
    localStorage.removeItem("fab_controller_address");
    setSession(null);
    setState("disconnected");
    onDisconnect?.();
  }, [session, onDisconnect]);

  // Format address for display (0x1234...5678)
  const formatAddress = (addr: string) => {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (state === "connected" && session) {
    return (
      <div className={`wallet-connect-container ${className}`}>
        <div className="wallet-connected">
          <div className="wallet-address">
            <span className="wallet-dot" />
            <span className="wallet-addr-text">{formatAddress(session.address)}</span>
          </div>
          <button
            className="wallet-disconnect-btn"
            onClick={handleDisconnect}
            title="Disconnect wallet"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16,17 21,12 16,7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
        <style>{`
          .wallet-connect-container {
            display: flex;
            align-items: center;
          }
          .wallet-connected {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-2) var(--space-3);
            background: var(--obsidian);
            border: 1px solid var(--signal-success);
            border-radius: var(--radius-md);
            font-family: var(--font-mono);
            font-size: var(--text-sm);
          }
          .wallet-address {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            color: var(--text-primary);
          }
          .wallet-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--signal-success);
            box-shadow: 0 0 8px var(--signal-success);
            animation: wallet-pulse 2s ease-in-out infinite;
          }
          .wallet-addr-text {
            letter-spacing: 0.02em;
          }
          .wallet-disconnect-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: var(--space-1);
            background: transparent;
            border: none;
            border-radius: var(--radius-sm);
            color: var(--text-secondary);
            cursor: pointer;
            transition: color var(--transition-fast), background var(--transition-fast);
          }
          .wallet-disconnect-btn:hover {
            color: var(--signal-error);
            background: oklch(65% 0.22 25 / 0.15);
          }
          @keyframes wallet-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  if (state === "pending") {
    return (
      <div className={`wallet-connect-container ${className}`}>
        <div className="wallet-pending">
          <div className="wallet-spinner" />
          <span>Awaiting approval...</span>
          <button
            className="wallet-cancel-btn"
            onClick={() => setState("disconnected")}
            title="Cancel"
          >
            Cancel
          </button>
        </div>
        <style>{`
          .wallet-connect-container {
            display: flex;
            align-items: center;
          }
          .wallet-pending {
            display: flex;
            align-items: center;
            gap: var(--space-3);
            padding: var(--space-2) var(--space-3);
            background: var(--obsidian);
            border: 1px solid var(--signal-active);
            border-radius: var(--radius-md);
            font-size: var(--text-sm);
            color: var(--text-secondary);
          }
          .wallet-spinner {
            width: 14px;
            height: 14px;
            border: 2px solid transparent;
            border-top-color: var(--signal-active);
            border-radius: 50%;
            animation: wallet-spin 0.8s linear infinite;
          }
          .wallet-cancel-btn {
            padding: var(--space-1) var(--space-2);
            background: transparent;
            border: 1px solid var(--text-tertiary);
            border-radius: var(--radius-sm);
            color: var(--text-tertiary);
            font-size: var(--text-xs);
            cursor: pointer;
            transition: all var(--transition-fast);
          }
          .wallet-cancel-btn:hover {
            border-color: var(--signal-error);
            color: var(--signal-error);
          }
          @keyframes wallet-spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`wallet-connect-container ${className}`}>
      <Button variant="primary" onClick={handleConnect} disabled={state === "connecting"}>
        {state === "connecting" ? (
          <>
            <span className="wallet-btn-spinner" />
            Connecting...
          </>
        ) : (
          <>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ marginRight: 6 }}
            >
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            Connect Wallet
          </>
        )}
      </Button>
      {error && <span className="wallet-error">{error}</span>}
      <style>{`
        .wallet-connect-container {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .wallet-btn-spinner {
          display: inline-block;
          width: 12px;
          height: 12px;
          margin-right: 6px;
          border: 2px solid transparent;
          border-top-color: currentColor;
          border-radius: 50%;
          animation: wallet-spin 0.8s linear infinite;
        }
        .wallet-error {
          font-size: var(--text-xs);
          color: var(--signal-error);
        }
        @keyframes wallet-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default WalletConnectButton;
