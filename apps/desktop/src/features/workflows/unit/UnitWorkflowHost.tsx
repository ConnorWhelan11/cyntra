import React, { useEffect, useMemo, useRef, useState } from "react";
import { renderBundle } from "@_unit/unit/client/platform/web/render";

import unitSpecsModule from "@_unit/unit/system/_specs";
import unitClassesModule from "@_unit/unit/system/_classes";
import unitComponentsModule from "@_unit/unit/system/_components";

import { CYNTRA_UNIT_SPECS } from "../unitPack/specs";
import { CYNTRA_UNIT_CLASSES } from "../unitPack/classes";

function unwrapDefault<T>(mod: unknown): T {
  return (mod as { default?: T })?.default ?? (mod as T);
}

type UnitBundleSpec = Parameters<typeof renderBundle>[1];
type UnitGraphSpec = NonNullable<UnitBundleSpec["spec"]>;
type UnitGraphSpecs = Record<string, UnitGraphSpec>;
type UnitBootOpt = NonNullable<Parameters<typeof renderBundle>[2]>;
type UnitUnlisten = ReturnType<typeof renderBundle>[2];

interface CyntraWorkflowsWindow extends Window {
  __CYNTRA_WORKFLOWS_PROJECT_ROOT?: string;
}

const LOCAL_ROOT_SPEC_ID = "e1b6acd3-69cd-4edb-8e3e-6c78ffd28b49";

export interface UnitWorkflowHostProps {
  projectRoot: string;
}

export function UnitWorkflowHost({ projectRoot }: UnitWorkflowHostProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unitSpecs = useMemo(() => unwrapDefault<UnitGraphSpecs>(unitSpecsModule), []);
  const unitClasses = useMemo(() => unwrapDefault<Record<string, unknown>>(unitClassesModule), []);
  const unitComponents = useMemo(
    () => unwrapDefault<Record<string, unknown>>(unitComponentsModule),
    []
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    // Expose projectRoot to Cyntra units (V0: global, later: capability-scoped context).
    (window as CyntraWorkflowsWindow).__CYNTRA_WORKFLOWS_PROJECT_ROOT = projectRoot;

    const spec = unitSpecs[LOCAL_ROOT_SPEC_ID];
    if (!spec) {
      setError(`Unit spec not found: ${LOCAL_ROOT_SPEC_ID}`);
      return;
    }

    const specs = { ...unitSpecs, ...CYNTRA_UNIT_SPECS };
    const classes = { ...unitClasses, ...CYNTRA_UNIT_CLASSES };
    const components = { ...unitComponents };

    const bundle: UnitBundleSpec = { spec };

    let unlisten: UnitUnlisten | null = null;
    try {
      const [_system, _graph, cleanup] = renderBundle(el, bundle, {
        specs,
        classes,
        components,
      } as unknown as UnitBootOpt);
      unlisten = cleanup;
      setError(null);
    } catch (e) {
      setError(String(e));
    }

    return () => {
      try {
        unlisten?.();
      } catch {
        // ignore
      }
    };
  }, [projectRoot, unitSpecs, unitClasses, unitComponents]);

  return (
    <div className="workflows-unit-surface">
      {error ? (
        <div className="shell-placeholder">
          <div className="shell-placeholder-title">Unit failed to start</div>
          <div className="shell-placeholder-text">{error}</div>
        </div>
      ) : null}
      <div ref={rootRef} className="workflows-unit-root" />
    </div>
  );
}
