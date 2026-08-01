import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

export default function Background3D() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Scene Setup
    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(0x020813);
    scene.background = bgColor;
    scene.fog = new THREE.FogExp2(0x020813, 0.0022);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.z = 100;
    camera.position.y = 20;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    // ---- Particle field (brighter + bigger than before) ----
    const particleCount = 3200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount);

    const colorA = new THREE.Color(0x27e6ff); // Bright Cyan
    const colorB = new THREE.Color(0x2266ff); // Deep Blue

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 700;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 700;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 700;

      const mixedColor = colorA.clone().lerp(colorB, Math.random());
      colors[i * 3] = mixedColor.r;
      colors[i * 3 + 1] = mixedColor.g;
      colors[i * 3 + 2] = mixedColor.b;

      speeds[i] = Math.random() * 0.02 + 0.005;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        uniform float uTime;
        attribute vec3 color;
        attribute float aSpeed;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec3 pos = position;
          pos.y += mod(uTime * aSpeed * 150.0, 700.0) - 350.0;
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = (3.5 + sin(uTime * aSpeed * 10.0) * 1.4) * (180.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 xy = gl_PointCoord.xy - vec2(0.5);
          float ll = length(xy);
          if (ll > 0.5) discard;
          float alpha = pow(1.0 - (ll * 2.0), 1.5) * 0.85;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particles = new THREE.Points(geometry, material);
    mainGroup.add(particles);

    // ---- Rotating wireframe globe (signature centerpiece, sits behind the voice orb) ----
    const globeGeo = new THREE.IcosahedronGeometry(140, 2);
    const globeMat = new THREE.MeshBasicMaterial({
      color: 0x1fb8ff,
      wireframe: true,
      transparent: true,
      opacity: 0.10,
    });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    mainGroup.add(globe);

    const globeGeo2 = new THREE.IcosahedronGeometry(180, 1);
    const globeMat2 = new THREE.MeshBasicMaterial({
      color: 0x00ffe1,
      wireframe: true,
      transparent: true,
      opacity: 0.05,
    });
    const globe2 = new THREE.Mesh(globeGeo2, globeMat2);
    mainGroup.add(globe2);

    // ---- Multiple concentric HUD rings ----
    const rings = [];
    const ringDefs = [
      { r1: 150, r2: 151.4, color: 0x00dcff, opacity: 0.12, tiltX: Math.PI / 2, speed: -0.05 },
      { r1: 210, r2: 210.8, color: 0x27e6ff, opacity: 0.08, tiltX: Math.PI / 2.3, speed: 0.03 },
      { r1: 260, r2: 261.6, color: 0x0088ff, opacity: 0.06, tiltX: Math.PI / 1.8, speed: -0.02 },
    ];
    ringDefs.forEach((def) => {
      const ringGeo = new THREE.RingGeometry(def.r1, def.r2, 96);
      const ringMat = new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: def.opacity,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = def.tiltX;
      ring.userData.speed = def.speed;
      mainGroup.add(ring);
      rings.push(ring);
    });

    // ---- Tron-style perspective grid floor ----
    const gridSize = 800;
    const gridDivisions = 40;
    const grid = new THREE.GridHelper(gridSize, gridDivisions, 0x1fb8ff, 0x0a3a55);
    grid.position.y = -140;
    grid.material.transparent = true;
    grid.material.opacity = 0.18;
    mainGroup.add(grid);

    // Animation Loop
    let raf;
    const clock = new THREE.Clock();

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      material.uniforms.uTime.value = t;

      particles.rotation.y = t * 0.03;
      particles.rotation.x = t * 0.01;

      globe.rotation.y = t * 0.04;
      globe.rotation.x = t * 0.015;
      globe2.rotation.y = -t * 0.025;
      globe2.rotation.x = t * 0.01;

      rings.forEach((ring) => {
        ring.rotation.z = t * ring.userData.speed;
      });

      grid.position.z = (t * 12) % (gridSize / gridDivisions);

      camera.position.x = Math.sin(t * 0.2) * 15;
      camera.position.y = 20 + Math.cos(t * 0.15) * 10;
      camera.lookAt(0, 0, 0);

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
      geometry.dispose();
      material.dispose();
      globeGeo.dispose();
      globeMat.dispose();
      globeGeo2.dispose();
      globeMat2.dispose();
      rings.forEach((ring) => {
        ring.geometry.dispose();
        ring.material.dispose();
      });
      grid.geometry.dispose();
      grid.material.dispose();
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
