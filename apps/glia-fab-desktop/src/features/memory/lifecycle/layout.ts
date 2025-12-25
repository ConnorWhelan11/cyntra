export interface VaultTileLayout {
  cols: number;
  spacingX: number;
  spacingZ: number;
  slabThickness: number;
  tileHeight: number;
  anchorZ: number;
}

export const DEFAULT_VAULT_TILE_LAYOUT: VaultTileLayout = {
  cols: 6,
  spacingX: 1.65,
  spacingZ: 1.35,
  slabThickness: 0.08,
  tileHeight: 0.1,
  anchorZ: 2.7,
};

export function getVaultTilePosition(
  index: number,
  _total: number,
  layout: VaultTileLayout = DEFAULT_VAULT_TILE_LAYOUT
): [number, number, number] {
  const cols = layout.cols;
  const startX = -((cols - 1) * layout.spacingX) / 2;
  const startZ = layout.anchorZ;

  const col = index % cols;
  const row = Math.floor(index / cols);

  const x = startX + col * layout.spacingX;
  const z = startZ - row * layout.spacingZ;
  const y = layout.slabThickness / 2 + layout.tileHeight / 2;

  return [x, y, z];
}
