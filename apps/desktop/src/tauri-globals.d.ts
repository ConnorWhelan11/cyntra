export {};

declare global {
  var __TAURI__: {
    invoke?: (...args: any[]) => Promise<any>;
    event?: {
      listen?: (...args: any[]) => Promise<() => void>;
      once?: (...args: any[]) => Promise<any>;
      emit?: (...args: any[]) => Promise<any>;
    };
  };
}
