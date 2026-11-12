import * as THREE from "three";

export type CharacterRole = "player" | "hostile" | "teacher" | "student";

export interface CharacterAnimState {
  x: number;
  z: number;
  facing: number;
  moving: boolean;
  stance: "sneak" | "walk" | "run" | "hide" | "follow" | "captured" | "alert" | "patrol" | "down";
  speed: number;
  time: number;
  phase: number;
  muzzleTimer?: number | undefined;
  throwTimer?: number | undefined;
  takedownTimer?: number | undefined;
  selected?: boolean | undefined;
  followingPlayer?: boolean | undefined;
  awareness?: number | undefined; // 0..100 for hostiles
}

export interface CharacterRig {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  muzzleFlash?: THREE.Mesh | undefined;
  groundRing?: THREE.Mesh | undefined;
  selectBeam?: THREE.Mesh | undefined;
  followDot?: THREE.Mesh | undefined;
  role: CharacterRole;
  downProgress: number;
  update: (state: CharacterAnimState, dt: number) => void;
  dispose: () => void;
}

export function facingToYaw(facing: number): number {
  return Math.PI / 2 - facing;
}

// Shared reusable geometries (created lazily once)
let sharedGeo: {
  torso: THREE.BoxGeometry;
  pelvis: THREE.BoxGeometry;
  head: THREE.BoxGeometry;
  hairTop: THREE.BoxGeometry;
  hairBack: THREE.BoxGeometry;
  helmet: THREE.BoxGeometry;
  goggles: THREE.BoxGeometry;
  glasses: THREE.BoxGeometry;
  arm: THREE.BoxGeometry;
  leg: THREE.BoxGeometry;
  shoe: THREE.BoxGeometry;
  pack: THREE.BoxGeometry;
  pistolBody: THREE.BoxGeometry;
  pistolBarrel: THREE.CylinderGeometry;
  rifleBody: THREE.BoxGeometry;
  rifleBarrel: THREE.CylinderGeometry;
  clipboard: THREE.BoxGeometry;
  muzzle: THREE.OctahedronGeometry;
  ring: THREE.RingGeometry;
  beam: THREE.CylinderGeometry;
  dot: THREE.SphereGeometry;
} | null = null;

function getSharedGeo() {
  if (sharedGeo) return sharedGeo;
  sharedGeo = {
    torso: new THREE.BoxGeometry(0.34, 0.42, 0.2),
    pelvis: new THREE.BoxGeometry(0.3, 0.14, 0.18),
    head: new THREE.BoxGeometry(0.24, 0.25, 0.24),
    hairTop: new THREE.BoxGeometry(0.26, 0.08, 0.26),
    hairBack: new THREE.BoxGeometry(0.26, 0.16, 0.07),
    helmet: new THREE.BoxGeometry(0.27, 0.16, 0.27),
    goggles: new THREE.BoxGeometry(0.22, 0.07, 0.06),
    glasses: new THREE.BoxGeometry(0.22, 0.05, 0.04),
    arm: new THREE.BoxGeometry(0.11, 0.36, 0.11),
    leg: new THREE.BoxGeometry(0.12, 0.42, 0.13),
    shoe: new THREE.BoxGeometry(0.13, 0.09, 0.2),
    pack: new THREE.BoxGeometry(0.24, 0.3, 0.12),
    pistolBody: new THREE.BoxGeometry(0.06, 0.2, 0.09),
    pistolBarrel: new THREE.CylinderGeometry(0.018, 0.018, 0.18, 8),
    rifleBody: new THREE.BoxGeometry(0.07, 0.44, 0.11),
    rifleBarrel: new THREE.CylinderGeometry(0.018, 0.02, 0.28, 8),
    clipboard: new THREE.BoxGeometry(0.16, 0.22, 0.02),
    muzzle: new THREE.OctahedronGeometry(0.09, 0),
    ring: new THREE.RingGeometry(0.34, 0.44, 24),
    beam: new THREE.CylinderGeometry(0.38, 0.38, 2.2, 16, 1, true),
    dot: new THREE.SphereGeometry(0.07, 10, 10),
  };
  sharedGeo.ring.rotateX(-Math.PI / 2);
  return sharedGeo;
}

const matCache = new Map<string, THREE.Material>();

function getStdMat(
  key: string,
  color: number,
  roughness = 0.65,
  metalness = 0.1,
  emissive = 0x000000,
  emissiveIntensity = 0,
): THREE.MeshStandardMaterial {
  const cached = matCache.get(key);
  if (cached) return cached as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
  });
  matCache.set(key, m);
  return m;
}

