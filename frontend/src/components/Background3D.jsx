import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

// Builds a canvas texture for a segmented "reactor ring" — tick marks
// around the circumference, like a mechanical dial/gauge.
function buildSegmentedRingTexture(segments, color, gapRatio = 0.35) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR * 0.72;
  const anglePer = (Math.PI * 2) / segments;
  const gap = anglePer * gapRatio;

  ctx.fillStyle = color;
  for (let i = 0; i < segments; i++) {
    const start = i * anglePer + gap / 2;
    const end = (i + 1) * anglePer - gap / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, start, end);
    ctx.arc(cx, cy, innerR, end, start, true);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Radial glow texture for the pulsing reactor core — kept subtle so it
// doesn't wash out into a giant white flare.
function buildGlowTexture(hexColor) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `${hexColor}AA`);
  grad.addColorStop(0.3, `${hexColor}55`);
  grad.addColorStop(0.6, `${hexColor}18`);
  grad.addColorStop(1, `${hexColor}00`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export default function Background3D() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020813);
    scene.fog = new THREE.FogExp2(0x020813, 0.0018);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(0, 0, 105);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const reactorGroup = new THREE.Group();
    scene.add(reactorGroup);

    // ---- Faint starfield behind everything ----
    const starCount = 1400;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 900;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 900;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 900 - 200;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x2a6a8a,
      size: 1.1,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ---- Arc-reactor core glow (sits directly behind the voice orb) ----
    const glowTexture = buildGlowTexture('#27E6FF');
    const glowMat = new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.scale.set(26, 26, 1);
    reactorGroup.add(glowSprite);

    const glowTexture2 = buildGlowTexture('#8FF7FF');
    const innerGlowMat = new THREE.SpriteMaterial({
      map: glowTexture2,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerGlow = new THREE.Sprite(innerGlowMat);
    innerGlow.scale.set(12, 12, 1);
    reactorGroup.add(innerGlow);

    // ---- Concentric segmented reactor rings ----
    const ringDefs = [
      { radius: 14, segments: 12, color: '#8FF7FF', speed: 0.35, opacity: 0.95 },
      { radius: 18.5, segments: 18, color: '#27E6FF', speed: -0.22, opacity: 0.85 },
      { radius: 23.5, segments: 24, color: '#1FB8FF', speed: 0.15, opacity: 0.7 },
      { radius: 29, segments: 30, color: '#0E7FE0', speed: -0.1, opacity: 0.55 },
    ];

    const rings = ringDefs.map((def) => {
      const texture = buildSegmentedRingTexture(def.segments, def.color);
      const geo = new THREE.RingGeometry(def.radius * 0.86, def.radius, 128);
      // Map UVs radially so the segmented texture wraps around correctly.
      const uv = geo.attributes.uv;
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const angle = Math.atan2(y, x);
        const u = (angle + Math.PI) / (Math.PI * 2);
        uv.setXY(i, u, 0.5);
      }
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: def.opacity,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.speed = def.speed;
      reactorGroup.add(mesh);
      return mesh;
    });

    // ---- Thin bright hairline rings between the segmented ones ----
    const hairlineDefs = [16, 21, 26.3, 31.6];
    const hairlines = hairlineDefs.map((r, i) => {
      const geo = new THREE.RingGeometry(r, r + 0.25, 96);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x9ff9ff,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.speed = (i % 2 === 0 ? 1 : -1) * (0.05 + i * 0.02);
      reactorGroup.add(mesh);
      return mesh;
    });

    // ---- Radiating spokes connecting core to outer ring ----
    const spokeCount = 12;
    const spokeGroup = new THREE.Group();
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * Math.PI * 2;
      const points = [
        new THREE.Vector3(Math.cos(angle) * 12, Math.sin(angle) * 12, 0),
        new THREE.Vector3(Math.cos(angle) * 30, Math.sin(angle) * 30, 0),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: 0x1a4d66,
        transparent: true,
        opacity: 0.35,
      });
      spokeGroup.add(new THREE.Line(geo, mat));
    }
    reactorGroup.add(spokeGroup);

    // ---- Outer housing ring (static, like the reactor's metal casing) ----
    const housingGeo = new THREE.RingGeometry(31, 32.5, 128);
    const housingMat = new THREE.MeshBasicMaterial({
      color: 0x0a3a55,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const housing = new THREE.Mesh(housingGeo, housingMat);
    reactorGroup.add(housing);

    let raf;
    const clock = new THREE.Clock();

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      rings.forEach((ring) => {
        ring.rotation.z = t * ring.userData.speed;
      });
      hairlines.forEach((ring) => {
        ring.rotation.z = t * ring.userData.speed;
      });
      spokeGroup.rotation.z = t * 0.04;

      // Gentle pulse on the core glow, like the reactor is "breathing"
      const pulse = 1 + Math.sin(t * 1.6) * 0.08;
      glowSprite.scale.set(26 * pulse, 26 * pulse, 1);
      innerGlow.scale.set(12 * (1 + Math.sin(t * 2.2) * 0.12), 12 * (1 + Math.sin(t * 2.2) * 0.12), 1);

      stars.rotation.z = t * 0.005;

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      starGeo.dispose();
      starMat.dispose();
      glowTexture.dispose();
      glowTexture2.dispose();
      glowMat.dispose();
      innerGlowMat.dispose();
      rings.forEach((r) => { r.geometry.dispose(); r.material.map.dispose(); r.material.dispose(); });
      hairlines.forEach((r) => { r.geometry.dispose(); r.material.dispose(); });
      spokeGroup.children.forEach((l) => { l.geometry.dispose(); l.material.dispose(); });
      housingGeo.dispose();
      housingMat.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none'
      }}
    />
  );
}
