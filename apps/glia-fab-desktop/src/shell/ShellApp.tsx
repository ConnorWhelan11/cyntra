/**
 * ShellApp - Root application with HashRouter for Tauri
 */
import React, { Suspense } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ShellLayout } from "./ShellLayout";
import { getPlugins } from "./plugins";

export function ShellApp() {
  const plugins = getPlugins();

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<ShellLayout />}>
          {/* Default redirect to first plugin */}
          <Route index element={<Navigate to={`/${plugins[0]?.id ?? "universe"}`} replace />} />

          {/* Dynamic plugin routes */}
          {plugins.map((plugin) => (
            <Route key={plugin.id} path={plugin.id}>
              {plugin.routes.map((route, idx) => (
                <Route
                  key={`${plugin.id}-${idx}`}
                  index={route.index}
                  path={route.index ? undefined : route.path}
                  element={
                    <Suspense fallback={<div className="shell-loading">Loading...</div>}>
                      {route.element}
                    </Suspense>
                  }
                />
              ))}
            </Route>
          ))}
        </Route>
      </Routes>
    </HashRouter>
  );
}
