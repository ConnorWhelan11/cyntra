/**
 * ShellLayout - Main application layout with 2-tier sidebar
 */
import React, { Suspense, useCallback, useMemo, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { PrimaryRail } from "./components/PrimaryRail";
import { SessionDrawer } from "./components/SessionDrawer";
import { getPlugins, getPlugin } from "./plugins";
import { useSessions, useActiveApp, useSessionActions } from "./sessions";
import { sessionStore } from "./sessions/sessionStore";
import { useShellShortcuts } from "./keyboard";
import type { AppId } from "./plugins/types";
import { CommandPalette } from "@/components/shared";
import { CommandBar, PcbAmbientLayer, StatusBar } from "@/components/layout";
import { getServerInfo as getServerInfoService } from "@/services";
import type { ServerInfo } from "@/types";

export function ShellLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const plugins = useMemo(() => getPlugins(), []);
  const routeAppId = useMemo(() => {
    const seg = location.pathname.split("/").filter(Boolean)[0];
    return seg ?? null;
  }, [location.pathname]);

  const storedActiveAppId = useActiveApp();
  const activeAppId = useMemo<AppId>(() => {
    const fromRoute = routeAppId && plugins.some((p) => p.id === routeAppId) ? routeAppId : null;
    const fromStore =
      storedActiveAppId && plugins.some((p) => p.id === storedActiveAppId)
        ? storedActiveAppId
        : null;
    return (fromRoute ?? fromStore ?? plugins[0]?.id ?? "universe") as AppId;
  }, [plugins, routeAppId, storedActiveAppId]);

  const activePlugin = getPlugin(activeAppId);

  const sessions = useSessions({ appId: activeAppId, archived: false });
  const { createSession, setActiveSession, setActiveApp, togglePin } = useSessionActions();

  // Get active session from URL or store
  const { sessionId: routeSessionId } = useParams<{ sessionId: string }>();
  const activeSessionId = routeSessionId ?? null;

  // Keep store selection in sync with the URL (route is source of truth)
  useEffect(() => {
    setActiveApp(activeAppId);
  }, [activeAppId, setActiveApp]);

  useEffect(() => {
    if (activeSessionId) {
      setActiveSession(activeSessionId);
    } else {
      setActiveSession(null);
    }
  }, [activeSessionId, setActiveSession]);

  // Keep Universe sessions aligned with legacy WorldBuilder storage for now.
  useEffect(() => {
    if (activeAppId !== "universe") return;
    sessionStore.syncLegacyRecentWorlds();
    const interval = window.setInterval(() => sessionStore.syncLegacyRecentWorlds(), 1000);
    return () => window.clearInterval(interval);
  }, [activeAppId]);

  const handleSelectApp = useCallback(
    (appId: string) => {
      setActiveApp(appId as AppId);
      navigate(`/${appId}`);
    },
    [navigate, setActiveApp]
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setActiveSession(sessionId);
      navigate(`/${activeAppId}/${sessionId}`);
    },
    [navigate, activeAppId, setActiveSession]
  );

  const handleNewSession = useCallback(() => {
    if (activeAppId === "universe") {
      setActiveSession(null);
      navigate(`/${activeAppId}`);
      return;
    }
    const session = createSession(activeAppId);
    navigate(`/${activeAppId}/${session.id}`);
  }, [activeAppId, createSession, navigate, setActiveSession]);

  const handleTogglePin = useCallback(
    (sessionId: string) => {
      togglePin(sessionId);
    },
    [togglePin]
  );

  // Keyboard shortcuts
  const handleSelectSessionByIndex = useCallback(
    (index: number) => {
      if (sessions[index]) {
        handleSelectSession(sessions[index].id);
      }
    },
    [sessions, handleSelectSession]
  );

  const handleNextApp = useCallback(() => {
    const currentIndex = plugins.findIndex((p) => p.id === activeAppId);
    const nextIndex = (currentIndex + 1) % plugins.length;
    handleSelectApp(plugins[nextIndex].id);
  }, [plugins, activeAppId, handleSelectApp]);

  const handlePrevApp = useCallback(() => {
    const currentIndex = plugins.findIndex((p) => p.id === activeAppId);
    const prevIndex = (currentIndex - 1 + plugins.length) % plugins.length;
    handleSelectApp(plugins[prevIndex].id);
  }, [plugins, activeAppId, handleSelectApp]);

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const allSessions = useSessions();
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await getServerInfoService();
        if (!cancelled) setServerInfo(info);
      } catch {
        if (!cancelled) setServerInfo(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const commandPaletteItems = useMemo(() => {
    const items: Array<{
      id: string;
      type: "command" | "navigation" | "recent";
      title: string;
      icon?: string;
      isSigil?: boolean;
      action?: () => void;
    }> = [];

    items.push({
      id: "shell-new-session",
      type: "command",
      title: "New session",
      action: handleNewSession,
    });

    for (const plugin of plugins) {
      items.push({
        id: `nav-${plugin.id}`,
        type: "navigation",
        title: `Go to ${plugin.name}`,
        icon: plugin.sigil,
        isSigil: true,
        action: () => handleSelectApp(plugin.id),
      });
    }

    // Recent sessions across apps
    for (const session of allSessions.slice(0, 20)) {
      const plugin = plugins.find((p) => p.id === session.appId);
      items.push({
        id: `session-${session.id}`,
        type: "recent",
        title: session.title,
        icon: plugin?.sigil,
        isSigil: Boolean(plugin?.sigil),
        action: () => navigate(`/${session.appId}/${session.id}`),
      });
    }

    return items;
  }, [allSessions, handleNewSession, handleSelectApp, navigate, plugins]);

  useShellShortcuts({
    onNewSession: handleNewSession,
    onOpenPalette: () => setIsCommandPaletteOpen(true),
    onSelectSessionByIndex: handleSelectSessionByIndex,
    onNextApp: handleNextApp,
    onPrevApp: handlePrevApp,
  });

  return (
    <>
      <PcbAmbientLayer performance="medium" />

      <div className="shell-app-layout">
        <CommandBar
          kernelState="idle"
          kernelSnapshot={null}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        />

        <PrimaryRail plugins={plugins} activeAppId={activeAppId} onSelectApp={handleSelectApp} />
        <SessionDrawer
          appId={activeAppId}
          appName={activePlugin?.name}
          sessions={sessions}
          selectedSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onTogglePin={handleTogglePin}
        />

        <main className="shell-main-viewport">
          <div className="shell-content">
            <Suspense fallback={<div className="shell-loading">Loading...</div>}>
              <Outlet />
            </Suspense>
          </div>
        </main>
        <StatusBar serverInfo={serverInfo} kernelSnapshot={null} />
      </div>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        items={commandPaletteItems}
        placeholder="Search apps, sessions..."
      />
    </>
  );
}
