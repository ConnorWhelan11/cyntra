declare module "d3-force-3d" {
  export function forceSimulation(nodes?: any[], nDim?: number): any;
  export function forceLink(links?: any[]): any;
  export function forceManyBody(): any;
  export function forceCenter(x?: number, y?: number, z?: number): any;
  export function forceCollide(): any;
}