function hexStringToNum(hex: string): number {
  return parseInt(hex.replace("#", ""), 16) || 0xdbeafe;
}

export function createCharacterRig(
  role: CharacterRole,
  options: { shirtColor?: string | undefined; variant?: number | undefined } = {},
): CharacterRig {
  const geo = getSharedGeo();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const variant = options.variant ?? 0;

  // Skin tone variations for students/teachers
  const skinTones = [0xf2c29b, 0xdca57a, 0xe8b48c, 0xb87d56, 0xf6cfb0];
  const skinColor = role === "hostile" ? 0x262932 : skinTones[variant % skinTones.length]!;
  const skinMat = getStdMat(`skin:${skinColor}`, skinColor, 0.72, 0.04);
  const darkMetal = getStdMat("darkMetal", 0x1e2430, 0.35, 0.75);
  const gunMetal = getStdMat("gunMetal", 0x161a22, 0.3, 0.85);
  const shoeMat = getStdMat("shoe", 0x151921, 0.8, 0.1);

  let shirtColor = 0x22d3ee;
  let pantsColor = 0x1f2a44;
  let hairColor = 0x1a1614;

  if (role === "player") {
    shirtColor = 0x154c79;
    pantsColor = 0x162033;
    hairColor = 0x141316;
  } else if (role === "hostile") {
    shirtColor = 0x24171d;
    pantsColor = 0x16161c;
    hairColor = 0x111115;
  } else if (role === "teacher") {
    shirtColor = 0x1e6b5e;
    pantsColor = 0x1f2937;
    hairColor = variant % 2 === 0 ? 0x2d2a2e : 0x5c5c66;
  } else {
    shirtColor = options.shirtColor ? hexStringToNum(options.shirtColor) : 0x9fd3ff;
    pantsColor = variant % 2 === 0 ? 0x1f2937 : 0x2b3654;
    hairColor = [0x141214, 0x2d1e15, 0x3b2a1e, 0x0f1014][variant % 4]!;
  }

  const shirtMat = getStdMat(`shirt:${role}:${shirtColor}`, shirtColor, 0.65, 0.08);
  const pantsMat = getStdMat(`pants:${pantsColor}`, pantsColor, 0.78, 0.05);
  const hairMat = getStdMat(`hair:${hairColor}`, hairColor, 0.85, 0.05);

  // Pelvis
  const pelvis = new THREE.Mesh(geo.pelvis, pantsMat);
  pelvis.position.set(0, 0.52, 0);
  pelvis.castShadow = true;
  pelvis.receiveShadow = true;
  body.add(pelvis);

  // Legs
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.095, 0.48, 0);
  const lLegMesh = new THREE.Mesh(geo.leg, pantsMat);
  lLegMesh.position.set(0, -0.21, 0);
  lLegMesh.castShadow = true;
  const lShoe = new THREE.Mesh(geo.shoe, shoeMat);
  lShoe.position.set(0, -0.43, 0.03);
  lShoe.castShadow = true;
  leftLeg.add(lLegMesh, lShoe);
  body.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.095, 0.48, 0);
  const rLegMesh = new THREE.Mesh(geo.leg, pantsMat);
  rLegMesh.position.set(0, -0.21, 0);
  rLegMesh.castShadow = true;
  const rShoe = new THREE.Mesh(geo.shoe, shoeMat);
  rShoe.position.set(0, -0.43, 0.03);
  rShoe.castShadow = true;
  rightLeg.add(rLegMesh, rShoe);
  body.add(rightLeg);

  // Torso
  const torso = new THREE.Group();
  torso.position.set(0, 0.57, 0);
  body.add(torso);

  const chestMesh = new THREE.Mesh(geo.torso, shirtMat);
  chestMesh.position.set(0, 0.21, 0);
  chestMesh.castShadow = true;
  chestMesh.receiveShadow = true;
  torso.add(chestMesh);

  // Role-specific torso gear
  if (role === "player") {
    const cyanStripeMat = getStdMat("playerCyanStripe", 0x27e0f0, 0.35, 0.4, 0x27e0f0, 0.65);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.21), cyanStripeMat);
    stripe.position.set(0, 0.3, 0);
    torso.add(stripe);

    const packMat = getStdMat("playerPack", 0x0e2a3b, 0.6, 0.2);
    const pack = new THREE.Mesh(geo.pack, packMat);
    pack.position.set(0, 0.22, -0.15);
    pack.castShadow = true;
    torso.add(pack);
  } else if (role === "hostile") {
    const vestMat = getStdMat("hostileVest", 0x16141a, 0.55, 0.35);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.34, 0.24), vestMat);
    vest.position.set(0, 0.22, 0);
    vest.castShadow = true;
    torso.add(vest);

    const redTrimMat = getStdMat("hostileTrim", 0xff3b5c, 0.4, 0.3, 0xff3b5c, 0.55);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.25), redTrimMat);
    badge.position.set(0, 0.3, 0);
    torso.add(badge);
  } else if (role === "teacher") {
    const tieMat = getStdMat("teacherTie", 0x4cf2a0, 0.45, 0.2, 0x4cf2a0, 0.35);
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.215), tieMat);
    tie.position.set(0, 0.22, 0);
    torso.add(tie);
  } else if (variant % 2 === 0) {
    const bagColors = [0x334155, 0x7c2d12, 0x1e3a8a, 0x365314];
    const bagColor = bagColors[variant % bagColors.length]!;
    const bag = new THREE.Mesh(geo.pack, getStdMat(`bag:${bagColor}`, bagColor, 0.75, 0.1));
    bag.position.set(0, 0.22, -0.14);
    bag.scale.set(0.9, 0.85, 0.85);
    bag.castShadow = true;
    torso.add(bag);
  }

  // Head
  const head = new THREE.Group();
  head.position.set(0, 0.44, 0);
  torso.add(head);

  const headMesh = new THREE.Mesh(geo.head, skinMat);
  headMesh.position.set(0, 0.13, 0);
  headMesh.castShadow = true;
  head.add(headMesh);

  if (role === "hostile") {
    const helmMat = getStdMat("hostileHelm", 0x191a20, 0.45, 0.4);
    const helm = new THREE.Mesh(geo.helmet, helmMat);
    helm.position.set(0, 0.2, 0);
    helm.castShadow = true;
    const goggleMat = getStdMat("hostileGoggles", 0xff2b4f, 0.2, 0.3, 0xff2b4f, 1.4);
    const goggles = new THREE.Mesh(geo.goggles, goggleMat);
    goggles.position.set(0, 0.15, 0.11);
    head.add(helm, goggles);
  } else {
    const hairTop = new THREE.Mesh(geo.hairTop, hairMat);
    hairTop.position.set(0, 0.26, -0.01);
    hairTop.castShadow = true;
    const hairBack = new THREE.Mesh(geo.hairBack, hairMat);
    hairBack.position.set(0, 0.16, -0.1);
    head.add(hairTop, hairBack);

    if (role === "player") {
      const visorMat = getStdMat("playerVisor", 0x27e0f0, 0.2, 0.6, 0x27e0f0, 0.9);
      const visor = new THREE.Mesh(geo.glasses, visorMat);
      visor.position.set(0, 0.15, 0.115);
      head.add(visor);
    } else if (role === "teacher") {
      const glassMat = getStdMat("teacherGlasses", 0xe2e8f0, 0.2, 0.8);
      const glasses = new THREE.Mesh(geo.glasses, glassMat);
      glasses.position.set(0, 0.15, 0.115);
      head.add(glasses);
    } else if (role === "student" && variant % 3 === 1) {
      const capColors = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b];
      const capCol = capColors[variant % capColors.length]!;
      const capMat = getStdMat(`cap:${capCol}`, capCol, 0.65);
      const capCrown = new THREE.Mesh(geo.hairTop, capMat);
      capCrown.position.set(0, 0.27, 0);
      const capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.14), capMat);
      capBrim.position.set(0, 0.23, 0.15);
      head.add(capCrown, capBrim);
    }
  }

  // Arms
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.225, 0.38, 0);
  const lArmMesh = new THREE.Mesh(geo.arm, shirtMat);
  lArmMesh.position.set(0, -0.15, 0);
  lArmMesh.castShadow = true;
  leftArm.add(lArmMesh);
  torso.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.225, 0.38, 0);
  const rArmMesh = new THREE.Mesh(geo.arm, shirtMat);
  rArmMesh.position.set(0, -0.15, 0);
  rArmMesh.castShadow = true;
  rightArm.add(rArmMesh);
  torso.add(rightArm);

  let muzzleFlash: THREE.Mesh | undefined;
  if (role === "player") {
    const pistol = new THREE.Group();
    pistol.position.set(0, -0.38, 0.04);
    const pBody = new THREE.Mesh(geo.pistolBody, darkMetal);
    const pBarrel = new THREE.Mesh(geo.pistolBarrel, gunMetal);
    pBarrel.position.set(0, -0.15, 0.025);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0x5ff7ff, transparent: true, opacity: 0.95 });
    muzzleFlash = new THREE.Mesh(geo.muzzle, flashMat);
    muzzleFlash.position.set(0, -0.28, 0.025);
    muzzleFlash.visible = false;
    pistol.add(pBody, pBarrel, muzzleFlash);
    rightArm.add(pistol);
  } else if (role === "hostile") {
    const rifle = new THREE.Group();
    rifle.position.set(-0.04, -0.44, 0.05);
    const rBody = new THREE.Mesh(geo.rifleBody, darkMetal);
    const rBarrel = new THREE.Mesh(geo.rifleBarrel, gunMetal);
    rBarrel.position.set(0, -0.32, 0.02);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xff6b4a, transparent: true, opacity: 0.95 });
    muzzleFlash = new THREE.Mesh(geo.muzzle, flashMat);
    muzzleFlash.position.set(0, -0.49, 0.02);
    muzzleFlash.scale.setScalar(1.2);
    muzzleFlash.visible = false;
    rifle.add(rBody, rBarrel, muzzleFlash);
    rightArm.add(rifle);
  } else if (role === "teacher") {
    const cb = new THREE.Mesh(geo.clipboard, getStdMat("clipboard", 0x92643b, 0.8));
    cb.position.set(0, -0.31, 0.07);
    cb.rotation.x = Math.PI / 4;
    rightArm.add(cb);
  }

  // Ground indicator ring & optional selection beam
  let groundRing: THREE.Mesh | undefined;
  let selectBeam: THREE.Mesh | undefined;
  let followDot: THREE.Mesh | undefined;

  if (role === "player") {
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x27e0f0,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    groundRing = new THREE.Mesh(geo.ring, ringMat);
    groundRing.position.y = 0.03;
    root.add(groundRing);
  } else if (role === "teacher") {
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x4cf2a0,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    });
    groundRing = new THREE.Mesh(geo.ring, ringMat);
    groundRing.position.y = 0.03;
    groundRing.scale.setScalar(1.25);
    root.add(groundRing);

    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x4cf2a0,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    selectBeam = new THREE.Mesh(geo.beam, beamMat);
    selectBeam.position.y = 1.1;
    selectBeam.visible = false;
    root.add(selectBeam);
  } else if (role === "hostile") {
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3b5c,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    groundRing = new THREE.Mesh(geo.ring, ringMat);
    groundRing.position.y = 0.03;
    root.add(groundRing);
  } else if (role === "student") {
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffb020,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    groundRing = new THREE.Mesh(geo.ring, ringMat);
    groundRing.position.y = 0.03;
    root.add(groundRing);
  }

  if (role === "teacher" || role === "student") {
    followDot = new THREE.Mesh(
      geo.dot,
      new THREE.MeshBasicMaterial({ color: 0x27e0f0, transparent: true, opacity: 0.9 }),
    );
    followDot.position.set(0, 1.56, 0);
    followDot.visible = false;
    root.add(followDot);
  }

  const rig: CharacterRig = {
    root,
    body,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    muzzleFlash,
    groundRing,
    selectBeam,
    followDot,
    role,
    downProgress: 0,
    update(s: CharacterAnimState, dt: number) {
      root.position.set(s.x, 0, s.z);
      root.rotation.y = facingToYaw(s.facing);

      if (s.stance === "down") {
        rig.downProgress = Math.min(1, rig.downProgress + dt * 5.5);
        body.rotation.x = -rig.downProgress * (Math.PI / 2);
        body.position.y = 0.12 * rig.downProgress;
        if (groundRing) groundRing.visible = false;
        if (muzzleFlash) muzzleFlash.visible = false;
        return;
      }

      rig.downProgress = 0;
      body.rotation.x = 0;

      const freq = s.stance === "run" ? 13 : s.stance === "sneak" ? 6.5 : 9;
      const swing = s.moving ? (s.stance === "run" ? 0.72 : s.stance === "sneak" ? 0.34 : 0.5) : 0;
      const stride = Math.sin(s.time * freq + s.phase);

      leftLeg.rotation.x = stride * swing;
      rightLeg.rotation.x = -stride * swing;

      const crouchOffset = s.stance === "sneak" || s.stance === "hide" ? -0.24 : 0;
      const bob = s.moving ? Math.abs(Math.cos(s.time * freq + s.phase)) * 0.05 : Math.sin(s.time * 2.2 + s.phase) * 0.015;
      body.position.y = crouchOffset + bob;
      torso.rotation.x = s.stance === "sneak" || s.stance === "hide" ? 0.28 : s.stance === "run" ? 0.18 : 0.04;

      if (role === "player") {
        // Weapon aiming pose with right arm raised toward target
        const recoil = (s.muzzleTimer ?? 0) > 0 ? 0.32 : 0;
        const throwSwing = (s.throwTimer ?? 0) > 0 ? Math.sin(((s.throwTimer ?? 0) / 0.35) * Math.PI) * 1.4 : 0;
        const strike = (s.takedownTimer ?? 0) > 0 ? Math.sin(((s.takedownTimer ?? 0) / 0.35) * Math.PI) * 0.9 : 0;
        rightArm.rotation.x = -Math.PI / 2 + 0.15 - recoil - strike;
        leftArm.rotation.x = throwSwing ? -throwSwing : -stride * swing * 0.65 - 0.15;
        if (muzzleFlash) {
          muzzleFlash.visible = (s.muzzleTimer ?? 0) > 0;
          if (muzzleFlash.visible) muzzleFlash.rotation.z += dt * 40;
        }
        if (groundRing) {
          const pulse = 1 + 0.08 * Math.sin(s.time * 5);
          groundRing.scale.setScalar(pulse);
        }
      } else if (role === "hostile") {
        const aiming = s.stance === "alert";
        const recoil = (s.muzzleTimer ?? 0) > 0 ? 0.25 : 0;
        rightArm.rotation.x = aiming ? -Math.PI / 2 + 0.1 - recoil : -0.85 + stride * swing * 0.25;
        leftArm.rotation.x = aiming ? -Math.PI / 2 + 0.22 : -0.75 - stride * swing * 0.25;
        leftArm.rotation.z = aiming ? -0.25 : -0.15;
        if (muzzleFlash) {
          muzzleFlash.visible = (s.muzzleTimer ?? 0) > 0;
          if (muzzleFlash.visible) muzzleFlash.rotation.z += dt * 45;
        }
        if (groundRing) {
          const mat = groundRing.material as THREE.MeshBasicMaterial;
          if (s.stance === "alert") {
            mat.color.setHex(0xff3b5c);
            mat.opacity = 0.65 + 0.25 * Math.sin(s.time * 10);
          } else if ((s.awareness ?? 0) > 25) {
            mat.color.setHex(0xffb020);
            mat.opacity = 0.55;
          } else {
            mat.color.setHex(0xff3b5c);
            mat.opacity = 0.22;
          }
        }
      } else {
        // Teacher / Student
        if (s.stance === "captured") {
          leftArm.rotation.x = -2.4;
          rightArm.rotation.x = -2.4;
          body.position.y = -0.12;
          torso.rotation.x = 0.1;
          if (groundRing) {
            const mat = groundRing.material as THREE.MeshBasicMaterial;
            mat.color.setHex(0xffb020);
            mat.opacity = 0.5 + 0.3 * Math.sin(s.time * 9);
          }
        } else if (s.stance === "hide") {
          leftArm.rotation.x = -0.6;
          rightArm.rotation.x = -0.6;
          head.rotation.y = Math.sin(s.time * 1.8 + s.phase) * 0.35;
          if (groundRing) {
            const mat = groundRing.material as THREE.MeshBasicMaterial;
            if (role === "teacher") {
              mat.color.setHex(s.selected ? 0xffffff : 0x4cf2a0);
              mat.opacity = s.selected ? 0.95 : 0.72;
            } else {
              mat.opacity = 0;
            }
          }
        } else {
          head.rotation.y = 0;
          leftArm.rotation.x = -stride * swing * 0.85;
          rightArm.rotation.x = role === "teacher" ? -0.45 : stride * swing * 0.85;
          if (groundRing) {
            const mat = groundRing.material as THREE.MeshBasicMaterial;
            if (role === "teacher") {
              mat.color.setHex(s.selected ? 0xffffff : 0x4cf2a0);
              mat.opacity = s.selected ? 0.95 : 0.72;
            } else {
              mat.opacity = 0;
            }
          }
        }

        if (selectBeam) {
          selectBeam.visible = !!s.selected;
          if (s.selected) {
            const pulse = 1 + 0.12 * Math.sin(s.time * 7);
            selectBeam.scale.set(pulse, 1, pulse);
          }
        }
        if (followDot) {
          followDot.visible = !!s.followingPlayer;
          if (followDot.visible) followDot.position.y = 1.56 + Math.sin(s.time * 5 + s.phase) * 0.06;
        }
      }
    },
    dispose() {
      // Shared geometries & materials stay cached; dispose per-instance materials only
      if (muzzleFlash) (muzzleFlash.material as THREE.Material).dispose();
      if (groundRing) (groundRing.material as THREE.Material).dispose();
      if (selectBeam) (selectBeam.material as THREE.Material).dispose();
      if (followDot) (followDot.material as THREE.Material).dispose();
    },
  };

  return rig;
}
