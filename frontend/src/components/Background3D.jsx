import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

/* ──────────────────────────────────────────────────────────────
   Lightweight Space Background for J.A.R.V.I.S.
   Performance-first rewrite: the previous version used a full-screen
   per-pixel ray-marched noise shader plus ~2000 particles and several
   noise-driven ribbon meshes, which caused real lag on mobile GPUs.
   This version gets a similar cinematic feel almost entirely from a
   CSS gradient (free — composited by the browser, not the GPU shader
   pipeline) plus a small, cheap starfield and a couple of simple
   rotating rings, with no per-pixel or per-vertex noise calculations.
   ────────────────────────────────────────────────────────────── */

export default function Background3D() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const getSize = () => ({
      w: mount.clientWidth || window.innerWidth,
      h: mount.clientHeight || window.innerHeight,
    });
    const initialSize = getSize();

    const scene = new THREE.Scene();
    // No scene.background color set here — the CSS gradient behind the
    // canvas (see the returned <div> style below) provides the nebula
    // look for free. The canvas itself stays transparent (alpha: true).

    const camera = new THREE.PerspectiveCamera(70, initialSize.w / initialSize.h, 0.1, 1000);
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(initialSize.w, initialSize.h);
    // Capping pixel ratio is one of the biggest single performance wins on
    // mobile — rendering at full devicePixelRatio (often 2.5-3x on phones)
    // multiplies fill-rate cost for very little visible sharpness gain.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    mount.appendChild(renderer.domElement);

    // ═══════════════════════════════════════════════════════════
    // STARFIELD — plain THREE.Points with the built-in PointsMaterial.
    // No custom shader: built-in materials are far cheaper since
    // Three.js/the GPU driver can optimize them heavily.
    // ═══════════════════════════════════════════════════════════
    const starCount = 500;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 300;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 300;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 300;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xc9a8ff,
      size: 1.1,
      transparent: true,
      opacity: 0.75,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // A second, sparser layer of slightly larger/brighter "foreground"
    // stars for a bit of depth, still cheap (built-in material).
    const brightStarCount = 60;
    const brightGeo = new THREE.BufferGeometry();
    const brightPositions = new Float32Array(brightStarCount * 3);
    for (let i = 0; i < brightStarCount; i++) {
      brightPositions[i * 3] = (Math.random() - 0.5) * 200;
      brightPositions[i * 3 + 1] = (Math.random() - 0.5) * 200;
      brightPositions[i * 3 + 2] = (Math.random() - 0.5) * 150;
    }
    brightGeo.setAttribute('position', new THREE.BufferAttribute(brightPositions, 3));
    const brightMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.2,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const brightStars = new THREE.Points(brightGeo, brightMat);
    scene.add(brightStars);

    // ═══════════════════════════════════════════════════════════
    // Two simple rotating rings — cheap MeshBasicMaterial, no shader.
    // ═══════════════════════════════════════════════════════════
    const ringDefs = [
      { radius: 90, color: 0x9333ea, opacity: 0.06, tiltX: Math.PI / 2.2, speed: 0.015 },
      { radius: 130, color: 0xec4899, opacity: 0.04, tiltX: Math.PI / 1.9, speed: -0.01 },
    ];
    const rings = ringDefs.map((def) => {
      const geo = new THREE.RingGeometry(def.radius, def.radius + 0.6, 64);
      const mat = new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: def.opacity,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = def.tiltX;
      mesh.position.z = -60;
      mesh.userData.speed = def.speed;
      scene.add(mesh);
      return mesh;
    });

    // ═══════════════════════════════════════════════════════════
    // ANIMATION LOOP — simple transforms only, no per-frame shader
    // uniform updates for noise/fbm.
    // ═══════════════════════════════════════════════════════════
    let raf;
    const clock = new THREE.Clock();

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      stars.rotation.y = t * 0.004;
      brightStars.rotation.y = t * 0.006;

      rings.forEach((ring) => {
        ring.rotation.z = t * ring.userData.speed;
      });

      camera.position.x = Math.sin(t * 0.06) * 1.2;
      camera.position.y = Math.cos(t * 0.05) * 0.8;
      camera.lookAt(0, 0, -20);

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const { w, h } = getSize();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      starGeo.dispose(); starMat.dispose();
      brightGeo.dispose(); brightMat.dispose();
      rings.forEach((r) => { r.geometry.dispose(); r.material.dispose(); });
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
        // No background color/gradient here — the animated .jarvis-morph-bg
        // layer in App.jsx handles that now. Keeping this transparent lets
        // the starfield/rings render on top of the morphing gradient.
        pointerEvents: 'none',
      }}
    />
  );
}
