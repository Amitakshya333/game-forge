import * as THREE from "three";
import { buildWorld3D, type BuiltWorld3D } from "./assets3d";
import { blocks, T, zoneAt, type MapConfig } from "./maps";
import { createCharacterRig, type CharacterRig } from "./models3d";

export interface RenderHostile {
  id: string;
  x: number;
  y: number;
  facing: number;
  state: "patrol" | "suspicious" | "investigate" | "alert" | "search" | "grab" | "down";
  aw: number;
  route: { x: number; y: number }[];
  muzzleT: number;
}

export interface RenderCiv {
  id: string;
  kind: "student" | "teacher";
  name: string;
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  state: "hide" | "follow" | "captured" | "evac";
  leader: string | null;
  route?: { x: number; y: number }[] | undefined;
  color: string;
}

export interface RenderPickup {
  id: string;
  x: number;
  y: number;
  kind: "ammo" | "med";
}

export interface RenderNoise {
  x: number;
  y: number;
  t: number;
  max: number;
  color: string;
}

export interface RenderTracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
  color: string;
}

export interface RenderBottle {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
}

export interface RenderParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  maxT: number;
  color: number;
}

export interface RenderFloat {
  x: number;
  y: number;
  text: string;
  t: number;
  color: string;
}

export interface RenderFrameState {
  mode: "act" | "think";
  time: number;
  dt: number;
  slowmo: boolean;
  status: "playing" | "won" | "lost";
  endT: number;
  selected: string | null;
  aimWorld: { x: number; y: number };
  fovAngle: number;
  hostileRange: number;
  risk: Float32Array;
  player: {
    x: number;
    y: number;
    facing: number;
    hp: number;
    moving: boolean;
    stance: "sneak" | "walk" | "run";
    muzzleT: number;
    throwT: number;
    takedownT: number;
  };
  hostiles: RenderHostile[];
  civs: RenderCiv[];
  pickups: RenderPickup[];
  noises: RenderNoise[];
  tracers: RenderTracer[];
  bottles: RenderBottle[];
  particles: RenderParticle[];
  floats: RenderFloat[];
}

const spriteTexCache = new Map<string, THREE.CanvasTexture>();

function getTextSpriteTexture(text: string, color: string, bg = false): THREE.CanvasTexture {
  const key = `${text}|${color}|${bg ? 1 : 0}`;
  const cached = spriteTexCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  if (bg) {
    ctx.fillStyle = "rgba(10, 15, 28, 0.82)";
    ctx.beginPath();
    ctx.roundRect(16, 10, 224, 44, 8);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.font = "700 26px 'Chakra Petch', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(5, 8, 18, 0.9)";
  ctx.strokeText(text, 128, 33);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 33);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  spriteTexCache.set(key, tex);
  return tex;
}

export class Renderer3D {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  map: MapConfig;
  grid: Uint8Array;
  world3d: BuiltWorld3D;

  camYaw = 0;
  camDist = 14.5;
  camPreset: "tactical" | "close" = "tactical";
  camTarget = new THREE.Vector3();
  camPos = new THREE.Vector3();
  shakeAmt = 0;

  playerRig: CharacterRig;
  hostileRigs = new Map<string, { rig: CharacterRig; cone: THREE.Mesh; statusSprite: THREE.Sprite }>();
  civRigs = new Map<string, { rig: CharacterRig; labelSprite: THREE.Sprite }>();
  pickupMeshes = new Map<string, THREE.Group>();

  aimReticle: THREE.Group;
  aimLaser: THREE.Line;
  riskMesh: THREE.InstancedMesh;
  thinkGroup = new THREE.Group();
  dynamicGroup = new THREE.Group();
  routeLines: THREE.Line[] = [];
  exitLabels: THREE.Sprite[] = [];
  playerTagSprite: THREE.Sprite;

