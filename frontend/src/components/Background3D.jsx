import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

/* ──────────────────────────────────────────────────────────────
   Deep Space Warp — Cinematic Background for J.A.R.V.I.S.
   Features:
     1. Full-screen volumetric nebula (ray-marched fbm shader)
     2. Warp-speed starlines streaking past the camera
     3. Flowing particle energy streams
     4. Subtle aurora ribbons
     5. Cinematic slow camera drift
   ────────────────────────────────────────────────────────────── */

// ─── GLSL Noise helpers ────────────────────────────────────────
const glslNoise = `
  // --- Simplex 3D Noise ---
  vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}

  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0*floor(p*ns.z*ns.z);
    vec4 x_ = floor(j*ns.z);
    vec4 y_ = floor(j - 7.0*x_);
    vec4 x2_ = x_*ns.x + ns.yyyy;
    vec4 y2_ = y_*ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x2_) - abs(y2_);
    vec4 b0 = vec4(x2_.xy, y2_.xy);
    vec4 b1 = vec4(x2_.zw, y2_.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  float fbm(vec3 p) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 5; i++){
      val += snoise(p * freq) * amp;
      amp *= 0.5;
      freq *= 2.0;
    }
    return val;
  }
`;

export default function Background3D() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Use the actual container size (via ResizeObserver below) instead of
    // a one-time window.innerWidth/Height snapshot — mobile browsers
    // resize the visible viewport as the address bar shows/hides, and a
    // static snapshot drifts out of sync with that over time.
    const getSize = () => ({
      w: mount.clientWidth || window.innerWidth,
      h: mount.clientHeight || window.innerHeight,
    });
    const initialSize = getSize();

    // ─── Scene ───────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75, initialSize.w / initialSize.h, 0.1, 2000
    );
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(initialSize.w, initialSize.h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    mount.appendChild(renderer.domElement);

    // ═══════════════════════════════════════════════════════════
    // 1) VOLUMETRIC NEBULA — Full-screen quad with ray-marched fbm
    // ═══════════════════════════════════════════════════════════
    const nebulaGeo = new THREE.PlaneGeometry(2, 2);
    const nebulaMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(initialSize.w, initialSize.h) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec2 uResolution;
        varying vec2 vUv;

        ${glslNoise}

        void main() {
          vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);

          // Deep space base color
          vec3 deepSpace = vec3(0.008, 0.016, 0.045);

          // Nebula layer 1 — large slow-moving clouds
          vec3 p1 = vec3(uv * 1.8, uTime * 0.02);
          float n1 = fbm(p1 + vec3(0.0, uTime * 0.01, 0.0));
          n1 = smoothstep(-0.2, 0.8, n1);

          // Nebula layer 2 — smaller, faster wisps
          vec3 p2 = vec3(uv * 3.5, uTime * 0.035);
          float n2 = fbm(p2 + vec3(uTime * 0.015, 0.0, uTime * 0.01));
          n2 = smoothstep(0.0, 0.9, n2);

          // Nebula layer 3 — micro detail
          vec3 p3 = vec3(uv * 7.0, uTime * 0.05);
          float n3 = fbm(p3);
          n3 = smoothstep(0.1, 1.0, n3);

          // Color palette — cyan, blue, teal, with hints of violet
          vec3 colCyan   = vec3(0.0, 0.85, 1.0);
          vec3 colBlue   = vec3(0.0, 0.33, 1.0);
          vec3 colTeal   = vec3(0.0, 0.6, 0.7);
          vec3 colViolet = vec3(0.25, 0.05, 0.55);

          vec3 nebula = vec3(0.0);
          nebula += n1 * 0.15 * mix(colBlue, colCyan, n1);
          nebula += n2 * 0.08 * mix(colTeal, colViolet, n2);
          nebula += n3 * 0.04 * colCyan;

          // Radial vignette — darker at edges, brighter at center
          float vignette = 1.0 - smoothstep(0.0, 1.2, length(uv) * 0.9);
          nebula *= vignette;

          // Central glow — subtle light behind the blob
          float centerGlow = exp(-length(uv) * 2.5) * 0.12;
          nebula += centerGlow * colCyan;

          vec3 finalColor = deepSpace + nebula;

          // Very subtle film grain
          float grain = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.015;
          finalColor += grain;

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      depthWrite: false,
      depthTest: false,
    });
    const nebulaMesh = new THREE.Mesh(nebulaGeo, nebulaMat);
    nebulaMesh.frustumCulled = false;
    // Render first (background layer)
    nebulaMesh.renderOrder = -1000;
    scene.add(nebulaMesh);

    // ═══════════════════════════════════════════════════════════
    // 2) WARP STARLINES — Elongated particles streaking past camera
    // ═══════════════════════════════════════════════════════════
    const starCount = 1200;
    const starPositions = new Float32Array(starCount * 3);
    const starVelocities = new Float32Array(starCount);
    const starBrightness = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3]     = (Math.random() - 0.5) * 400;   // x
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 400;   // y
      starPositions[i * 3 + 2] = Math.random() * -800;           // z (behind camera)
      starVelocities[i] = Math.random() * 2.0 + 0.5;
      starBrightness[i] = Math.random() * 0.7 + 0.3;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('aVelocity', new THREE.BufferAttribute(starVelocities, 1));
    starGeo.setAttribute('aBrightness', new THREE.BufferAttribute(starBrightness, 1));

    const starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        uniform float uTime;
        attribute float aVelocity;
        attribute float aBrightness;
        varying float vBrightness;
        varying float vDepth;

        void main() {
          vBrightness = aBrightness;
          vec3 pos = position;

          // Warp motion — stars fly toward the camera
          pos.z = mod(pos.z + uTime * aVelocity * 80.0, 800.0) - 800.0;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          // Streaking effect — elongated point size based on depth
          float depth = clamp(-mvPosition.z / 200.0, 0.0, 1.0);
          vDepth = depth;
          gl_PointSize = (1.5 + depth * 3.0) * (200.0 / max(-mvPosition.z, 1.0));
        }
      `,
      fragmentShader: `
        varying float vBrightness;
        varying float vDepth;

        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          if(d > 0.5) discard;

          float glow = pow(1.0 - d * 2.0, 2.0);

          // Color: white core with cyan tint
          vec3 color = mix(vec3(0.5, 0.8, 1.0), vec3(1.0), glow);
          float alpha = glow * vBrightness * (0.3 + vDepth * 0.7);

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ═══════════════════════════════════════════════════════════
    // 3) PARTICLE ENERGY STREAMS — Flowing currents of energy
    // ═══════════════════════════════════════════════════════════
    const streamCount = 800;
    const streamPos = new Float32Array(streamCount * 3);
    const streamPhase = new Float32Array(streamCount);
    const streamSpeed = new Float32Array(streamCount);
    const streamSize = new Float32Array(streamCount);

    for (let i = 0; i < streamCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 20 + Math.random() * 180;
      streamPos[i * 3]     = Math.cos(angle) * radius;
      streamPos[i * 3 + 1] = (Math.random() - 0.5) * 150;
      streamPos[i * 3 + 2] = Math.sin(angle) * radius - 100;
      streamPhase[i] = Math.random() * Math.PI * 2;
      streamSpeed[i] = Math.random() * 0.8 + 0.2;
      streamSize[i] = Math.random() * 0.8 + 0.2;
    }

    const streamGeo = new THREE.BufferGeometry();
    streamGeo.setAttribute('position', new THREE.BufferAttribute(streamPos, 3));
    streamGeo.setAttribute('aPhase', new THREE.BufferAttribute(streamPhase, 1));
    streamGeo.setAttribute('aSpeed', new THREE.BufferAttribute(streamSpeed, 1));
    streamGeo.setAttribute('aSize', new THREE.BufferAttribute(streamSize, 1));

    const streamMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        uniform float uTime;
        attribute float aPhase;
        attribute float aSpeed;
        attribute float aSize;
        varying float vAlpha;
        varying vec3 vColor;

        void main() {
          vec3 pos = position;

          // Flowing spiral motion
          float t = uTime * aSpeed * 0.3 + aPhase;
          pos.x += sin(t) * 8.0;
          pos.y += cos(t * 0.7) * 5.0;
          pos.z += sin(t * 0.5) * 12.0;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = (aSize * 4.0 + 1.5) * (120.0 / max(-mvPosition.z, 1.0));

          // Pulse alpha
          vAlpha = (0.3 + 0.7 * abs(sin(t * 2.0))) * 0.5;

          // Color variation — cyan to teal
          float colorMix = sin(aPhase + uTime * 0.1) * 0.5 + 0.5;
          vColor = mix(vec3(0.0, 0.7, 0.9), vec3(0.0, 0.9, 0.7), colorMix);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;

        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          if(d > 0.5) discard;

          float glow = pow(1.0 - d * 2.0, 1.5);
          gl_FragColor = vec4(vColor, glow * vAlpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const streams = new THREE.Points(streamGeo, streamMat);
    scene.add(streams);

    // ═══════════════════════════════════════════════════════════
    // 4) AURORA RIBBONS — Curved light bands using custom geometry
    // ═══════════════════════════════════════════════════════════
    const ribbonCount = 3;
    const ribbons = [];

    for (let r = 0; r < ribbonCount; r++) {
      const segments = 120;
      const ribbonGeo = new THREE.PlaneGeometry(400, 15, segments, 1);
      const ribbonMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uOffset: { value: r * 2.1 },
          uColor1: { value: new THREE.Color(r === 0 ? 0x00ccff : r === 1 ? 0x0066ff : 0x00ffcc) },
          uColor2: { value: new THREE.Color(r === 0 ? 0x0033aa : r === 1 ? 0x220066 : 0x006644) },
        },
        vertexShader: `
          uniform float uTime;
          uniform float uOffset;
          varying vec2 vUv;
          varying float vWave;

          ${glslNoise}

          void main() {
            vUv = uv;
            vec3 pos = position;

            // Undulating wave
            float wave = sin(pos.x * 0.015 + uTime * 0.3 + uOffset) * 25.0;
            wave += cos(pos.x * 0.008 + uTime * 0.15 + uOffset * 1.5) * 40.0;
            wave += snoise(vec3(pos.x * 0.005, uTime * 0.08, uOffset)) * 20.0;
            pos.y += wave;
            pos.z = -150.0 - float(${r}) * 60.0;

            vWave = (wave + 60.0) / 120.0; // Normalize for color mixing

            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor1;
          uniform vec3 uColor2;
          uniform float uTime;
          varying vec2 vUv;
          varying float vWave;

          void main() {
            // Vertical fade — transparent at edges
            float edgeFade = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
            // Horizontal fade
            float hFade = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);

            vec3 color = mix(uColor1, uColor2, vWave);
            float alpha = edgeFade * hFade * 0.06;

            gl_FragColor = vec4(color, alpha);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
      ribbonMesh.position.y = -30 + r * 30;
      scene.add(ribbonMesh);
      ribbons.push(ribbonMesh);
    }

    // ═══════════════════════════════════════════════════════════
    // 5) CONCENTRIC HUD RINGS — Subtle rotating reference rings
    // ═══════════════════════════════════════════════════════════
    const ringGroup = new THREE.Group();
    const ringRadii = [60, 90, 130, 180];
    const ringOpacities = [0.04, 0.03, 0.025, 0.015];

    ringRadii.forEach((radius, idx) => {
      const rGeo = new THREE.RingGeometry(radius, radius + 0.5, 128);
      const rMat = new THREE.MeshBasicMaterial({
        color: 0x00ccff,
        transparent: true,
        opacity: ringOpacities[idx],
        side: THREE.DoubleSide,
      });
      const rMesh = new THREE.Mesh(rGeo, rMat);
      rMesh.rotation.x = Math.PI / 2 + (idx % 2 === 0 ? 0.1 : -0.1);
      rMesh.position.z = -100 - idx * 30;
      ringGroup.add(rMesh);
    });
    scene.add(ringGroup);

    // ═══════════════════════════════════════════════════════════
    // ANIMATION LOOP
    // ═══════════════════════════════════════════════════════════
    let raf;
    const clock = new THREE.Clock();

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Update all uniforms
      nebulaMat.uniforms.uTime.value = t;
      starMat.uniforms.uTime.value = t;
      streamMat.uniforms.uTime.value = t;

      ribbons.forEach(ribbon => {
        ribbon.material.uniforms.uTime.value = t;
      });

      // Rotate elements
      stars.rotation.z = t * 0.003;
      streams.rotation.y = t * 0.008;
      ringGroup.rotation.z = t * 0.01;
      ringGroup.rotation.y = t * 0.005;

      // Cinematic camera drift
      camera.position.x = Math.sin(t * 0.08) * 3;
      camera.position.y = Math.cos(t * 0.06) * 2;
      camera.lookAt(0, 0, -50);

      renderer.render(scene, camera);
    };
    animate();

    // ─── Resize ──────────────────────────────────────────────
    const handleResize = () => {
      const { w, h } = getSize();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      nebulaMat.uniforms.uResolution.value.set(w, h);
    };
    window.addEventListener('resize', handleResize);
    // ResizeObserver catches size changes that window 'resize' can miss,
    // e.g. mobile browser address bar hiding/showing.
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    // ─── Cleanup ─────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      starGeo.dispose(); starMat.dispose();
      streamGeo.dispose(); streamMat.dispose();
      nebulaGeo.dispose(); nebulaMat.dispose();
      ribbons.forEach(r => { r.geometry.dispose(); r.material.dispose(); });
      ringGroup.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); });
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
        pointerEvents: 'none',
      }}
    />
  );
}
