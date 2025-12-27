/**
 * Project and server related types
 */

export interface ServerInfo {
  base_url: string;
}

export interface ProjectInfo {
  root: string;
  viewer_dir: string | null;
  cyntra_kernel_dir: string | null;
  immersa_data_dir: string | null;
}
