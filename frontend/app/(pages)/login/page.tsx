"use client";

import React, { useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/* ─── 3D McQueen Model ───────────────────────────────────────── */
function McQueen({
  isDrifting,
  isReady,
  isExiting,
  carRef,
}: {
  isDrifting: boolean;
  isReady: boolean;
  isExiting: boolean;
  carRef: React.RefObject<THREE.Group | null>;
}) {
  const { nodes } = useGLTF("/lightning_mcqueen_3d_model.glb");

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
      carRef.current.position.x = THREE.MathUtils.damp(carRef.current.position.x, -25, 2, delta);
      carRef.current.position.z = THREE.MathUtils.damp(carRef.current.position.z, 5, 1.5, delta);
      carRef.current.rotation.y = THREE.MathUtils.damp(carRef.current.rotation.y, -1.8, 2, delta);
      carRef.current.rotation.x = THREE.MathUtils.damp(carRef.current.rotation.x, 0.05, 2, delta);
      carRef.current.rotation.z = THREE.MathUtils.damp(carRef.current.rotation.z, 0, 2, delta);
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

  // Auth state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Animation sequence timers — matches the original exactly
  useEffect(() => {
    const t1 = setTimeout(() => setAnimState("zoomin"), 400);
    const t2 = setTimeout(() => setAnimState("drift"), 2200);
    const t3 = setTimeout(() => setAnimState("exit"), 4000);
    const t4 = setTimeout(() => setAnimState("login"), 4200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

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
        return;
      }

      const supabase = createClient();
      const { error: clientErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (clientErr) {
        setError(clientErr.message);
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Failed to connect. Please try again.");
    } finally {
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

      {/* 3D Canvas */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <Canvas camera={{ position: [0, 0, 10], fov: 45 }} dpr={[1, 1.5]} performance={{ min: 0.5 }}>
          <ambientLight intensity={1.5} />
          <directionalLight position={[10, 10, 10]} intensity={2} />
          <directionalLight position={[-10, 5, -10]} intensity={1} color="#e11d48" />

          <React.Suspense fallback={null}>
            <CameraRig isDrifting={isDrifting} isExiting={isExiting} />
            <McQueen isDrifting={isDrifting} isReady={isReady} isExiting={isExiting} carRef={carRef} />
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
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
          >
            <motion.div
              className="login-card"
              initial={{ y: 50, scale: 0.9, rotateX: 20 }}
              animate={{ y: 0, scale: 1, rotateX: 0 }}
              transition={{ duration: 0.8, type: "spring" }}
            >
              <h1 className="racing-font login-title-number">95</h1>
              <h2 className="racing-font login-title-text">Pixtopia</h2>
              <p className="login-subtitle">Official Team Authentication</p>

              <form onSubmit={handleLogin} className="login-form">
                {error && (
                  <div className="login-error">{error}</div>
                )}

                <div className="login-field">
                  <label className="login-label">Leader Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="leader@example.com"
                    className="login-input"
                  />
                </div>
                <div className="login-field">
                  <label className="login-label">Team Password</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="login-input"
                  />
                </div>
                <button
                  type="submit"
                  id="login-btn"
                  disabled={loading}
                  className="btn-race login-button racing-font"
                >
                  {loading ? "Signing in…" : "Enter Race"}
                </button>
                <div className="login-links">
                  <a href="#" className="login-link login-link--red">
                    Recover Key
                  </a>
                  <a href="#" className="login-link login-link--amber">
                    Technical Support
                  </a>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
