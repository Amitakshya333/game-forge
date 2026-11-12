import * as THREE from "three";
import { T, type MapConfig, type MapLandmark, type Zone, type ZoneStyle } from "./maps";

export interface BuiltWorld3D {
  root: THREE.Group;
  roofs: Map<string, { group: THREE.Group; materials: THREE.MeshStandardMaterial[] }>;
  exitMeshes: THREE.Mesh[];
  exitLights: THREE.PointLight[];
  animatedObjects: { mesh: THREE.Object3D; kind: "helipad" | "tree" | "fountain" | "beacon"; baseY: number; phase: number }[];
  dispose: () => void;
}

function makeGroundTexture(map: MapConfig, grid: Uint8Array): THREE.CanvasTexture {
  const pxPerTile = 32;
  const canvas = document.createElement("canvas");
  canvas.width = map.w * pxPerTile;
  canvas.height = map.h * pxPerTile;
  const ctx = canvas.getContext("2d")!;

  const atm = map.atmosphere;
  const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");

  const grassA = hex(atm.groundHex);
  const grassB = hex(atm.groundAltHex);
  const pathC = hex(atm.pathHex);
  const floorC = hex(atm.floorHex);

  const findZone = (tx: number, ty: number): Zone | undefined =>
    map.zones.find(
      (z) => tx >= z.rect[0] && ty >= z.rect[1] && tx < z.rect[0] + z.rect[2] && ty < z.rect[1] + z.rect[3],
    );

  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const t = grid[y * map.w + x] ?? 0;
      const px = x * pxPerTile;
      const py = y * pxPerTile;
      const z = findZone(x, y);

      if (t === T.PATH) {
        ctx.fillStyle = pathC;
        ctx.fillRect(px, py, pxPerTile, pxPerTile);
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, pxPerTile - 1, pxPerTile - 1);
        if ((x + y) % 2 === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.025)";
          ctx.fillRect(px + 2, py + 2, pxPerTile - 4, pxPerTile - 4);
        }
      } else if (t === T.FLOOR || t === T.DOOR || t === T.DESK || t === T.WALL) {
        if (z?.style === "parking") {
          ctx.fillStyle = "#1a202c";
          ctx.fillRect(px, py, pxPerTile, pxPerTile);
          ctx.strokeStyle = "rgba(255,255,255,0.18)";
          if (x % 3 === 0) {
            ctx.beginPath();
            ctx.moveTo(px + 2, py + 2);
            ctx.lineTo(px + 2, py + pxPerTile - 2);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = floorC;
          ctx.fillRect(px, py, pxPerTile, pxPerTile);
          ctx.strokeStyle = "rgba(255,255,255,0.05)";
          ctx.strokeRect(px, py, pxPerTile, pxPerTile);
          if (t === T.DOOR) {
            ctx.fillStyle = "rgba(255, 185, 56, 0.35)";
            ctx.fillRect(px + 3, py + 3, pxPerTile - 6, pxPerTile - 6);
          }
        }
      } else if (t === T.EXIT) {
        ctx.fillStyle = "rgba(76, 242, 160, 0.45)";
        ctx.fillRect(px, py, pxPerTile, pxPerTile);
      } else if (t === T.BOUND) {
        ctx.fillStyle = "#080c16";
        ctx.fillRect(px, py, pxPerTile, pxPerTile);
      } else if (z?.style === "parking") {
        ctx.fillStyle = "#19202e";
        ctx.fillRect(px, py, pxPerTile, pxPerTile);
        if (x % 3 === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.22)";
          ctx.fillRect(px + 1, py + 4, 2, pxPerTile - 8);
        }
      } else if (z?.style === "playground") {
        ctx.fillStyle = (x + y) % 2 === 0 ? "#18392f" : "#15332a";
        ctx.fillRect(px, py, pxPerTile, pxPerTile);
      } else if (z?.style === "helipad") {
        ctx.fillStyle = "#22293a";
        ctx.fillRect(px, py, pxPerTile, pxPerTile);
        ctx.strokeStyle = "rgba(245,158,11,0.12)";
        ctx.strokeRect(px, py, pxPerTile, pxPerTile);
      } else if (z?.style === "plaza") {
        ctx.fillStyle = (x + y) % 2 === 0 ? "#242c42" : "#1f273b";
        ctx.fillRect(px, py, pxPerTile, pxPerTile);
      } else {
        ctx.fillStyle = (x + y) % 2 === 0 ? grassA : grassB;
        ctx.fillRect(px, py, pxPerTile, pxPerTile);
        // Subtle organic grass speckle
        if ((x * 13 + y * 7) % 5 === 0) {
          ctx.fillStyle = "rgba(120, 230, 170, 0.04)";
          ctx.fillRect(px + 8, py + 10, 4, 4);
          ctx.fillRect(px + 20, py + 22, 3, 3);
        }
      }
    }
  }

  // Court & helipad markings
  for (const z of map.zones) {
    const [zx, zy, zw, zh] = z.rect;
    if (z.style === "playground") {
      ctx.strokeStyle = "rgba(255,255,255,0.38)";
      ctx.lineWidth = 2;
      ctx.strokeRect((zx + 1) * pxPerTile, (zy + 1) * pxPerTile, (zw - 2) * pxPerTile, (zh - 2) * pxPerTile);
      ctx.beginPath();
      ctx.arc((zx + zw / 2) * pxPerTile, (zy + zh / 2) * pxPerTile, 1.5 * pxPerTile, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (z.style === "helipad") {
      const cx = (zx + zw / 2) * pxPerTile;
      const cy = (zy + zh / 2) * pxPerTile;
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.2 * pxPerTile, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = "rgba(245,158,11,0.55)";
      ctx.beginPath();
      ctx.arc(cx, cy, 3.9 * pxPerTile, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 72px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("H", cx, cy);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeWallTexture(baseHex: number, trimHex: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const base = "#" + baseHex.toString(16).padStart(6, "0");
  const trim = "#" + trimHex.toString(16).padStart(6, "0");

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);

  // Subtle architectural panel lines
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, 0, 128, 12);
  ctx.fillStyle = trim;
  ctx.fillRect(0, 12, 128, 6);

  // Window band
  ctx.fillStyle = "rgba(135, 215, 255, 0.28)";
  ctx.fillRect(18, 34, 38, 44);
  ctx.fillRect(72, 34, 38, 44);
  ctx.strokeStyle = "rgba(15, 23, 42, 0.65)";
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 34, 38, 44);
  ctx.strokeRect(72, 34, 38, 44);

  // Base plinth
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 108, 128, 20);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeZoneSignTexture(label: string, accentHex: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(10, 16, 32, 0.9)";
  ctx.fillRect(0, 0, c.width, c.height);
  const accent = "#" + accentHex.toString(16).padStart(6, "0");
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, c.width - 8, c.height - 8);
  ctx.fillStyle = "#e8ecf5";
  ctx.font = "700 34px 'Chakra Petch', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label.toUpperCase(), c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWorld3D(map: MapConfig, grid: Uint8Array): BuiltWorld3D {
  const root = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const roofs = new Map<string, { group: THREE.Group; materials: THREE.MeshStandardMaterial[] }>();
  const exitMeshes: THREE.Mesh[] = [];
  const exitLights: THREE.PointLight[] = [];
  const animatedObjects: BuiltWorld3D["animatedObjects"] = [];

  const atm = map.atmosphere;

  // 1. Ground plane
  const groundTex = makeGroundTexture(map, grid);
  disposables.push(groundTex);
  const groundGeo = new THREE.PlaneGeometry(map.w, map.h);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex,
    roughness: 0.9,
    metalness: 0.05,
  });
  disposables.push(groundGeo, groundMat);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set(map.w / 2, 0, map.h / 2);
  ground.receiveShadow = true;
  root.add(ground);

  // Outer terrain apron beyond compound walls so horizon looks solid
  const apronGeo = new THREE.PlaneGeometry(map.w + 90, map.h + 90);
  apronGeo.rotateX(-Math.PI / 2);
  const apronMat = new THREE.MeshStandardMaterial({ color: atm.skyHex, roughness: 1 });
  disposables.push(apronGeo, apronMat);
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.position.set(map.w / 2, -0.04, map.h / 2);
  root.add(apron);

  // Collect tile positions by type
  const wallCoords: [number, number][] = [];
  const boundCoords: [number, number][] = [];
  const treeCoords: [number, number][] = [];
  const deskCoords: { x: number; y: number; style: ZoneStyle }[] = [];
  const doorCoords: [number, number][] = [];

  const zoneLookup = (tx: number, ty: number): Zone | undefined =>
    map.zones.find(
      (z) => tx >= z.rect[0] && ty >= z.rect[1] && tx < z.rect[0] + z.rect[2] && ty < z.rect[1] + z.rect[3],
    );

  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const t = grid[y * map.w + x] ?? 0;
      if (t === T.WALL) wallCoords.push([x, y]);
      else if (t === T.BOUND) boundCoords.push([x, y]);
      else if (t === T.TREE) treeCoords.push([x, y]);
      else if (t === T.DOOR) doorCoords.push([x, y]);
      else if (t === T.DESK) {
        const z = zoneLookup(x, y);
        deskCoords.push({ x, y, style: z?.style ?? "acad" });
      }
    }
  }

  // 2. Building Walls (Instanced)
  const wallTex = makeWallTexture(atm.wallHex, atm.wallTrimHex);
  disposables.push(wallTex);
  if (wallCoords.length > 0) {
    const wallH = 1.78;
    const wallGeo = new THREE.BoxGeometry(1, wallH, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.72, metalness: 0.12 });
    disposables.push(wallGeo, wallMat);
    const wallsInst = new THREE.InstancedMesh(wallGeo, wallMat, wallCoords.length);
    wallsInst.castShadow = true;
    wallsInst.receiveShadow = true;
    const m = new THREE.Matrix4();
    wallCoords.forEach(([x, y], i) => {
      m.makeTranslation(x + 0.5, wallH / 2, y + 0.5);
      wallsInst.setMatrixAt(i, m);
    });
    wallsInst.instanceMatrix.needsUpdate = true;
    root.add(wallsInst);
  }

  // Door lintels above doorways so entrances look real
  if (doorCoords.length > 0) {
    const lintelGeo = new THREE.BoxGeometry(1, 0.34, 0.96);
    const lintelMat = new THREE.MeshStandardMaterial({
      color: atm.wallTrimHex,
      roughness: 0.5,
      metalness: 0.3,
    });
    disposables.push(lintelGeo, lintelMat);
    const lintels = new THREE.InstancedMesh(lintelGeo, lintelMat, doorCoords.length);
    lintels.castShadow = true;
    const m = new THREE.Matrix4();
    doorCoords.forEach(([x, y], i) => {
      m.makeTranslation(x + 0.5, 1.61, y + 0.5);
      lintels.setMatrixAt(i, m);
    });
    lintels.instanceMatrix.needsUpdate = true;
    root.add(lintels);
  }

  // 3. Compound Perimeter Boundary Walls (Instanced)
  if (boundCoords.length > 0) {
    const bH = 2.05;
    const bGeo = new THREE.BoxGeometry(1, bH, 1);
    const bMat = new THREE.MeshStandardMaterial({ color: 0x1a2235, roughness: 0.8, metalness: 0.25 });
    const capGeo = new THREE.BoxGeometry(1.04, 0.14, 1.04);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x3b1929,
      emissive: 0x450b1a,
      emissiveIntensity: 0.35,
      roughness: 0.55,
    });
    disposables.push(bGeo, bMat, capGeo, capMat);
    const bInst = new THREE.InstancedMesh(bGeo, bMat, boundCoords.length);
    const cInst = new THREE.InstancedMesh(capGeo, capMat, boundCoords.length);
    bInst.castShadow = true;
    bInst.receiveShadow = true;
    const m = new THREE.Matrix4();
    boundCoords.forEach(([x, y], i) => {
      m.makeTranslation(x + 0.5, bH / 2, y + 0.5);
      bInst.setMatrixAt(i, m);
      m.makeTranslation(x + 0.5, bH + 0.05, y + 0.5);
      cInst.setMatrixAt(i, m);
    });
    bInst.instanceMatrix.needsUpdate = true;
    cInst.instanceMatrix.needsUpdate = true;
    root.add(bInst, cInst);
  }

  // 4. Organic Multi-Layer Trees (Instanced)
  if (treeCoords.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.11, 0.17, 0.9, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b3322, roughness: 0.92 });
    const leafLowGeo = new THREE.DodecahedronGeometry(0.56, 1);
    const leafTopGeo = new THREE.DodecahedronGeometry(0.42, 1);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1f5e42, roughness: 0.85, metalness: 0.02 });
    const leafTopMat = new THREE.MeshStandardMaterial({ color: 0x2c7a56, roughness: 0.82, metalness: 0.02 });
    disposables.push(trunkGeo, trunkMat, leafLowGeo, leafTopGeo, leafMat, leafTopMat);

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCoords.length);
    const foliageA = new THREE.InstancedMesh(leafLowGeo, leafMat, treeCoords.length);
    const foliageB = new THREE.InstancedMesh(leafTopGeo, leafTopMat, treeCoords.length);
    trunks.castShadow = true;
    foliageA.castShadow = true;
    foliageB.castShadow = true;
    foliageA.receiveShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    treeCoords.forEach(([x, y], i) => {
      const hScale = 0.88 + ((x * 17 + y * 31) % 7) * 0.05;
      pos.set(x + 0.5, 0.45 * hScale, y + 0.5);
      q.setFromEuler(new THREE.Euler(0, (x + y) * 0.8, 0));
      s.set(1, hScale, 1);
      m.compose(pos, q, s);
      trunks.setMatrixAt(i, m);

      pos.set(x + 0.5, 1.08 * hScale, y + 0.5);
      s.set(1.05, hScale, 1.05);
      m.compose(pos, q, s);
      foliageA.setMatrixAt(i, m);

      pos.set(x + 0.5 + 0.06, 1.48 * hScale, y + 0.5 - 0.05);
      s.set(0.95, hScale, 0.95);
      m.compose(pos, q, s);
      foliageB.setMatrixAt(i, m);
    });
    trunks.instanceMatrix.needsUpdate = true;
    foliageA.instanceMatrix.needsUpdate = true;
    foliageB.instanceMatrix.needsUpdate = true;
    root.add(trunks, foliageA, foliageB);
  }

  // 5. Context-Aware 3D Props & Interior Furniture (Desks, Bookshelves, Server Racks, Beds, Cars, etc.)
  const cars = deskCoords.filter((d) => d.style === "parking");
  const servers = deskCoords.filter((d) => d.style === "server" || d.style === "security");
  const bookshelves = deskCoords.filter((d) => d.style === "library");
  const labStations = deskCoords.filter((d) => d.style === "lab" || d.style === "hangar");
  const beds = deskCoords.filter((d) => d.style === "hostel");
  const tables = deskCoords.filter((d) => d.style === "canteen");
  const seats = deskCoords.filter((d) => d.style === "audi");
  const standardDesks = deskCoords.filter(
    (d) =>
      !["parking", "server", "security", "library", "lab", "hangar", "hostel", "canteen", "audi"].includes(
        d.style,
      ),
  );

  const addInstancedBox = (
    items: { x: number; y: number }[],
    w: number,
    h: number,
    d: number,
    yPos: number,
    color: number,
    rough = 0.65,
    metal = 0.15,
    emissive = 0x000000,
    emissiveInt = 0,
  ) => {
    if (!items.length) return;
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: metal,
      emissive,
      emissiveIntensity: emissiveInt,
    });
    disposables.push(geo, mat);
    const inst = new THREE.InstancedMesh(geo, mat, items.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    const m = new THREE.Matrix4();
    items.forEach((it, i) => {
      m.makeTranslation(it.x + 0.5, yPos, it.y + 0.5);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    root.add(inst);
  };

  // Classroom / Admin Desks + Chair backs
  addInstancedBox(standardDesks, 0.82, 0.52, 0.62, 0.26, 0x6b4f35, 0.72);
  addInstancedBox(standardDesks, 0.42, 0.18, 0.08, 0.56, 0x2d3748, 0.5, 0.3);

  // Canteen dining tables + bright tray tops
  addInstancedBox(tables, 0.86, 0.54, 0.72, 0.27, 0x7c5836, 0.6);
  addInstancedBox(tables, 0.34, 0.05, 0.24, 0.56, 0xdbeafe, 0.4, 0.2);

  // Library tall bookshelves
  addInstancedBox(bookshelves, 0.85, 1.32, 0.5, 0.66, 0x4f3522, 0.78);
  addInstancedBox(bookshelves, 0.78, 0.16, 0.54, 0.9, 0x3b82f6, 0.5, 0.1);
  addInstancedBox(bookshelves, 0.78, 0.16, 0.54, 0.55, 0xf59e0b, 0.5, 0.1);

  // Lab / Hangar glowing computer monitors & workbenches
  addInstancedBox(labStations, 0.86, 0.52, 0.64, 0.26, 0x334155, 0.55, 0.35);
  addInstancedBox(labStations, 0.46, 0.28, 0.06, 0.68, 0x0ea5e9, 0.25, 0.4, 0x27e0f0, 0.85);

  // Server racks with cyan/green LED strips
  addInstancedBox(servers, 0.74, 1.48, 0.68, 0.74, 0x161f30, 0.4, 0.65);
  addInstancedBox(servers, 0.58, 0.08, 0.7, 1.15, 0x22d3ee, 0.2, 0.2, 0x22d3ee, 1.1);
  addInstancedBox(servers, 0.58, 0.08, 0.7, 0.75, 0x4cf2a0, 0.2, 0.2, 0x4cf2a0, 0.9);

  // Hostel beds with pillows
  addInstancedBox(beds, 0.86, 0.38, 0.74, 0.19, 0x2b3e58, 0.85);
  addInstancedBox(beds, 0.28, 0.12, 0.5, 0.43, 0xe2e8f0, 0.9);

  // Auditorium crimson tiered seats
  addInstancedBox(seats, 0.72, 0.48, 0.55, 0.24, 0x7f1d1d, 0.75);

  // Parked cars in Parking zones (paired/individual sleek 3D vehicles!)
  if (cars.length > 0) {
    const carColors = [0x3b82f6, 0xe11d48, 0x94a3b8, 0x10b981, 0xf59e0b, 0x6366f1];
    const bodyGeo = new THREE.BoxGeometry(0.88, 0.42, 0.78);
    const cabinGeo = new THREE.BoxGeometry(0.62, 0.3, 0.66);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.8 });
    disposables.push(bodyGeo, cabinGeo, cabinMat);

    cars.forEach((c, idx) => {
      // Skip cars inside bus_bay where dedicated bus landmarks exist
      const z = zoneLookup(c.x, c.y);
      if (z?.id === "bus_bay" || z?.id === "loading_dock") return;
      const carColor = carColors[idx % carColors.length]!;
      const bodyMat = new THREE.MeshStandardMaterial({ color: carColor, roughness: 0.35, metalness: 0.6 });
      disposables.push(bodyMat);
      const car = new THREE.Group();
      car.position.set(c.x + 0.5, 0, c.y + 0.5);
      const b = new THREE.Mesh(bodyGeo, bodyMat);
      b.position.y = 0.28;
      b.castShadow = true;
      b.receiveShadow = true;
      const cab = new THREE.Mesh(cabinGeo, cabinMat);
      cab.position.y = 0.62;
      cab.castShadow = true;
      car.add(b, cab);
      root.add(car);
    });
  }

  // 6. Building Cutaway Roofs + Glowing Zone Nameplates
  for (const z of map.zones) {
    if (z.type !== "building") continue;
    const [zx, zy, zw, zh] = z.rect;
    const roofGroup = new THREE.Group();
    const roofMaterials: THREE.MeshStandardMaterial[] = [];

    const roofMat = new THREE.MeshStandardMaterial({
      color: z.roofColor ?? 0x24314d,
      roughness: 0.78,
      metalness: 0.18,
      transparent: true,
      opacity: 0.94,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: atm.wallTrimHex,
      roughness: 0.5,
      metalness: 0.35,
      transparent: true,
      opacity: 0.95,
    });
    const acMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.45,
      metalness: 0.5,
      transparent: true,
      opacity: 0.95,
    });
    roofMaterials.push(roofMat, trimMat, acMat);
    disposables.push(roofMat, trimMat, acMat);

    const slabGeo = new THREE.BoxGeometry(zw + 0.25, 0.22, zh + 0.25);
    disposables.push(slabGeo);
    const slab = new THREE.Mesh(slabGeo, roofMat);
    slab.position.set(zx + zw / 2, 1.88, zy + zh / 2);
    slab.castShadow = true;
    slab.receiveShadow = true;
    roofGroup.add(slab);

    // Rooftop AC units / skylights for realism
    const acGeo = new THREE.BoxGeometry(1.1, 0.36, 0.9);
    disposables.push(acGeo);
    const ac = new THREE.Mesh(acGeo, acMat);
    ac.position.set(zx + zw * 0.28, 2.15, zy + zh * 0.35);
    ac.castShadow = true;
    roofGroup.add(ac);

    // Glowing roof nameplate
    const signTex = makeZoneSignTexture(z.name, atm.accentHex);
    const signGeo = new THREE.PlaneGeometry(Math.min(zw * 0.75, 6.2), 1.15);
    signGeo.rotateX(-Math.PI / 2);
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissiveMap: signTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.92,
      roughness: 0.4,
    });
    roofMaterials.push(signMat);
    disposables.push(signTex, signGeo, signMat);
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(zx + zw / 2, 2.02, zy + zh / 2);
    roofGroup.add(sign);

    root.add(roofGroup);
    roofs.set(z.id, { group: roofGroup, materials: roofMaterials });

    if (z.id === map.startZoneId) {
      const interiorLight = new THREE.PointLight(0xffe4b5, 2.4, Math.max(zw, zh) * 1.4, 1.5);
      interiorLight.position.set(zx + zw / 2, 1.65, zy + zh / 2);
      root.add(interiorLight);
    }
  }

  // 7. Exit Gate Archways & Glowing Extraction Beacons
  const pillarGeo = new THREE.BoxGeometry(0.28, 2.4, 0.28);
  const beaconGeo = new THREE.SphereGeometry(0.18, 12, 12);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0x4cf2a0 });
  disposables.push(pillarGeo, beaconGeo, pillarMat, beaconMat);

  for (const e of map.exits) {
    const padMat = new THREE.MeshBasicMaterial({
      color: 0x4cf2a0,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
    });
    const padGeo = new THREE.PlaneGeometry(1, 1);
    padGeo.rotateX(-Math.PI / 2);
    disposables.push(padMat, padGeo);

    for (const [tx, ty] of e.tiles) {
      const m = new THREE.Mesh(padGeo, padMat);
      m.position.set(tx + 0.5, 0.03, ty + 0.5);
      root.add(m);
      exitMeshes.push(m);
    }

    const first = e.tiles[0]!;
    const last = e.tiles[e.tiles.length - 1]!;
    const cx = (first[0] + last[0]) / 2 + 0.5;
    const cz = (first[1] + last[1]) / 2 + 0.5;

    const p1 = new THREE.Mesh(pillarGeo, pillarMat);
    p1.position.set(first[0] + 0.5, 1.2, first[1] + 0.5);
    const p2 = new THREE.Mesh(pillarGeo, pillarMat);
    p2.position.set(last[0] + 0.5, 1.2, last[1] + 0.5);
    const b1 = new THREE.Mesh(beaconGeo, beaconMat);
    b1.position.set(cx, 2.45, cz);
    root.add(p1, p2, b1);

    animatedObjects.push({ mesh: b1, kind: "beacon", baseY: 2.45, phase: cx + cz });

    const light = new THREE.PointLight(0x4cf2a0, 2.2, 8, 1.8);
    light.position.set(cx, 2.3, cz);
    root.add(light);
    exitLights.push(light);
  }

  // 8. Map Landmarks (Fountains, Buses, Containers, Streetlamps, Basketball Court, Flagpole)
  buildLandmarks(map.landmarks, root, disposables, animatedObjects);

  // 9. Atmospheric Sky Stars & Distant Surrounding Skyline Hills
  const starCount = 320;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = (i * 2.39996) % (Math.PI * 2);
    const phi = 0.15 + ((i * 17) % 100) / 140;
    const rad = 75;
    starPos[i * 3] = map.w / 2 + Math.cos(theta) * Math.cos(phi) * rad;
    starPos[i * 3 + 1] = Math.sin(phi) * rad;
    starPos[i * 3 + 2] = map.h / 2 + Math.sin(theta) * Math.cos(phi) * rad;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xdbeafe, size: 0.38, transparent: true, opacity: 0.72 });
  disposables.push(starGeo, starMat);
  root.add(new THREE.Points(starGeo, starMat));

  return {
    root,
    roofs,
    exitMeshes,
    exitLights,
    animatedObjects,
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}

