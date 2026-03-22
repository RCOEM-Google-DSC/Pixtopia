"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/* ─── EVE 3D Model (roams / follows cursor) ─────────────── */
function Eve({ mousePos, isMouseIdle }: { mousePos: React.RefObject<{ x: number; y: number }>; isMouseIdle: boolean }) {
  const { scene } = useGLTF("/eve.glb");
  const clonedScene = React.useMemo(() => scene.clone(), [scene]);
  const groupRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();
  const scaleProgress = useRef(0); // starts at 0, animates to 1

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;

    // Smooth entrance — grow from 0 to full size
    scaleProgress.current = THREE.MathUtils.damp(scaleProgress.current, 1, 2, delta);
    const s = 15 * scaleProgress.current;
    groupRef.current.scale.set(s, s, s);

    let targetX: number;
    let targetY: number;

    if (isMouseIdle) {
      // Autonomous roaming — gentle figure-8, staying near center
      targetX = Math.sin(t * 0.3) * 3;
      targetY = Math.sin(t * 0.6) * 1.5;
    } else {
      // Follow cursor — map mouse (-1..1) to limited world coordinates
      targetX = (mousePos.current?.x ?? 0) * 4;
      targetY = (mousePos.current?.y ?? 0) * 2.5;
    }

    // Smooth damping
    const speed = isMouseIdle ? 1.5 : 3;
    groupRef.current.position.x = THREE.MathUtils.damp(groupRef.current.position.x, targetX, speed, delta);
    groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, targetY, speed, delta);

    // Face direction of movement (tilt)
    const dx = targetX - groupRef.current.position.x;
    groupRef.current.rotation.z = THREE.MathUtils.damp(groupRef.current.rotation.z, -dx * 0.08, 3, delta);
    groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, dx * 0.15, 3, delta);

    // Gentle floating bob
    groupRef.current.position.y += Math.sin(t * 2) * 0.01;
  });

  return (
    <group ref={groupRef} scale={0} position={[0, 0, 0]}>
      <primitive object={clonedScene} />
    </group>
  );
}

/* ─── 3D McQueen Model ───────────────────────────────────────── */
function McQueen({
  isDrifting,
  isReady,
  isExiting,
  carRef,
  onModelLoaded,
}: {
  isDrifting: boolean;
  isReady: boolean;
  isExiting: boolean;
  carRef: React.RefObject<THREE.Group | null>;
  onModelLoaded: () => void;
}) {
  const { nodes } = useGLTF("/lightning_mcqueen_3d_model.glb");

  // Signal that the model has loaded
  const hasSignaled = useRef(false);
  useEffect(() => {
    if (nodes && !hasSignaled.current) {
      hasSignaled.current = true;
      onModelLoaded();
    }
  }, [nodes, onModelLoaded]);

  useFrame((_state, delta) => {
    if (!carRef.current) return;

    if (!isReady) {
      carRef.current.position.set(0, -1, -15);
      carRef.current.rotation.set(0, 0, 0);
    } else if (isDrifting) {
      carRef.current.position.x = THREE.MathUtils.damp(carRef.current.position.x, -1.5, 2.2, delta);
      carRef.current.position.y = THREE.MathUtils.damp(carRef.current.position.y, -1, 2.2, delta);
      carRef.current.position.z = THREE.MathUtils.damp(carRef.current.position.z, 3.5, 2.2, delta);
      carRef.current.rotation.y = THREE.MathUtils.damp(carRef.current.rotation.y, -0.6, 2.5, delta);
      carRef.current.rotation.z = THREE.MathUtils.damp(carRef.current.rotation.z, 0.2, 2.5, delta);
      carRef.current.rotation.x = THREE.MathUtils.damp(carRef.current.rotation.x, 0.1, 2.5, delta);
    } else if (isExiting) {
      // Continue drift momentum — accelerate off-screen to the left, pulling away from camera
      carRef.current.position.x = THREE.MathUtils.damp(carRef.current.position.x, -30, 3.5, delta);
      carRef.current.position.y = THREE.MathUtils.damp(carRef.current.position.y, -1.2, 2, delta);
      carRef.current.position.z = THREE.MathUtils.damp(carRef.current.position.z, 0, 2.5, delta);
      carRef.current.rotation.y = THREE.MathUtils.damp(carRef.current.rotation.y, -1.2, 1.8, delta);
      carRef.current.rotation.x = THREE.MathUtils.damp(carRef.current.rotation.x, 0.05, 2, delta);
      carRef.current.rotation.z = THREE.MathUtils.damp(carRef.current.rotation.z, 0.1, 2, delta);
    } else {
      carRef.current.position.x = THREE.MathUtils.damp(carRef.current.position.x, 0, 2, delta);
      carRef.current.position.y = THREE.MathUtils.damp(carRef.current.position.y, -1, 2, delta);
      carRef.current.position.z = THREE.MathUtils.damp(carRef.current.position.z, -2, 2, delta);
      carRef.current.rotation.y = THREE.MathUtils.damp(carRef.current.rotation.y, 0, 2.5, delta);
      carRef.current.rotation.z = THREE.MathUtils.damp(carRef.current.rotation.z, 0, 2.5, delta);
      carRef.current.rotation.x = THREE.MathUtils.damp(carRef.current.rotation.x, 0, 2.5, delta);
    }
  });

  return (
    <group ref={carRef} dispose={null} scale={2}>
      <primitive object={nodes.Scene || nodes.RootNode || Object.values(nodes)[0]} />
    </group>
  );
}

