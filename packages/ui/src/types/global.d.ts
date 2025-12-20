/// <reference types="react" />
/// <reference types="react-dom" />

declare module "*.css" {
  const content: string;
  export default content;
}

declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.png" {
  const content: string;
  export default content;
}

declare module "*.jpg" {
  const content: string;
  export default content;
}

declare module "*.jpeg" {
  const content: string;
  export default content;
}

declare module "@_unit/unit/client/platform/web/render" {
  export function renderBundle(
    root: HTMLElement,
    bundle: unknown
  ): [unknown, unknown];
}

// Extend NodeJS global types
declare global {
  namespace NodeJS {
    interface Timeout {}
  }
}

export {};
