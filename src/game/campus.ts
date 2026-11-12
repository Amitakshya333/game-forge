import { MAPS, T, blocks, getMap, zoneAt as mapZoneAt, type Exit, type MapConfig, type Zone } from "./maps";

export { T, blocks, getMap, MAPS };
export type { Exit, MapConfig, Zone };

const DEFAULT_MAP = MAPS[0]!;

export const W = DEFAULT_MAP.w;
export const H = DEFAULT_MAP.h;
export const TILE = 32;

export const ZONES = DEFAULT_MAP.zones;
export const EXITS = DEFAULT_MAP.exits;
export const TEACHERS = DEFAULT_MAP.teachers;
export const PATROLS = DEFAULT_MAP.patrols;

export function buildGrid(): Uint8Array {
  return DEFAULT_MAP.buildGrid();
}

export function zoneAt(x: number, y: number): Zone | undefined {
  return mapZoneAt(DEFAULT_MAP, x, y);
}
