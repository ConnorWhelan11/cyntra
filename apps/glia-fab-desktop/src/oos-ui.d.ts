declare module "@oos/ui" {
  import * as React from "react";

  export type OosUiVariant = string;

  export interface OosUiBaseProps {
    className?: string;
    children?: React.ReactNode;
    [key: string]: unknown;
  }

  export const Button: React.ComponentType<OosUiBaseProps & { variant?: OosUiVariant }>;
  export const Badge: React.ComponentType<OosUiBaseProps & { variant?: OosUiVariant }>;

  export const Dialog: React.ComponentType<
    OosUiBaseProps & {
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }
  >;
  export const DialogContent: React.ComponentType<OosUiBaseProps>;
  export const DialogHeader: React.ComponentType<OosUiBaseProps>;
  export const DialogTitle: React.ComponentType<OosUiBaseProps>;

  export const Input: React.ComponentType<React.InputHTMLAttributes<HTMLInputElement>>;
  export const Textarea: React.ComponentType<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>
  >;
}