/* ─── Cinematic Camera Rig ───────────────────────────────────── */
function CameraRig({ isDrifting, isExiting }: { isDrifting: boolean; isExiting: boolean }) {
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    let targetX = Math.sin(t * 0.3) * 0.15;
    let targetY = Math.cos(t * 0.25) * 0.1;
    let targetZ = 10;

    if (isDrifting) {
      targetX += Math.sin(t * 18) * 0.03;
      targetY += Math.cos(t * 22) * 0.03;
      targetZ = 11;
    } else if (isExiting) {
      targetX -= 0.8;
      targetZ = 11.5;
    }

    state.camera.position.x = THREE.MathUtils.damp(state.camera.position.x, targetX, 2, delta);
    state.camera.position.y = THREE.MathUtils.damp(state.camera.position.y, targetY, 2, delta);
    state.camera.position.z = THREE.MathUtils.damp(state.camera.position.z, targetZ, 2, delta);

    const lookAtTarget = new THREE.Vector3(isExiting ? -1.5 : 0, 0, 0);
    state.camera.lookAt(lookAtTarget);
  });
  return null;
}

/* ─── Smoke Particles ────────────────────────────────────────── */
function Smoke({
  isDrifting,
  carRef,
}: {
  isDrifting: boolean;
  carRef: React.RefObject<THREE.Group | null>;
}) {
  const count = 25;
  const particles = useRef<
    { position: THREE.Vector3; velocity: THREE.Vector3; scale: number; life: number }[]
  >([]);
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useRef(new THREE.Object3D());

  useEffect(() => {
    particles.current = Array.from({ length: count }, () => ({
      position: new THREE.Vector3(0, -1, 0),
      velocity: new THREE.Vector3(
        Math.random() * 2 + 1,
        Math.random() * 1,
        Math.random() * 1
      ),
      scale: 0,
      life: 0,
    }));
  }, []);

  useFrame((_state, delta) => {
    if (!instancedMeshRef.current) return;

    particles.current.forEach((particle, i) => {
      particle.position.x += particle.velocity.x * delta * 5;
      particle.position.y += particle.velocity.y * delta * 3;
      particle.scale += delta * 2;
      particle.life -= delta * 0.8;

      if (particle.life <= 0 && isDrifting) {
        const cx = carRef.current ? carRef.current.position.x : -1.5;
        const cy = carRef.current ? carRef.current.position.y : -1;
        const cz = carRef.current ? carRef.current.position.z : 3.5;

        particle.position.set(
          cx + (Math.random() * 2 - 1) * 1.5,
          cy + Math.random() * 1,
          cz + (Math.random() * 2 - 1) * 1.5
        );
        particle.scale = Math.random() * 0.5 + 0.5;
        particle.life = 1;
      } else if (particle.life <= 0) {
        particle.scale = 0;
      }

      dummy.current.position.copy(particle.position);
      dummy.current.scale.set(particle.scale, particle.scale, particle.scale);
      dummy.current.updateMatrix();
      instancedMeshRef.current!.setMatrixAt(i, dummy.current.matrix);
    });
    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={instancedMeshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshStandardMaterial color="#cccccc" transparent opacity={0.3} depthWrite={false} />
    </instancedMesh>
  );
}

/* ─── Speed Lines (CSS animated) ─────────────────────────────── */
function SpeedLines() {
  const [lines, setLines] = useState<{ id: number; top: number; dur: number; delay: number }[]>(
    []
  );

  useEffect(() => {
    const arr = [];
    for (let i = 0; i < 15; i++) {
      arr.push({
        id: i,
        top: Math.random() * 100,
        dur: Math.random() * 0.5 + 0.3,
        delay: Math.random() * 2,
      });
    }
    setLines(arr);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
      {lines.map((l) => (
        <div
          key={l.id}
          className="road-line"
          style={{
            top: `${l.top}vh`,
            animationDuration: `${l.dur}s`,
            animationDelay: `${l.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Main Login Page ────────────────────────────────────────── */
export default function LoginPage() {
  const [animState, setAnimState] = useState<"initial" | "zoomin" | "drift" | "exit" | "login">(
    "initial"
  );
  const carRef = useRef<THREE.Group>(null);
  const [modelLoaded, setModelLoaded] = useState(false);

  // Auth state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // EVE mouse tracking
  const mousePosRef = useRef({ x: 0, y: 0 });
  const [mouseIdle, setMouseIdle] = useState(true);
  const mouseIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleModelLoaded = useCallback(() => {
    setModelLoaded(true);
  }, []);

  // Animation sequence timers — only start AFTER the 3D model has loaded
  useEffect(() => {
    if (!modelLoaded) return;

    const t1 = setTimeout(() => setAnimState("zoomin"), 400);
    const t2 = setTimeout(() => setAnimState("drift"), 2200);
    const t3 = setTimeout(() => setAnimState("exit"), 4000);
    const t4 = setTimeout(() => setAnimState("login"), 5000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [modelLoaded]);

  const isDrifting = animState === "drift";
  const isExiting = animState === "exit" || animState === "login";
  const isReady = animState !== "initial";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Invalid login credentials");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { error: clientErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (clientErr) {
        setError(clientErr.message);
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      // Intentionally not setting loading to false so the UI stays in loading state during transition
    } catch {
      setError("Failed to connect. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: "#1a0505" }}>
      {/* Dark radial vignette */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background: "radial-gradient(circle at center, #1a0505 0%, #000 70%)",
          opacity: 0.8,
        }}
      />
      <SpeedLines />

      {/* 3D Canvas — fades in once model is loaded to avoid teleportation pop */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          opacity: modelLoaded ? 1 : 0,
          transition: "opacity 0.8s ease-in",
        }}
      >
        <Canvas camera={{ position: [0, 0, 10], fov: 45 }} dpr={[1, 1.5]} performance={{ min: 0.5 }}>
          <ambientLight intensity={1.5} />
          <directionalLight position={[10, 10, 10]} intensity={2} />
          <directionalLight position={[-10, 5, -10]} intensity={1} color="#e11d48" />

          <React.Suspense fallback={null}>
            <CameraRig isDrifting={isDrifting} isExiting={isExiting} />
            <McQueen isDrifting={isDrifting} isReady={isReady} isExiting={isExiting} carRef={carRef} onModelLoaded={handleModelLoaded} />
            <Smoke isDrifting={isDrifting} carRef={carRef} />
            <Environment preset="city" />
            <ContactShadows
              position={[0, -1, 0]}
              opacity={0.4}
              scale={20}
              blur={2.5}
              far={10}
              resolution={256}
              frames={1}
            />
          </React.Suspense>
        </Canvas>
      </div>

      {/* Login Overlay UI */}
      <AnimatePresence>
        {animState === "login" && (
          <motion.div
            className="absolute inset-0 z-50 flex items-center justify-center overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              mousePosRef.current = {
                x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
                y: -(((e.clientY - rect.top) / rect.height) * 2 - 1),
              };
              setMouseIdle(false);
              if (mouseIdleTimerRef.current) clearTimeout(mouseIdleTimerRef.current);
              mouseIdleTimerRef.current = setTimeout(() => setMouseIdle(true), 2000);
            }}
          >
            {/* Space background image */}
            <div className="absolute inset-0">
              <img
                alt=""
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-[120%] min-h-[120%] w-auto h-auto object-cover pointer-events-none"
                src="/login-bg.png"
              />
              {/* Dark overlay for depth */}
              <div className="absolute inset-0 bg-[#0a0a0f]/40" />
            </div>

            {/* Back Link - Top Right */}
            <a
              href="/"
              className="absolute top-4 right-4 md:top-8 md:right-12 flex items-center gap-2 z-20 hover:opacity-70 transition-opacity"
            >
              <div className="w-3.5 h-3.5">
                <svg className="block size-full" fill="none" viewBox="0 0 14 14">
                  <path d="M7 11.0833L2.91667 7L7 2.91667" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.16667" />
                  <path d="M11.0833 7H2.91667" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.16667" />
                </svg>
              </div>
              <span className="text-[10px] md:text-[12.8px] text-white tracking-[1.28px]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>BACK</span>
            </a>

            {/* EVE 3D floating behind the form */}
            <div className="absolute inset-0 z-[15] pointer-events-none">
              <Canvas camera={{ position: [0, 0, 8], fov: 50 }} dpr={[1, 1.5]} style={{ pointerEvents: 'none' }} eventSource={undefined as unknown as HTMLElement}>
                <ambientLight intensity={1.2} />
                <directionalLight position={[5, 5, 5]} intensity={1.5} />
                <directionalLight position={[-5, 3, -5]} intensity={0.8} color="#a78bfa" />
                <React.Suspense fallback={null}>
                  <Eve mousePos={mousePosRef} isMouseIdle={mouseIdle} />
                  <Environment preset="city" />
                </React.Suspense>
              </Canvas>
            </div>

            {/* Main Content */}
            <motion.div
              className="relative z-10 w-full max-w-[90vw] md:max-w-[555px] px-4 flex flex-col items-center"
              initial={{ y: 50, scale: 0.9 }}
              animate={{ y: 0, scale: 1 }}
              transition={{ duration: 0.8, type: "spring" }}
            >
              {/* PIXTOPIA Logo */}
              <div className="w-full max-w-[280px] sm:max-w-[350px] md:max-w-[437px] mb-6 md:mb-8">
                <svg className="w-full h-auto" fill="none" preserveAspectRatio="xMidYMid meet" viewBox="0 0 440.264 121">
                  <g>
                    <path d="M1.5 3.13889H28.0023C36.9454 3.13889 43.6528 5.54259 48.1244 10.35C52.596 15.1574 54.8317 22.2046 54.8317 31.4917V42.8C54.8317 52.087 52.596 59.1343 48.1244 63.9417C43.6528 68.7491 36.9454 71.1528 28.0023 71.1528H19.4954V117.861H1.5V3.13889ZM28.0023 54.7639C30.947 54.7639 33.1282 53.9444 34.5461 52.3056C36.0729 50.6667 36.8364 47.8806 36.8364 43.9472V30.3444C36.8364 26.4111 36.0729 23.625 34.5461 21.9861C33.1282 20.3472 30.947 19.5278 28.0023 19.5278H19.4954V54.7639H28.0023Z" fill="white" stroke="white" strokeWidth="3" />
                    <path d="M64.6052 3.13889H82.6006V117.861H64.6052V3.13889Z" fill="white" stroke="white" strokeWidth="3" />
                    <path d="M111.947 59.1889L92.1517 3.13889H111.129L123.235 40.1778H123.562L135.995 3.13889H153.009L133.214 59.1889L153.99 117.861H135.013L121.926 77.8722H121.599L108.184 117.861H91.1701L111.947 59.1889Z" fill="white" stroke="white" strokeWidth="3" />
                    <path d="M176.607 19.5278H157.794V3.13889H213.416V19.5278H194.603V117.861H176.607V19.5278Z" fill="white" stroke="white" strokeWidth="3" />
                    <path d="M247.501 119.5C238.667 119.5 231.905 116.987 227.215 111.961C222.526 106.935 220.181 99.8333 220.181 90.6556V30.3444C220.181 21.1667 222.526 14.0648 227.215 9.03889C231.905 4.01296 238.667 1.5 247.501 1.5C256.335 1.5 263.097 4.01296 267.787 9.03889C272.476 14.0648 274.821 21.1667 274.821 30.3444V90.6556C274.821 99.8333 272.476 106.935 267.787 111.961C263.097 116.987 256.335 119.5 247.501 119.5ZM247.501 103.111C253.718 103.111 256.826 99.3417 256.826 91.8028V29.1972C256.826 21.6583 253.718 17.8889 247.501 17.8889C241.285 17.8889 238.176 21.6583 238.176 29.1972V91.8028C238.176 99.3417 241.285 103.111 247.501 103.111Z" fill="white" stroke="white" strokeWidth="3" />
                    <path d="M286.991 3.13889H313.494C322.437 3.13889 329.144 5.54259 333.616 10.35C338.087 15.1574 340.323 22.2046 340.323 31.4917V42.8C340.323 52.087 338.087 59.1343 333.616 63.9417C329.144 68.7491 322.437 71.1528 313.494 71.1528H304.987V117.861H286.991V3.13889ZM313.494 54.7639C316.438 54.7639 318.619 53.9444 320.037 52.3056C321.564 50.6667 322.328 47.8806 322.328 43.9472V30.3444C322.328 26.4111 321.564 23.625 320.037 21.9861C318.619 20.3472 316.438 19.5278 313.494 19.5278H304.987V54.7639H313.494Z" fill="white" stroke="white" strokeWidth="3" />
                    <path d="M350.096 3.13889H368.092V117.861H350.096V3.13889Z" fill="white" stroke="white" strokeWidth="3" />
                    <path d="M395.475 3.13889H419.85L438.5 117.861H420.505L417.233 95.0806V95.4083H396.783L393.512 117.861H376.825L395.475 3.13889ZM415.106 79.8389L407.09 23.1333H406.763L398.91 79.8389H415.106Z" fill="white" stroke="white" strokeWidth="3" />
                  </g>
                </svg>
              </div>

              {/* Authentication Form Container */}
              <div className="bg-[rgba(0,0,0,0.55)] border border-solid border-white rounded-[20px] md:rounded-[27px] w-full max-w-[555px] p-6 sm:p-8 md:p-12 backdrop-blur-sm">
                {/* Title */}
                <h1
                  className="text-[20px] sm:text-[28px] md:text-[36px] text-center text-white tracking-[0.1em] leading-tight mb-6 md:mb-8 font-medium"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Authenticate to &ldquo;Enter the World&rdquo;
                </h1>

                <form onSubmit={handleLogin} className="flex flex-col gap-0">
                  {error && (
                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm text-center">
                      {error}
                    </div>
                  )}

                  {/* Email Input */}
                  <div className="mb-4 md:mb-6">
                    <label
                      className="text-[14px] sm:text-[18px] md:text-[24px] text-white tracking-[0.1em] block mb-2 font-medium"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      Enter Leader&apos;s Email:
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="leader@example.com"
                      className="w-full backdrop-blur-sm bg-[rgba(255,255,255,0.06)] border border-solid border-white rounded-[8px] h-[45px] md:h-[56px] px-4 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                    />
                  </div>

                  {/* Password Input */}
                  <div className="mb-6 md:mb-8">
                    <label
                      className="text-[14px] sm:text-[18px] md:text-[24px] text-white tracking-[0.1em] block mb-2 font-medium"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      Password:
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full backdrop-blur-sm bg-[rgba(255,255,255,0.06)] border border-solid border-white rounded-[8px] h-[45px] md:h-[56px] px-4 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    id="login-btn"
                    disabled={loading}
                    className="w-full bg-white border border-solid border-white rounded-[8px] h-[45px] md:h-[51px] text-[16px] sm:text-[20px] md:text-[24px] text-black tracking-[0.1em] hover:bg-gray-100 transition-colors disabled:opacity-50 font-medium"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {loading ? "Signing in…" : "Submit"}
                  </button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
