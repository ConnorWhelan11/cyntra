/**
 * WalletStatusIndicator - Compact wallet status for status bar
 *
 * Shows connection state and basic wallet info in a minimal format
 * suitable for the application status bar.
 */

import React, { useState, useEffect } from "react";
import { getMembraneStatus, getControllerSession } from "@/services/membraneService";

interface WalletStatusIndicatorProps {
  onClick?: () => void;
  className?: string;
}

type WalletState = "disconnected" | "connected" | "membrane-offline";

export function WalletStatusIndicator({ onClick, className = "" }: WalletStatusIndicatorProps) {
  const [walletState, setWalletState] = useState<WalletState>("disconnected");
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        // Check membrane status
        const status = await getMembraneStatus();

        if (!status.running) {
          setWalletState("membrane-offline");
          return;
        }

        // Check if we have a saved session
        const sessionId = localStorage.getItem("fab_controller_session_id");
        const savedAddress = localStorage.getItem("fab_controller_address");

        if (sessionId && savedAddress) {
          try {
            const session = await getControllerSession(sessionId);
            if (session.valid) {
              setWalletState("connected");
              setAddress(session.address);
              return;
            }
          } catch {
            // Session invalid, clear storage
            localStorage.removeItem("fab_controller_session_id");
            localStorage.removeItem("fab_controller_address");
          }
        }

        setWalletState("disconnected");
        setAddress(null);
      } catch {
        setWalletState("membrane-offline");
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30s

    return () => clearInterval(interval);
  }, []);

  const formatAddress = (addr: string) => {
    if (addr.length <= 10) return addr;
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  const getStatusColor = () => {
    switch (walletState) {
      case "connected":
        return "var(--signal-success)";
      case "membrane-offline":
        return "var(--text-tertiary)";
      default:
        return "var(--text-tertiary)";
    }
  };

  const getStatusIcon = () => {
    switch (walletState) {
      case "connected":
        return (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
        );
      case "membrane-offline":
        return (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        );
      default:
        return (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="2" y="5" width="20" height="14" rx="2" opacity="0.5" />
            <line x1="2" y1="10" x2="22" y2="10" opacity="0.5" />
          </svg>
        );
    }
  };

  const getStatusText = () => {
    switch (walletState) {
      case "connected":
        return address ? formatAddress(address) : "Connected";
      case "membrane-offline":
        return "Offline";
      default:
        return "Not connected";
    }
  };

  return (
    <button
      className={`wallet-status-indicator ${className}`}
      onClick={onClick}
      title={
        walletState === "membrane-offline"
          ? "Membrane service is offline"
          : walletState === "connected"
            ? `Connected: ${address}`
            : "Click to connect wallet"
      }
    >
      <span className="wallet-status-icon" style={{ color: getStatusColor() }}>
        {getStatusIcon()}
      </span>
      <span className="wallet-status-text">{getStatusText()}</span>
      {walletState === "connected" && <span className="wallet-status-dot" />}
      <style>{`
        .wallet-status-indicator {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: 2px var(--space-2);
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .wallet-status-indicator:hover {
          background: var(--surface-hover);
          color: var(--text-primary);
        }
        .wallet-status-icon {
          display: flex;
          align-items: center;
        }
        .wallet-status-text {
          letter-spacing: 0.02em;
        }
        .wallet-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--signal-success);
          box-shadow: 0 0 6px var(--signal-success);
        }
      `}</style>
    </button>
  );
}

export default WalletStatusIndicator;
