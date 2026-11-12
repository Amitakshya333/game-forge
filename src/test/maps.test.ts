import { describe, expect, it } from "vitest";
import { MAPS, T, blocks, zoneAt } from "@/game/maps";

describe("3D Multi-Map layouts", () => {
  it("exposes 3 distinct campus maps", () => {
    expect(MAPS.length).toBe(3);
    const ids = new Set(MAPS.map((m) => m.id));
    expect(ids.size).toBe(3);
  });

  for (const map of MAPS) {
    describe(`Map: ${map.name}`, () => {
      const grid = map.buildGrid();

      it("builds a grid of expected dimensions with perimeter exits", () => {
        expect(grid.length).toBe(map.w * map.h);
        for (const exit of map.exits) {
          expect(exit.tiles.length).toBeGreaterThan(0);
          for (const [x, y] of exit.tiles) {
            expect(grid[y * map.w + x]).toBe(T.EXIT);
          }
        }
      });

      it("spawns player on a walkable tile inside the start zone", () => {
        const [px, py] = map.playerStart;
        const tile = grid[Math.floor(py) * map.w + Math.floor(px)] ?? T.BOUND;
        expect(blocks(tile)).toBe(false);
        const startZone = zoneAt(map, px, py);
        expect(startZone?.id).toBe(map.startZoneId);
      });

      it("gives every building walkable floor tiles and at least one door", () => {
        for (const z of map.zones) {
          if (z.type !== "building") continue;
          const [zx, zy, zw, zh] = z.rect;
          let floors = 0;
          let doors = 0;
          for (let y = zy; y < zy + zh; y++) {
            for (let x = zx; x < zx + zw; x++) {
              const t = grid[y * map.w + x];
              if (t === T.FLOOR) floors++;
              if (t === T.DOOR) doors++;
            }
          }
          expect(floors).toBeGreaterThan(4);
          expect(doors).toBeGreaterThanOrEqual(2);
        }
      });

      it("can reach at least one exit from playerStart via BFS", () => {
        const startIdx = Math.floor(map.playerStart[1]) * map.w + Math.floor(map.playerStart[0]);
        const visited = new Uint8Array(map.w * map.h);
        const q = [startIdx];
        visited[startIdx] = 1;
        let reachedExit = false;

        for (let head = 0; head < q.length; head++) {
          const cur = q[head]!;
          if (grid[cur] === T.EXIT) {
            reachedExit = true;
            break;
          }
          const cx = cur % map.w;
          const cy = Math.floor(cur / map.w);
          const dirs: [number, number][] = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ];
          for (const [dx, dy] of dirs) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
            const ni = ny * map.w + nx;
            if (visited[ni]) continue;
            if (blocks(grid[ni] ?? T.BOUND)) continue;
            visited[ni] = 1;
            q.push(ni);
          }
        }
        expect(reachedExit).toBe(true);
      });
    });
  }
});