  raycaster = new THREE.Raycaster();
  aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.6);
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // Reusable small geometries
  tracerGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 6);
  ringGeo = new THREE.RingGeometry(0.86, 1.0, 28);
  bottleGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.28, 8);
  particleGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  medGeo = new THREE.BoxGeometry(0.42, 0.24, 0.34);
  ammoGeo = new THREE.BoxGeometry(0.4, 0.28, 0.3);

  medMat = new THREE.MeshStandardMaterial({
    color: 0x4cf2a0,
    emissive: 0x16a34a,
    emissiveIntensity: 0.6,
    roughness: 0.35,
  });
  ammoMat = new THREE.MeshStandardMaterial({
    color: 0xffb020,
    emissive: 0xb45309,
    emissiveIntensity: 0.55,
    roughness: 0.4,
  });
  bottleMat = new THREE.MeshStandardMaterial({
    color: 0x34d399,
    emissive: 0x10b981,
    emissiveIntensity: 0.5,
    roughness: 0.2,
  });

  disposed = false;

  constructor(canvas: HTMLCanvasElement, map: MapConfig, grid: Uint8Array) {
    this.map = map;
    this.grid = grid;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const atm = map.atmosphere;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(atm.skyHex);
    this.scene.fog = new THREE.FogExp2(atm.fogHex, atm.fogDensity);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.2, 180);

    // Lighting rig
    const ambient = new THREE.AmbientLight(atm.ambientHex, atm.ambientInt);
    const hemi = new THREE.HemisphereLight(atm.hemiSkyHex, atm.hemiGroundHex, atm.hemiInt);
    const sun = new THREE.DirectionalLight(atm.sunHex, atm.sunInt);
    sun.position.set(map.w / 2 + atm.sunPos[0], atm.sunPos[1], map.h / 2 + atm.sunPos[2]);
    sun.target.position.set(map.w / 2, 0, map.h / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 140;
    const d = Math.max(map.w, map.h) * 0.62;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
    this.scene.add(ambient, hemi, sun, sun.target);

    // Build 3D map geometry & assets
    this.world3d = buildWorld3D(map, grid);
    this.scene.add(this.world3d.root);

    // Build Risk Heatmap InstancedMesh for Think Mode
    const riskGeo = new THREE.PlaneGeometry(0.92, 0.92);
    riskGeo.rotateX(-Math.PI / 2);
    const riskMat = new THREE.MeshBasicMaterial({
      color: 0xff3b5c,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.riskMesh = new THREE.InstancedMesh(riskGeo, riskMat, map.w * map.h);
    this.riskMesh.count = 0;
    this.thinkGroup.add(this.riskMesh);

    // Exit labels in 3D space
    for (const ex of map.exits) {
      const first = ex.tiles[0]!;
      const last = ex.tiles[ex.tiles.length - 1]!;
      const cx = (first[0] + last[0]) / 2 + 0.5;
      const cz = (first[1] + last[1]) / 2 + 0.5;
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getTextSpriteTexture("⇥ " + ex.name.toUpperCase(), "#4cf2a0", true),
          transparent: true,
          depthTest: false,
        }),
      );
      sp.position.set(cx, 3.1, cz);
      sp.scale.set(3.4, 0.85, 1);
      this.scene.add(sp);
      this.exitLabels.push(sp);
    }

    this.scene.add(this.thinkGroup, this.dynamicGroup);

    // Player 3D Rig
    this.playerRig = createCharacterRig("player");
    this.scene.add(this.playerRig.root);

    this.playerTagSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getTextSpriteTexture("YOU", "#27e0f0", true),
        transparent: true,
        depthTest: false,
      }),
    );
    this.playerTagSprite.scale.set(2.2, 0.55, 1);
    this.playerTagSprite.visible = false;
    this.scene.add(this.playerTagSprite);

    // 3D Aim reticle + faint tactical laser line
    this.aimReticle = new THREE.Group();
    const retOuter = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.36, 20),
      new THREE.MeshBasicMaterial({ color: 0x27e0f0, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    retOuter.rotation.x = -Math.PI / 2;
    const retCenter = new THREE.Mesh(
      new THREE.CircleGeometry(0.08, 12),
      new THREE.MeshBasicMaterial({ color: 0x27e0f0, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    retCenter.rotation.x = -Math.PI / 2;
    this.aimReticle.add(retOuter, retCenter);
    this.aimReticle.position.y = 0.04;
    this.scene.add(this.aimReticle);

    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.8, 0),
      new THREE.Vector3(0, 0.8, 1),
    ]);
    const laserMat = new THREE.LineBasicMaterial({
      color: 0x27e0f0,
      transparent: true,
      opacity: 0.35,
    });
    this.aimLaser = new THREE.Line(laserGeo, laserMat);
    this.scene.add(this.aimLaser);

    this.ringGeo.rotateX(-Math.PI / 2);
    this.tracerGeo.rotateX(Math.PI / 2);

    // Initialize camera at player start
    this.camTarget.set(map.playerStart[0], 0.6, map.playerStart[1]);
    this.camPos.set(map.playerStart[0], 14, map.playerStart[1] + 10);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
  }

  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  rotateYaw(delta: number) {
    this.camYaw += delta;
  }

  zoomBy(delta: number) {
    this.camDist = Math.max(7.5, Math.min(24, this.camDist + delta));
  }

  togglePreset() {
    this.camPreset = this.camPreset === "tactical" ? "close" : "tactical";
    this.camDist = this.camPreset === "close" ? 9.5 : 15.0;
  }

  addShake(amt: number) {
    this.shakeAmt = Math.min(0.65, this.shakeAmt + amt);
  }

  /** Converts screen-normalized mouse (-1..1) to world coordinates on ground/aim plane */
  screenToWorld(ndcX: number, ndcY: number, useGround = false): { x: number; y: number } {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hit = new THREE.Vector3();
    const ok = this.raycaster.ray.intersectPlane(useGround ? this.groundPlane : this.aimPlane, hit);
    if (!ok) {
      return { x: this.camTarget.x, y: this.camTarget.z };
    }
    return { x: hit.x, y: hit.z };
  }

  /** Returns camera-relative movement direction on XZ grid given WASD input (mx, my) */
  getCameraAlignedMove(mx: number, my: number): { dx: number; dy: number } {
    if (!mx && !my) return { dx: 0, dy: 0 };
    // Forward vector on XZ plane (from camera toward target)
    const fx = -Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    // Right vector on XZ plane
    const rx = Math.cos(this.camYaw);
    const rz = -Math.sin(this.camYaw);
    // Note: my is -1 when W is pressed (move forward), +1 when S is pressed
    const fwd = -my;
    const dx = rx * mx + fx * fwd;
    const dy = rz * mx + fz * fwd;
    const len = Math.hypot(dx, dy) || 1;
    return { dx: dx / len, dy: dy / len };
  }

  private updateVisionConeGeo(mesh: THREE.Mesh, h: RenderHostile, range: number, fov: number) {
    const segs = 24;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    pos.setXYZ(0, 0, 0.04, 0);
    for (let i = 0; i <= segs; i++) {
      const a = h.facing - fov / 2 + (fov * i) / segs;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      let dist = 0.25;
      for (; dist < range; dist += 0.25) {
        const tx = Math.floor(h.x + dx * dist);
        const ty = Math.floor(h.y + dz * dist);
        const tile =
          tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h
            ? T.BOUND
            : (this.grid[ty * this.map.w + tx] ?? T.BOUND);
        if (blocks(tile)) break;
      }
      pos.setXYZ(i + 1, dx * dist, 0.04, dz * dist);
    }
    pos.needsUpdate = true;
    mesh.position.set(h.x, 0, h.y);
  }

  private createConeMesh(): THREE.Mesh {
    const segs = 24;
    const positions = new Float32Array((segs + 2) * 3);
    const indices: number[] = [];
    for (let i = 1; i <= segs; i++) indices.push(0, i, i + 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff3b5c,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    return new THREE.Mesh(geo, mat);
  }

  render(s: RenderFrameState) {
    const think = s.mode === "think";
    const dt = s.dt;

    // 1. Update Camera (smooth fly between Action tactical follow and Think aerial overview)
    if (think) {
      const span = Math.max(this.map.w, this.map.h * 1.35);
      const desiredTarget = new THREE.Vector3(this.map.w / 2, 0, this.map.h / 2);
      const desiredPos = new THREE.Vector3(this.map.w / 2, span * 0.95, this.map.h / 2 + span * 0.22);
      this.camTarget.lerp(desiredTarget, 0.14);
      this.camPos.lerp(desiredPos, 0.14);
    } else {
      const pitchRatio = this.camPreset === "close" ? 0.56 : 0.82;
      const dist = this.camDist;
      const horiz = dist * (this.camPreset === "close" ? 0.85 : 0.72);
      const height = dist * pitchRatio + (s.slowmo ? -0.8 : 0);
      const desiredTarget = new THREE.Vector3(
        s.player.x + Math.cos(s.player.facing) * 1.1,
        0.75,
        s.player.y + Math.sin(s.player.facing) * 1.1,
      );
      const desiredPos = new THREE.Vector3(
        s.player.x + Math.sin(this.camYaw) * horiz,
        height,
        s.player.y + Math.cos(this.camYaw) * horiz,
      );
      this.camTarget.lerp(desiredTarget, 0.16);
      this.camPos.lerp(desiredPos, 0.16);
    }

    this.camera.position.copy(this.camPos);
    if (this.shakeAmt > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= 0.85;
    } else {
      this.shakeAmt = 0;
    }
    this.camera.lookAt(this.camTarget);

    // 2. Smart Cutaway Building Roofs (fade roof of building player is inside, or all roofs in Think Mode)
    const activeZone = zoneAt(this.map, s.player.x, s.player.y);
    for (const [zid, roof] of this.world3d.roofs) {
      const hideRoof = think || (activeZone?.type === "building" && activeZone.id === zid);
      const targetOp = think ? 0.05 : hideRoof ? 0.08 : 0.94;
      let curOp = roof.materials[0]?.opacity ?? 0.94;
      curOp += (targetOp - curOp) * 0.18;
      roof.group.visible = curOp > 0.09;
      for (const m of roof.materials) m.opacity = curOp;
    }

    // 3. Animate world landmarks & exit beacons
    const pulse = 0.5 + 0.5 * Math.sin(s.time * 4 + performance.now() / 300);
    for (const obj of this.world3d.animatedObjects) {
      if (obj.kind === "fountain") {
        obj.mesh.rotation.y += dt * 1.4;
        obj.mesh.position.y = obj.baseY + Math.sin(s.time * 3 + obj.phase) * 0.08;
      } else if (obj.kind === "beacon") {
        obj.mesh.scale.setScalar(0.85 + pulse * 0.35);
      } else if (obj.kind === "helipad") {
        obj.mesh.rotation.z += dt * 0.6;
      }
    }
    for (const l of this.world3d.exitLights) {
      l.intensity = 1.6 + pulse * 1.4;
    }

    // 4. Player Rig & Aim Indicator
    this.playerRig.update(
      {
        x: s.player.x,
        z: s.player.y,
        facing: s.player.facing,
        moving: s.player.moving,
        stance: s.player.stance,
        speed: 3.5,
        time: s.time,
        phase: 0,
        muzzleTimer: s.player.muzzleT,
        throwTimer: s.player.throwT,
        takedownTimer: s.player.takedownT,
      },
      dt,
    );

    this.playerTagSprite.visible = think;
    if (think) {
      this.playerTagSprite.position.set(s.player.x, 2.0, s.player.y);
    }

    this.aimReticle.visible = !think && s.status === "playing";
    this.aimLaser.visible = !think && s.status === "playing";
    if (!think) {
      this.aimReticle.position.set(s.aimWorld.x, 0.04, s.aimWorld.y);
      this.aimReticle.rotation.y += dt * 3;
      const posAttr = this.aimLaser.geometry.getAttribute("position") as THREE.BufferAttribute;
      posAttr.setXYZ(0, s.player.x + Math.cos(s.player.facing) * 0.35, 0.78, s.player.y + Math.sin(s.player.facing) * 0.35);
      posAttr.setXYZ(1, s.aimWorld.x, 0.72, s.aimWorld.y);
      posAttr.needsUpdate = true;
    }

    // 5. Sync Hostiles + Vision Cones
    const activeHostiles = new Set<string>();
    for (const h of s.hostiles) {
      activeHostiles.add(h.id);
      let entry = this.hostileRigs.get(h.id);
      if (!entry) {
        const rig = createCharacterRig("hostile");
        const cone = this.createConeMesh();
        const statusSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ transparent: true, depthTest: false }),
        );
        statusSprite.scale.set(1.2, 0.4, 1);
        this.scene.add(rig.root, cone, statusSprite);
        entry = { rig, cone, statusSprite };
        this.hostileRigs.set(h.id, entry);
      }

      const isDown = h.state === "down";
      entry.rig.update(
        {
          x: h.x,
          z: h.y,
          facing: h.facing,
          moving: !isDown && (h.state === "patrol" || h.state === "investigate" || h.state === "alert" || h.state === "grab"),
          stance: isDown ? "down" : h.state === "alert" ? "alert" : "patrol",
          speed: 2.4,
          time: s.time,
          phase: h.x + h.y,
          muzzleTimer: h.muzzleT,
          awareness: h.aw,
        },
        dt,
      );

      entry.cone.visible = !isDown;
      if (!isDown) {
        this.updateVisionConeGeo(entry.cone, h, s.hostileRange, s.fovAngle);
        const cMat = entry.cone.material as THREE.MeshBasicMaterial;
        if (h.state === "alert") {
          cMat.color.setHex(0xff3b5c);
          cMat.opacity = 0.34;
        } else if (h.aw > 30 || h.state === "investigate" || h.state === "grab") {
          cMat.color.setHex(0xffb020);
          cMat.opacity = 0.28;
        } else {
          cMat.color.setHex(0xff3b5c);
          cMat.opacity = 0.19;
        }
      }

      if (!isDown && h.state !== "patrol") {
        entry.statusSprite.visible = true;
        entry.statusSprite.position.set(h.x, 1.85, h.y);
        const mat = entry.statusSprite.material as THREE.SpriteMaterial;
        mat.map = getTextSpriteTexture(h.state === "alert" ? "!" : "?", h.state === "alert" ? "#ff3b5c" : "#ffb020");
      } else {
        entry.statusSprite.visible = false;
      }
    }
    for (const [id, entry] of this.hostileRigs) {
      if (!activeHostiles.has(id)) {
        this.scene.remove(entry.rig.root, entry.cone, entry.statusSprite);
        entry.cone.geometry.dispose();
        (entry.cone.material as THREE.Material).dispose();
        (entry.statusSprite.material as THREE.Material).dispose();
        entry.rig.dispose();
        this.hostileRigs.delete(id);
      }
    }

    // 6. Sync Civilians (Teachers & Students)
    const activeCivs = new Set<string>();
    for (let idx = 0; idx < s.civs.length; idx++) {
      const c = s.civs[idx]!;
      if (c.state === "evac") continue;
      activeCivs.add(c.id);
      let entry = this.civRigs.get(c.id);
      if (!entry) {
        const rig = createCharacterRig(c.kind, { shirtColor: c.color, variant: idx });
        const labelSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: c.kind === "teacher" ? getTextSpriteTexture(c.name, "#e8ecf5", true) : null,
            transparent: true,
            depthTest: false,
          }),
        );
        labelSprite.scale.set(2.6, 0.65, 1);
        labelSprite.visible = false;
        this.scene.add(rig.root, labelSprite);
        entry = { rig, labelSprite };
        this.civRigs.set(c.id, entry);
      }

      entry.rig.update(
        {
          x: c.x,
          z: c.y,
          facing: c.facing,
          moving: c.moving,
          stance: c.state === "captured" ? "captured" : c.state === "hide" ? "hide" : "follow",
          speed: 2.5,
          time: s.time,
          phase: idx * 0.9,
          selected: think && s.selected === c.id,
          followingPlayer: c.state === "follow" && c.leader === "player",
        },
        dt,
      );

      entry.labelSprite.visible = think && c.kind === "teacher";
      if (entry.labelSprite.visible) {
        entry.labelSprite.position.set(c.x, 1.95, c.y);
      }
    }
    for (const [id, entry] of this.civRigs) {
      if (!activeCivs.has(id)) {
        this.scene.remove(entry.rig.root, entry.labelSprite);
        (entry.labelSprite.material as THREE.Material).dispose();
        entry.rig.dispose();
        this.civRigs.delete(id);
      }
    }

    // 7. Sync Pickups (3D rotating crates/medkits)
    const activePickups = new Set<string>();
    for (const k of s.pickups) {
      activePickups.add(k.id);
      let g = this.pickupMeshes.get(k.id);
      if (!g) {
        g = new THREE.Group();
        const box = new THREE.Mesh(k.kind === "med" ? this.medGeo : this.ammoGeo, k.kind === "med" ? this.medMat : this.ammoMat);
        box.castShadow = true;
        g.add(box);
        if (k.kind === "med") {
          const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
          const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.08), crossMat);
          c1.position.y = 0.13;
          const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.24), crossMat);
          c2.position.y = 0.13;
          g.add(c1, c2);
        }
        this.scene.add(g);
        this.pickupMeshes.set(k.id, g);
      }
      g.position.set(k.x, 0.28 + Math.sin(s.time * 4 + k.x) * 0.08, k.y);
      g.rotation.y += dt * 1.8;
    }
    for (const [id, g] of this.pickupMeshes) {
      if (!activePickups.has(id)) {
        this.scene.remove(g);
        this.pickupMeshes.delete(id);
      }
    }

    // 8. Think Mode overlays (Risk tiles + Hostile patrol loops + Planned Teacher routes)
    this.thinkGroup.visible = think;
    if (think) {
      const m = new THREE.Matrix4();
      let count = 0;
      for (let i = 0; i < this.map.w * this.map.h; i++) {
        if ((s.risk[i] ?? 0) > 6) {
          const tx = i % this.map.w;
          const ty = Math.floor(i / this.map.w);
          m.makeTranslation(tx + 0.5, 0.045, ty + 0.5);
          this.riskMesh.setMatrixAt(count++, m);
        }
      }
      this.riskMesh.count = count;
      this.riskMesh.instanceMatrix.needsUpdate = true;
    }

    // Clear old route lines & rebuild dynamic FX
    for (const l of this.routeLines) {
      this.scene.remove(l);
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
    }
    this.routeLines = [];

    if (think) {
      for (const h of s.hostiles) {
        if (h.state === "down" || h.route.length < 2) continue;
        const pts = h.route.map((p) => new THREE.Vector3(p.x, 0.14, p.y));
        pts.push(pts[0]!.clone());
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.72 });
        const line = new THREE.Line(geo, mat);
        this.scene.add(line);
        this.routeLines.push(line);
      }
    }

    // Teacher active evacuation routes visible in both Think and Act Mode!
    for (const c of s.civs) {
      if (c.kind === "teacher" && c.route?.length && c.state === "follow") {
        const pts = [new THREE.Vector3(c.x, 0.12, c.y), ...c.route.map((p) => new THREE.Vector3(p.x, 0.12, p.y))];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: 0x4cf2a0, transparent: true, opacity: think ? 0.92 : 0.55 });
        const line = new THREE.Line(geo, mat);
        this.scene.add(line);
        this.routeLines.push(line);
      }
    }

    // Rebuild transient dynamic FX (tracers, noise rings, bottles, glass particles, floating text)
    while (this.dynamicGroup.children.length > 0) {
      const ch = this.dynamicGroup.children[0]!;
      this.dynamicGroup.remove(ch);
      if ((ch as THREE.Mesh).material && Array.isArray((ch as THREE.Mesh).material) === false) {
        const mat = (ch as THREE.Mesh).material as THREE.Material;
        if (mat !== this.bottleMat) mat.dispose();
      }
    }

    for (const tr of s.tracers) {
      const p1 = new THREE.Vector3(tr.x1, 0.76, tr.y1);
      const p2 = new THREE.Vector3(tr.x2, 0.72, tr.y2);
      const len = p1.distanceTo(p2);
      if (len < 0.05) continue;
      const mat = new THREE.MeshBasicMaterial({
        color: tr.color,
        transparent: true,
        opacity: Math.min(1, tr.t / 0.12),
      });
      const mesh = new THREE.Mesh(this.tracerGeo, mat);
      mesh.position.copy(p1).lerp(p2, 0.5);
      mesh.scale.set(1, 1, len);
      mesh.lookAt(p2);
      this.dynamicGroup.add(mesh);
    }

    for (const n of s.noises) {
      const prog = n.t / 0.8;
      const rad = Math.max(0.15, n.max * prog);
      const mat = new THREE.MeshBasicMaterial({
        color: n.color,
        transparent: true,
        opacity: (1 - prog) * 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(this.ringGeo, mat);
      ring.position.set(n.x, 0.05, n.y);
      ring.scale.setScalar(rad);
      this.dynamicGroup.add(ring);
    }

    for (const b of s.bottles) {
      const p = Math.min(1, b.t / b.dur);
      const x = b.sx + (b.tx - b.sx) * p;
      const z = b.sy + (b.ty - b.sy) * p;
      const y = 0.75 * (1 - p) + Math.sin(p * Math.PI) * 2.2;
      const mesh = new THREE.Mesh(this.bottleGeo, this.bottleMat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(b.t * 14, b.t * 9, b.t * 11);
      this.dynamicGroup.add(mesh);
    }

    for (const pt of s.particles) {
      const mat = new THREE.MeshBasicMaterial({
        color: pt.color,
        transparent: true,
        opacity: Math.max(0, pt.t / pt.maxT),
      });
      const m = new THREE.Mesh(this.particleGeo, mat);
      m.position.set(pt.x, pt.y, pt.z);
      m.scale.setScalar(0.6 + (pt.t / pt.maxT) * 0.7);
      this.dynamicGroup.add(m);
    }

    for (const f of s.floats) {
      const mat = new THREE.SpriteMaterial({
        map: getTextSpriteTexture(f.text, f.color),
        transparent: true,
        opacity: Math.min(1, f.t * 1.8),
        depthTest: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(f.x, 1.7 + (1.2 - Math.min(1.2, f.t)) * 0.75, f.y);
      sp.scale.set(2.4, 0.6, 1);
      this.dynamicGroup.add(sp);
    }

    this.renderer.render(this.scene, this.camera);
  }

  drawMinimap(canvas: HTMLCanvasElement, s: RenderFrameState) {
    const g = canvas.getContext("2d");
    if (!g) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.min(cw / this.map.w, ch / this.map.h);

    g.clearRect(0, 0, cw, ch);
    g.fillStyle = this.map.atmosphere.minimapBg;
    g.fillRect(0, 0, cw, ch);

    for (let y = 0; y < this.map.h; y++) {
      for (let x = 0; x < this.map.w; x++) {
        const t = this.grid[y * this.map.w + x] ?? 0;
        if (t === T.WALL || t === T.BOUND) {
          g.fillStyle = t === T.BOUND ? "#05070e" : "#445c96";
          g.fillRect(x * scale, y * scale, Math.ceil(scale), Math.ceil(scale));
        } else if (t === T.PATH) {
          g.fillStyle = "#1f2a48";
          g.fillRect(x * scale, y * scale, Math.ceil(scale), Math.ceil(scale));
        } else if (t === T.FLOOR || t === T.DOOR) {
          g.fillStyle = "#172038";
          g.fillRect(x * scale, y * scale, Math.ceil(scale), Math.ceil(scale));
        } else if (t === T.EXIT) {
          g.fillStyle = "#4cf2a0";
          g.fillRect(x * scale, y * scale, Math.ceil(scale), Math.ceil(scale));
        } else if (t === T.TREE) {
          g.fillStyle = "#1b4d38";
          g.fillRect(x * scale, y * scale, Math.ceil(scale), Math.ceil(scale));
        }
      }
    }

    for (const c of s.civs) {
      if (c.state === "evac") continue;
      g.fillStyle = c.state === "captured" ? "#ffb020" : c.kind === "teacher" ? "#4cf2a0" : "#e8ecf5";
      g.fillRect(c.x * scale - 1.5, c.y * scale - 1.5, 3, 3);
    }
    for (const h of s.hostiles) {
      if (h.state === "down") continue;
      g.fillStyle = "#ff3b5c";
      g.fillRect(h.x * scale - 2, h.y * scale - 2, 4, 4);
    }

    // Player & facing arrow
    const px = s.player.x * scale;
    const py = s.player.y * scale;
    g.fillStyle = "#27e0f0";
    g.beginPath();
    g.arc(px, py, 3.8, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#27e0f0";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px + Math.cos(s.player.facing) * 8, py + Math.sin(s.player.facing) * 8);
    g.stroke();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.world3d.dispose();
    this.playerRig.dispose();
    this.exitLabels.forEach((s) => (s.material as THREE.Material).dispose());
    this.hostileRigs.forEach((h) => {
      h.cone.geometry.dispose();
      (h.cone.material as THREE.Material).dispose();
      (h.statusSprite.material as THREE.Material).dispose();
      h.rig.dispose();
    });
    this.civRigs.forEach((c) => {
      (c.labelSprite.material as THREE.Material).dispose();
      c.rig.dispose();
    });
    this.tracerGeo.dispose();
    this.ringGeo.dispose();
    this.bottleGeo.dispose();
    this.particleGeo.dispose();
    this.medGeo.dispose();
    this.ammoGeo.dispose();
    this.medMat.dispose();
    this.ammoMat.dispose();
    this.bottleMat.dispose();
    this.riskMesh.geometry.dispose();
    (this.riskMesh.material as THREE.Material).dispose();
    this.aimLaser.geometry.dispose();
    (this.aimLaser.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
