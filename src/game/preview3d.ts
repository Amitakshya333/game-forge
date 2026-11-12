import * as THREE from "three";
import { createCharacterRig } from "./models3d";

export class HeroPreview3D {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  raf = 0;
  disposed = false;
  time = 0;
  last = 0;
  hero = createCharacterRig("player");
  pedestal: THREE.Mesh;
  ring: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 30);
    this.camera.position.set(0, 1.35, 3.1);
    this.camera.lookAt(0, 0.78, 0);

    const amb = new THREE.AmbientLight(0x8aa4d6, 1.1);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2.5, 4, 3);
    const rim = new THREE.PointLight(0x27e0f0, 3.2, 8);
    rim.position.set(-1.8, 1.6, -1.5);
    const warm = new THREE.PointLight(0xffb020, 1.6, 8);
    warm.position.set(2, 1.2, 1);
    this.scene.add(amb, key, rim, warm);

    const pedGeo = new THREE.CylinderGeometry(0.68, 0.76, 0.14, 28);
    const pedMat = new THREE.MeshStandardMaterial({ color: 0x162138, metalness: 0.65, roughness: 0.35 });
    this.pedestal = new THREE.Mesh(pedGeo, pedMat);
    this.pedestal.position.y = -0.07;

    const ringGeo = new THREE.RingGeometry(0.7, 0.78, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x27e0f0, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.ring.position.y = 0.01;

    this.scene.add(this.pedestal, this.ring, this.hero.root);
    this.resize();
    window.addEventListener("resize", this.resize);
    this.raf = requestAnimationFrame(this.loop);
  }

  resize = () => {
    const r = this.renderer.domElement.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
  };

  loop = (t: number) => {
    if (this.disposed) return;
    const dt = Math.min(0.05, (t - (this.last || t)) / 1000);
    this.last = t;
    this.time += dt;

    this.hero.update(
      {
        x: 0,
        z: 0,
        facing: Math.PI / 2 - this.time * 0.75,
        moving: false,
        stance: "walk",
        speed: 0,
        time: this.time,
        phase: 0,
      },
      dt,
    );
    this.ring.scale.setScalar(1 + Math.sin(this.time * 3) * 0.04);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.hero.dispose();
    this.pedestal.geometry.dispose();
    (this.pedestal.material as THREE.Material).dispose();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
