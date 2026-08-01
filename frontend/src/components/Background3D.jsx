import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

export default function Background3D() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    
    // Scene Setup
    const scene = new THREE.Scene();
    // Deep sci-fi HUD background color
    const bgColor = new THREE.Color(0x020813);
    scene.background = bgColor;
    // Volumetric fog for depth
    scene.fog = new THREE.FogExp2(0x020813, 0.003);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.z = 100;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // optimize performance
    mount.appendChild(renderer.domElement);

    // Particle System (Holographic Dust)
    const particleCount = 2500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount);

    const colorA = new THREE.Color(0x00dcff); // Bright Cyan
    const colorB = new THREE.Color(0x0055ff); // Deep Blue

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 600;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 600;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 600;
      
      const mixedColor = colorA.clone().lerp(colorB, Math.random());
      colors[i * 3] = mixedColor.r;
      colors[i * 3 + 1] = mixedColor.g;
      colors[i * 3 + 2] = mixedColor.b;
      
      speeds[i] = Math.random() * 0.02 + 0.005;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

    // Custom shader material for glowing pulsing dots
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }
      },
      vertexShader: `
        uniform float uTime;
        attribute vec3 color;
        attribute float aSpeed;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec3 pos = position;
          // Float slowly upwards
          pos.y += mod(uTime * aSpeed * 150.0, 600.0) - 300.0;
          
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          // Size attenuation
          gl_PointSize = (2.5 + sin(uTime * aSpeed * 10.0) * 1.0) * (150.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          // Circular particle
          vec2 xy = gl_PointCoord.xy - vec2(0.5);
          float ll = length(xy);
          if(ll > 0.5) discard;
          
          // Soft edge glow
          float alpha = pow(1.0 - (ll * 2.0), 1.5) * 0.6;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);
    
    // Add a subtle rotating grid or ring for extra HUD aesthetics
    const ringGeo = new THREE.RingGeometry(150, 151, 64);
    const ringMat = new THREE.MeshBasicMaterial({ 
      color: 0x00dcff, 
      transparent: true, 
      opacity: 0.05,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);

    // Animation Loop
    let raf;
    const clock = new THREE.Clock();
    
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      material.uniforms.uTime.value = elapsedTime;

      // Slowly rotate the entire particle field
      particles.rotation.y = elapsedTime * 0.03;
      particles.rotation.x = elapsedTime * 0.01;
      
      // Ring rotation
      ring.rotation.z = elapsedTime * -0.05;

      // Subtle camera drifting
      camera.position.x = Math.sin(elapsedTime * 0.2) * 15;
      camera.position.y = Math.cos(elapsedTime * 0.15) * 10;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
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
      ringGeo.dispose();
      ringMat.dispose();
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
        pointerEvents: 'none' // Ensures we can still click the blob and UI over it
      }} 
    />
  );
}
