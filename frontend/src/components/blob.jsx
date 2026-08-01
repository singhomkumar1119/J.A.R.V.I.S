import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const noiseFunctions = `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  float fbm(vec3 p){float total=0.0;float amplitude=0.5;float frequency=1.0;
    for(int i=0;i<3;i++){total+=snoise(p*frequency)*amplitude;amplitude*=0.5;frequency*=2.0;}
    return total;}
`;

export default function VoiceBlob({ config, setConfig, isDragging }) {
  const mountRef = useRef(null);
  const configRef = useRef(config);
  const controlsRef = useRef(null);
  
  // Dragging state stored in refs for window-level listeners
  const positionRef = useRef(config.position);
  const [position, setPosition] = useState(config.position);
  const [isDraggingNow, setIsDraggingNow] = useState(false);
  const isDraggingNowRef = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Keep configRef in sync
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Sync position when config changes (not during active drag)
  useEffect(() => {
    if (!isDraggingNowRef.current && config.position) {
      setPosition(config.position);
      positionRef.current = config.position;
    }
  }, [config.position]);

  // Disable OrbitControls when drag mode is active
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enabled = !isDragging;
    }
  }, [isDragging]);

  // Window-level pointer move and up handlers for reliable dragging
  const handleWindowPointerMove = useCallback((e) => {
    if (!isDraggingNowRef.current) return;
    e.preventDefault();
    const newX = e.clientX - dragOffset.current.x;
    const newY = e.clientY - dragOffset.current.y;
    positionRef.current = { x: newX, y: newY };
    setPosition({ x: newX, y: newY });
  }, []);

  const handleWindowPointerUp = useCallback((e) => {
    if (!isDraggingNowRef.current) return;
    isDraggingNowRef.current = false;
    setIsDraggingNow(false);
    setConfig(prev => ({ ...prev, position: positionRef.current }));
    window.removeEventListener('pointermove', handleWindowPointerMove);
    window.removeEventListener('pointerup', handleWindowPointerUp);
  }, [handleWindowPointerMove, setConfig]);

  const handlePointerDown = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    isDraggingNowRef.current = true;
    setIsDraggingNow(true);
    dragOffset.current = {
      x: e.clientX - positionRef.current.x,
      y: e.clientY - positionRef.current.y
    };
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
  };

  // Cleanup window listeners on unmount
  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [handleWindowPointerMove, handleWindowPointerUp]);

  useEffect(() => {
    const mount = mountRef.current;
    const params = {
      timeScale: 1.2, plasmaScale: 0.2, plasmaBrightness: 1.31, voidThreshold: 0.09,
      colorDeep: 0x001433, colorMid: 0x0084ff, colorBright: 0x00ffe1,
      shellColor: 0x0066ff, shellOpacity: 0.41,
    };

    const scene = new THREE.Scene();
    
    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.z = 3.2;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.5;
    controls.maxDistance = 20;
    controls.enabled = !isDragging;
    controlsRef.current = controls;

    const mainGroup = new THREE.Group();
    scene.add(mainGroup);
    mainGroup.add(new THREE.PointLight(0x0088ff, 2.0, 10));

    // Shell
    const shellGeo = new THREE.SphereGeometry(1.0, 64, 64);
    const shellShader = {
      vertexShader: `varying vec3 vNormal;varying vec3 vViewPosition;
        void main(){vNormal=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vViewPosition=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying vec3 vNormal;varying vec3 vViewPosition;uniform vec3 uColor;uniform float uOpacity;
        void main(){float f=pow(1.0-dot(normalize(vNormal),normalize(vViewPosition)),2.5);gl_FragColor=vec4(uColor,f*uOpacity);}`,
    };
    const shellBackMat = new THREE.ShaderMaterial({
      ...shellShader,
      uniforms: { uColor: { value: new THREE.Color(0x000055) }, uOpacity: { value: 0.3 } },
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
    });
    const shellFrontMat = new THREE.ShaderMaterial({
      ...shellShader,
      uniforms: { uColor: { value: new THREE.Color(params.shellColor) }, uOpacity: { value: params.shellOpacity } },
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.FrontSide, depthWrite: false,
    });
    mainGroup.add(new THREE.Mesh(shellGeo, shellBackMat));
    mainGroup.add(new THREE.Mesh(shellGeo, shellFrontMat));

    // Plasma
    const plasmaGeo = new THREE.SphereGeometry(0.998, 128, 128);
    const plasmaMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uScale: { value: params.plasmaScale },
        uBrightness: { value: params.plasmaBrightness }, uThreshold: { value: params.voidThreshold },
        uColorDeep: { value: new THREE.Color(params.colorDeep) },
        uColorMid: { value: new THREE.Color(params.colorMid) },
        uColorBright: { value: new THREE.Color(params.colorBright) },
      },
      vertexShader: `varying vec3 vPosition;varying vec3 vNormal;varying vec3 vViewPosition;
        void main(){vPosition=position;vNormal=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vViewPosition=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `
        uniform float uTime;uniform float uScale;uniform float uBrightness;uniform float uThreshold;
        uniform vec3 uColorDeep;uniform vec3 uColorMid;uniform vec3 uColorBright;
        varying vec3 vPosition;varying vec3 vNormal;varying vec3 vViewPosition;
        ${noiseFunctions}
        void main(){
          vec3 p=vPosition*uScale;
          vec3 q=vec3(fbm(p+vec3(0.0,uTime*0.05,0.0)),fbm(p+vec3(5.2,1.3,2.8)+uTime*0.05),fbm(p+vec3(2.2,8.4,0.5)-uTime*0.02));
          float density=fbm(p+2.0*q);float t=(density+0.4)*0.8;float alpha=smoothstep(uThreshold,0.7,t);
          vec3 cWhite=vec3(1.0);
          vec3 color=mix(uColorDeep,uColorMid,smoothstep(uThreshold,0.5,t));
          color=mix(color,uColorBright,smoothstep(0.5,0.8,t));
          color=mix(color,cWhite,smoothstep(0.8,1.0,t));
          float facing=dot(normalize(vNormal),normalize(vViewPosition));
          float depthFactor=(facing+1.0)*0.5;
          float finalAlpha=alpha*(0.02+0.98*depthFactor);
          gl_FragColor=vec4(color*uBrightness,finalAlpha);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    });
    const plasmaMesh = new THREE.Mesh(plasmaGeo, plasmaMat);
    mainGroup.add(plasmaMesh);

    // Particles
    const pCount = 600;
    const pPos = new Float32Array(pCount * 3);
    const pSizes = new Float32Array(pCount);
    const sphereRadius = 0.95;
    for (let i = 0; i < pCount; i++) {
      const r = sphereRadius * Math.cbrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pPos[i * 3 + 2] = r * Math.cos(phi);
      pSizes[i] = Math.random();
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSizes, 1));
    const pMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xffffff) } },
      vertexShader: `uniform float uTime;attribute float aSize;varying float vAlpha;
        void main(){vec3 pos=position;pos.y+=sin(uTime*0.2+pos.x)*0.02;pos.x+=cos(uTime*0.15+pos.z)*0.02;
        vec4 mv=modelViewMatrix*vec4(pos,1.0);gl_Position=projectionMatrix*mv;
        gl_PointSize=(8.0*aSize+4.0)*(1.0/-mv.z);vAlpha=0.8+0.2*sin(uTime+aSize*10.0);}`,
      fragmentShader: `uniform vec3 uColor;varying float vAlpha;
        void main(){vec2 uv=gl_PointCoord-vec2(0.5);float d=length(uv);if(d>0.5)discard;
        float g=pow(1.0-(d*2.0),1.8);gl_FragColor=vec4(uColor,g*vAlpha);}`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    mainGroup.add(new THREE.Points(pGeo, pMat));

    // --- MICROPHONE SETUP ---
    let analyser = null;
    let audioData = null;
    let audioCtx = null;
    let micStream = null;

    async function initMic() {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(micStream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioData = new Uint8Array(analyser.frequencyBinCount);
      } catch (e) {
        console.warn('Mic access denied or unavailable:', e);
      }
    }
    initMic();

    function getVolume() {
      if (!analyser) return 0;
      analyser.getByteFrequencyData(audioData);
      let sum = 0;
      for (let i = 0; i < audioData.length; i++) sum += audioData[i];
      return sum / audioData.length / 255;
    }

    // Animation
    const clock = new THREE.Clock();
    let currentScale = 1;
    let raf;
    function animate() {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      
      const currentConfig = configRef.current;

      // Color Updates
      const baseColor = new THREE.Color(currentConfig.color);
      plasmaMat.uniforms.uColorMid.value.copy(baseColor);
      plasmaMat.uniforms.uColorBright.value.copy(baseColor).offsetHSL(0, 0, 0.2);
      plasmaMat.uniforms.uColorDeep.value.copy(baseColor).offsetHSL(0, 0, -0.3);
      shellFrontMat.uniforms.uColor.value.copy(baseColor);
      
      // Voice-reactive scale + user size
      const vol = getVolume();
      const targetScale = (1 + vol * 0.8) * currentConfig.size; 
      currentScale += (targetScale - currentScale) * 0.15;
      mainGroup.scale.setScalar(currentScale);

      plasmaMat.uniforms.uBrightness.value = params.plasmaBrightness + vol * 1.5;
      plasmaMat.uniforms.uTime.value = t * params.timeScale;
      pMat.uniforms.uTime.value = t;
      plasmaMesh.rotation.y = t * 0.08;
      mainGroup.rotation.x += 0.002;
      mainGroup.rotation.y += 0.005;

      if (controls.enabled) {
        controls.update();
      }
      renderer.render(scene, camera);
    }
    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(raf);
      if (micStream) micStream.getTracks().forEach((tr) => tr.stop());
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
        pointerEvents: 'none'
      }}
    >
      <div
        ref={mountRef}
        onPointerDown={handlePointerDown}
        style={{ 
          width: '250px', 
          height: '250px', 
          overflow: 'hidden',
          borderRadius: '50%',
          pointerEvents: 'auto',
          cursor: isDragging ? (isDraggingNow ? 'grabbing' : 'grab') : 'default',
          border: isDragging ? '2px dashed #00ff88' : 'none',
          boxShadow: isDragging 
            ? '0 0 40px rgba(0, 255, 136, 0.4), inset 0 0 20px rgba(0, 255, 136, 0.2)' 
            : 'none',
          touchAction: 'none',
        }}
      >
      </div>
    </div>
  );
}