function buildLandmarks(
  landmarks: MapLandmark[],
  root: THREE.Group,
  disposables: { dispose: () => void }[],
  animated: BuiltWorld3D["animatedObjects"],
) {
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.08, 2.8, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 });
  const bulbGeo = new THREE.SphereGeometry(0.14, 10, 10);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  const glowPoolGeo = new THREE.CircleGeometry(2.6, 20);
  glowPoolGeo.rotateX(-Math.PI / 2);
  const glowPoolMat = new THREE.MeshBasicMaterial({
    color: 0xffb84d,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  disposables.push(poleGeo, poleMat, bulbGeo, bulbMat, glowPoolGeo, glowPoolMat);

  let lampCount = 0;

  for (const lm of landmarks) {
    if (lm.kind === "lamp") {
      const lamp = new THREE.Group();
      lamp.position.set(lm.x, 0, lm.y);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 1.4;
      pole.castShadow = true;
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.y = 2.82;
      const pool = new THREE.Mesh(glowPoolGeo, glowPoolMat);
      pool.position.y = 0.025;
      lamp.add(pole, bulb, pool);
      // Add actual PointLight to first 6 lamps to stay crisp and fast on all GPUs
      if (lampCount < 6) {
        const pl = new THREE.PointLight(0xffb85c, 2.2, 9.5, 1.8);
        pl.position.y = 2.65;
        lamp.add(pl);
        lampCount++;
      }
      root.add(lamp);
    } else if (lm.kind === "fountain") {
      const g = new THREE.Group();
      g.position.set(lm.x, 0, lm.y);
      const rimMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.65 });
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x0e7490,
        emissiveIntensity: 0.45,
        roughness: 0.15,
        metalness: 0.3,
      });
      const rimGeo = new THREE.CylinderGeometry(1.7, 1.85, 0.42, 20);
      const waterGeo = new THREE.CylinderGeometry(1.48, 1.48, 0.36, 20);
      const spireGeo = new THREE.CylinderGeometry(0.18, 0.32, 1.25, 12);
      const orbGeo = new THREE.OctahedronGeometry(0.28, 0);
      disposables.push(rimMat, waterMat, rimGeo, waterGeo, spireGeo, orbGeo);

      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.y = 0.21;
      rim.castShadow = true;
      rim.receiveShadow = true;
      const water = new THREE.Mesh(waterGeo, waterMat);
      water.position.y = 0.25;
      const spire = new THREE.Mesh(spireGeo, rimMat);
      spire.position.y = 0.72;
      const orb = new THREE.Mesh(orbGeo, waterMat);
      orb.position.y = 1.55;
      g.add(rim, water, spire, orb);
      root.add(g);
      animated.push({ mesh: orb, kind: "fountain", baseY: 1.55, phase: lm.x });
    } else if (lm.kind === "statue") {
      const g = new THREE.Group();
      g.position.set(lm.x, 0, lm.y);
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.55, metalness: 0.25 });
      const holoMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.8,
        roughness: 0.2,
      });
      const baseGeo = new THREE.BoxGeometry(1.8, 0.6, 1.8);
      const spireGeo = new THREE.OctahedronGeometry(0.65, 0);
      disposables.push(stoneMat, holoMat, baseGeo, spireGeo);
      const base = new THREE.Mesh(baseGeo, stoneMat);
      base.position.y = 0.3;
      base.castShadow = true;
      const spire = new THREE.Mesh(spireGeo, holoMat);
      spire.position.y = 1.45;
      g.add(base, spire);
      root.add(g);
      animated.push({ mesh: spire, kind: "fountain", baseY: 1.45, phase: lm.y });
    } else if (lm.kind === "flagpole") {
      const g = new THREE.Group();
      g.position.set(lm.x, 0, lm.y);
      const pedGeo = new THREE.CylinderGeometry(0.7, 0.9, 0.4, 12);
      const fpGeo = new THREE.CylinderGeometry(0.05, 0.06, 4.2, 8);
      const flagGeo = new THREE.BoxGeometry(1.1, 0.65, 0.05);
      const flagMat = new THREE.MeshStandardMaterial({
        color: 0x27e0f0,
        emissive: 0x0891b2,
        emissiveIntensity: 0.4,
      });
      disposables.push(pedGeo, fpGeo, flagGeo, flagMat);
      const ped = new THREE.Mesh(pedGeo, poleMat);
      ped.position.y = 0.2;
      const fp = new THREE.Mesh(fpGeo, poleMat);
      fp.position.y = 2.1;
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(0.58, 3.7, 0);
      g.add(ped, fp, flag);
      root.add(g);
    } else if (lm.kind === "basketball") {
      const g = new THREE.Group();
      g.position.set(lm.x, 0, lm.y);
      const boardGeo = new THREE.BoxGeometry(1.1, 0.75, 0.08);
      const boardMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 });
      const hoopGeo = new THREE.TorusGeometry(0.22, 0.03, 8, 16);
      hoopGeo.rotateX(Math.PI / 2);
      const hoopMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 });
      disposables.push(boardGeo, boardMat, hoopGeo, hoopMat);
      for (const side of [-3.6, 3.6]) {
        const p = new THREE.Mesh(poleGeo, poleMat);
        p.position.set(0, 1.35, side);
        const b = new THREE.Mesh(boardGeo, boardMat);
        b.position.set(0, 2.35, side - Math.sign(side) * 0.12);
        const h = new THREE.Mesh(hoopGeo, hoopMat);
        h.position.set(0, 2.15, side - Math.sign(side) * 0.36);
        g.add(p, b, h);
      }
      root.add(g);
    } else if (lm.kind === "bus") {
      const g = new THREE.Group();
      g.position.set(lm.x, 0, lm.y);
      if (lm.rot) g.rotation.y = lm.rot;
      const busGeo = new THREE.BoxGeometry(2.1, 1.15, 1.65);
      const winGeo = new THREE.BoxGeometry(1.9, 0.38, 1.68);
      const busMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4, metalness: 0.25 });
      const winMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.85 });
      disposables.push(busGeo, winGeo, busMat, winMat);
      const body = new THREE.Mesh(busGeo, busMat);
      body.position.y = 0.72;
      body.castShadow = true;
      const win = new THREE.Mesh(winGeo, winMat);
      win.position.y = 0.9;
      g.add(body, win);
      root.add(g);
    } else if (lm.kind === "container") {
      const g = new THREE.Group();
      g.position.set(lm.x, 0, lm.y);
      if (lm.rot) g.rotation.y = lm.rot;
      const cGeo = new THREE.BoxGeometry(2.6, 1.35, 1.35);
      const cMat = new THREE.MeshStandardMaterial({
        color: lm.color ?? 0xd97706,
        roughness: 0.65,
        metalness: 0.35,
      });
      disposables.push(cGeo, cMat);
      const box = new THREE.Mesh(cGeo, cMat);
      box.position.y = 0.68;
      box.castShadow = true;
      box.receiveShadow = true;
      g.add(box);
      root.add(g);
    } else if (lm.kind === "helipad_pad") {
      const pl = new THREE.PointLight(0xf59e0b, 2.8, 14, 1.6);
      pl.position.set(lm.x, 2.5, lm.y);
      root.add(pl);
      const ringGeo = new THREE.RingGeometry(3.1, 3.3, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      });
      disposables.push(ringGeo, ringMat);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(lm.x, 0.04, lm.y);
      root.add(ring);
      animated.push({ mesh: ring, kind: "helipad", baseY: 0.04, phase: 0 });
    }
  }
}
