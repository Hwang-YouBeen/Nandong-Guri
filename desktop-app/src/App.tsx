import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { disable, enable } from "@tauri-apps/plugin-autostart";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import "./App.css";

type Settings = {
  soundEnabled: boolean;
  systemNotifications: boolean;
  raccoonScale: number;
  launchAtLogin: boolean;
  emergencyShortcut: string;
};

type CompletionEvent = {
  service: string;
  url: string;
  title?: string;
  alreadyViewing: boolean;
};

const defaults: Settings = {
  soundEnabled: true,
  systemNotifications: true,
  raccoonScale: 1,
  launchAtLogin: false,
  emergencyShortcut: "CommandOrControl+Shift+G",
};

function playChaosSound() {
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const now = context.currentTime;
  const duration = 1.35;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-18, now);
  compressor.knee.setValueAtTime(18, now);
  compressor.ratio.setValueAtTime(10, now);
  compressor.attack.setValueAtTime(0.002, now);
  compressor.release.setValueAtTime(0.45, now);
  compressor.connect(context.destination);

  const noiseBuffer = context.createBuffer(
    1,
    Math.floor(context.sampleRate * duration),
    context.sampleRate,
  );
  const noise = noiseBuffer.getChannelData(0);
  for (let index = 0; index < noise.length; index += 1) {
    const progress = index / noise.length;
    const impact = Math.exp(-progress * 7.5);
    const rumble = Math.pow(1 - progress, 1.7) * 0.42;
    noise[index] = (Math.random() * 2 - 1) * (impact + rumble);
  }

  const blast = context.createBufferSource();
  blast.buffer = noiseBuffer;
  const blastFilter = context.createBiquadFilter();
  blastFilter.type = "lowpass";
  blastFilter.frequency.setValueAtTime(2200, now);
  blastFilter.frequency.exponentialRampToValueAtTime(120, now + duration);
  const blastGain = context.createGain();
  blastGain.gain.setValueAtTime(0.0001, now);
  blastGain.gain.exponentialRampToValueAtTime(0.68, now + 0.006);
  blastGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  blast.connect(blastFilter).connect(blastGain).connect(compressor);

  const boom = context.createOscillator();
  const boomGain = context.createGain();
  boom.type = "sine";
  boom.frequency.setValueAtTime(92, now);
  boom.frequency.exponentialRampToValueAtTime(24, now + 0.9);
  boomGain.gain.setValueAtTime(0.72, now);
  boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);
  boom.connect(boomGain).connect(compressor);

  const crack = context.createOscillator();
  const crackGain = context.createGain();
  crack.type = "square";
  crack.frequency.setValueAtTime(620, now);
  crack.frequency.exponentialRampToValueAtTime(78, now + 0.075);
  crackGain.gain.setValueAtTime(0.28, now);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
  crack.connect(crackGain).connect(compressor);

  blast.start(now);
  boom.start(now);
  crack.start(now);
  blast.stop(now + duration);
  boom.stop(now + 1.08);
  crack.stop(now + 0.12);
  window.setTimeout(() => context.close().catch(() => {}), (duration + 0.3) * 1000);
}

function RaccoonOverlay() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [stage, setStage] = useState(0);
  const [event, setEvent] = useState<CompletionEvent | null>(null);
  const [settings, setSettings] = useState(defaults);
  const stageRef = useRef(0);
  const activeRef = useRef(false);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Map<string, THREE.AnimationAction>>(new Map());
  const currentAction = useRef<THREE.AnimationAction | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const baseScaleRef = useRef(1);
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState(false);
  const [hoveringRaccoon, setHoveringRaccoon] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("overlay-document");
    return () => document.documentElement.classList.remove("overlay-document");
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("nandong-guri-settings");
    if (stored) {
      try {
        const next = { ...defaults, ...JSON.parse(stored) } as Settings;
        setSettings(next);
        invoke("save_settings", { settings: next }).catch(() => {});
      } catch {
        invoke<Settings>("get_settings").then(setSettings).catch(() => {});
      }
    } else {
      invoke<Settings>("get_settings").then(setSettings).catch(() => {});
    }
    const unlistenComplete = listen<CompletionEvent>(
      "ai-answer-complete",
      ({ payload }) => {
        setEvent(payload);
        setStage(0);
        stageRef.current = 0;
        setActive(true);
        activeRef.current = true;
      },
    );
    const unlistenDismiss = listen("raccoon-dismiss", () => {
      setActive(false);
      activeRef.current = false;
    });
    const unlistenSettings = listen<Settings>("settings-updated", ({ payload }) =>
      setSettings(payload),
    );
    return () => {
      unlistenComplete.then((fn) => fn());
      unlistenDismiss.then((fn) => fn());
      unlistenSettings.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    if (settings.soundEnabled) playChaosSound();
    if (event?.alreadyViewing) {
      const timeout = window.setTimeout(
        () => invoke("dismiss_raccoon").catch(() => {}),
        5000,
      );
      return () => window.clearTimeout(timeout);
    }
    const interval = window.setInterval(() => {
      setStage((value) => {
        const next = Math.min(3, value + 1);
        stageRef.current = next;
        if (next >= 2) invoke("move_to_next_monitor").catch(() => {});
        return next;
      });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [active, event, settings.soundEnabled]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 5.2);
    cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    mount.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x303040, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xd96932, 0.8);
    rim.position.set(4, 2, -2);
    scene.add(rim);

    const loader = new GLTFLoader();
    loader.load(
      "/assets/models/nandong-guri.glb",
      (gltf) => {
        const model = gltf.scene;
        const sourceBox = new THREE.Box3().setFromObject(model);
        const sourceSize = sourceBox.getSize(new THREE.Vector3());
        const normalizedScale = sourceSize.y > 0 ? 0.275 / sourceSize.y : 1;
        baseScaleRef.current = normalizedScale;
        model.scale.setScalar(normalizedScale * settings.raccoonScale);

        const textureLoader = new THREE.TextureLoader();
        const colorTexture = textureLoader.load("/assets/models/raccoon-color.jpg");
        colorTexture.colorSpace = THREE.SRGBColorSpace;
        colorTexture.flipY = false;
        colorTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        const normalTexture = textureLoader.load("/assets/models/raccoon-normal.jpg");
        normalTexture.flipY = false;
        normalTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          object.material = materials.map((sourceMaterial) => {
            const material = sourceMaterial.clone() as THREE.MeshStandardMaterial;
            material.map = colorTexture;
            material.normalMap = normalTexture;
            material.metalness = 0;
            material.roughness = 0.72;
            material.needsUpdate = true;
            return material;
          });
          if (object.material.length === 1) object.material = object.material[0];
        });

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        scene.add(model);
        modelRef.current = model;

        const rootNames = model.children.map((child) => child.name).filter(Boolean);
        gltf.animations.forEach((clip) => {
          clip.tracks = clip.tracks.filter(
            (track) => !rootNames.some((name) => track.name === `${name}.position`),
          );
        });
        const mixer = new THREE.AnimationMixer(model);
        mixerRef.current = mixer;
        gltf.animations.forEach((clip) => {
          actionsRef.current.set(clip.name, mixer.clipAction(clip));
        });
        const idle = actionsRef.current.get("Idle") ?? actionsRef.current.values().next().value;
        idle?.reset().play();
        currentAction.current = idle ?? null;
        setModelError(false);
        setModelReady(true);
      },
      undefined,
      (error) => {
        console.error("난동구리 3D 모델 로딩 실패", error);
        setModelError(true);
        setModelReady(false);
      },
    );

    const clock = new THREE.Clock();
    let animationFrame = 0;
    let elapsed = 0;
    let wasActive = false;
    let motionMode: "travel" | "trick" = "travel";
    let motionEndsAt = 0;
    let nextTrickAt = 2.2;
    let travelSpeed = 0.42;
    let lastHitboxUpdate = 0;
    const destination = new THREE.Vector3();

    const playAction = (name: string, once = false) => {
      const action = actionsRef.current.get(name);
      if (!action || action === currentAction.current) return;
      currentAction.current?.fadeOut(0.16);
      action.reset();
      action.enabled = true;
      action.clampWhenFinished = once;
      action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
      action.fadeIn(0.16).play();
      currentAction.current = action;
    };

    const chooseDestination = (model: THREE.Group, level: number) => {
      const visibleHeight =
        2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * camera.position.z;
      const visibleWidth = visibleHeight * camera.aspect;
      const xLimit = Math.max(1.2, visibleWidth * 0.5 - 0.3);
      const minY = -visibleHeight * 0.5 + 0.3;
      const maxY = visibleHeight * 0.5 - 0.3;

      let nextX = THREE.MathUtils.clamp(
        model.position.x + THREE.MathUtils.randFloat(-1.45, 1.45),
        -xLimit,
        xLimit,
      );
      let nextY = THREE.MathUtils.clamp(
        model.position.y + THREE.MathUtils.randFloat(-0.9, 0.9),
        minY,
        maxY,
      );
      if (Math.hypot(nextX - model.position.x, nextY - model.position.y) < 0.5) {
        nextX = THREE.MathUtils.clamp(
          model.position.x + (Math.random() < 0.5 ? -0.75 : 0.75),
          -xLimit,
          xLimit,
        );
        nextY = THREE.MathUtils.clamp(
          model.position.y + THREE.MathUtils.randFloat(-0.45, 0.45),
          minY,
          maxY,
        );
      }
      destination.set(nextX, nextY, 0);

      const runChance = 0.32 + level * 0.12;
      const running = Math.random() < runChance;
      const sneaking = !running && level >= 1 && Math.random() < 0.2;
      if (running) {
        travelSpeed = 0.72 + level * 0.08;
        playAction("Run");
      } else if (sneaking) {
        travelSpeed = 0.28;
        playAction("SneakWalk");
      } else {
        travelSpeed = 0.43 + level * 0.035;
        playAction("Walk");
      }
      motionMode = "travel";
    };

    const startTrick = (level: number) => {
      const trickPools = [
        ["TailWag", "Idle"],
        ["HipHopDance", "Moonwalk", "TailWag"],
        ["Boxing", "SambaDance", "HipHopDance"],
        ["Breakdance", "Flair", "HurricaneKick", "Boxing"],
      ];
      const pool = trickPools[level];
      const name = pool[Math.floor(Math.random() * pool.length)];
      const clipDuration = actionsRef.current.get(name)?.getClip().duration ?? 2;
      playAction(name, true);
      motionMode = "trick";
      motionEndsAt = elapsed + THREE.MathUtils.clamp(clipDuration * 1.8, 4.2, 7.2);
      nextTrickAt = motionEndsAt + THREE.MathUtils.randFloat(1.8, 3.1);
    };

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      elapsed += delta;
      mixerRef.current?.update(delta);
      if (activeRef.current && modelRef.current) {
        const model = modelRef.current;
        const level = stageRef.current;
        if (!wasActive) {
          const visibleHeight =
            2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * camera.position.z;
          const visibleWidth = visibleHeight * camera.aspect;
          model.position.set(
            -visibleWidth * 0.42 + 0.3,
            THREE.MathUtils.randFloat(-visibleHeight * 0.35, visibleHeight * 0.35),
            0,
          );
          model.rotation.set(0, -0.55, 0);
          nextTrickAt = elapsed + THREE.MathUtils.randFloat(1.8, 2.8);
          chooseDestination(model, level);
          wasActive = true;
        }

        if (motionMode === "travel") {
          const toTarget = destination.clone().sub(model.position);
          const distance = toTarget.length();
          if (distance < 0.055) {
            if (elapsed >= nextTrickAt) startTrick(level);
            else chooseDestination(model, level);
          } else {
            const direction = toTarget.normalize();
            model.position.addScaledVector(direction, Math.min(travelSpeed * delta, distance));
            const facing = direction.x >= 0 ? -0.62 : 0.62;
            model.rotation.y = THREE.MathUtils.lerp(model.rotation.y, facing, Math.min(1, delta * 8));
            model.rotation.z = THREE.MathUtils.lerp(
              model.rotation.z,
              direction.y * -0.08,
              Math.min(1, delta * 7),
            );
          }

          if (elapsed >= nextTrickAt && distance < 0.45) startTrick(level);
        } else {
          model.rotation.y = THREE.MathUtils.lerp(model.rotation.y, 0, Math.min(1, delta * 5));
          model.rotation.z = THREE.MathUtils.lerp(model.rotation.z, 0, Math.min(1, delta * 5));
          if (elapsed >= motionEndsAt) chooseDestination(model, level);
        }

        model.scale.setScalar(
          baseScaleRef.current * settings.raccoonScale *
            (1 + Math.sin(elapsed * 7.5) * (motionMode === "travel" ? 0.018 : 0.008)),
        );

        if (elapsed - lastHitboxUpdate > 0.08) {
          const bounds = new THREE.Box3().setFromObject(model, true);
          const corners = [
            new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
            new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
            new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
            new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.max.z),
            new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
            new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
            new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
            new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
          ].map((corner) => corner.project(camera));
          const left = Math.max(0, (Math.min(...corners.map((corner) => corner.x)) * 0.5 + 0.5) * window.innerWidth - 16);
          const right = Math.min(window.innerWidth, (Math.max(...corners.map((corner) => corner.x)) * 0.5 + 0.5) * window.innerWidth + 16);
          const top = Math.max(0, (-Math.max(...corners.map((corner) => corner.y)) * 0.5 + 0.5) * window.innerHeight - 16);
          const bottom = Math.min(window.innerHeight, (-Math.min(...corners.map((corner) => corner.y)) * 0.5 + 0.5) * window.innerHeight + 16);
          invoke("update_overlay_hitbox", {
            x: left,
            y: top,
            width: Math.max(1, right - left),
            height: Math.max(1, bottom - top),
          }).catch(() => {});
          lastHitboxUpdate = elapsed;
        }
      } else {
        wasActive = false;
        setHoveringRaccoon(false);
      }
      renderer.render(scene, camera);
    };
    animate();
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      renderer.dispose();
      cameraRef.current = null;
      mount.removeChild(renderer.domElement);
    };
  }, [settings.raccoonScale]);

  const openAnswer = () => {
    if (!activeRef.current || !modelRef.current) return;
    if (settings.soundEnabled) playChaosSound();
    invoke("open_active_answer").catch(() => {});
  };

  return (
    <main className={`overlay ${active ? "is-active" : ""} stage-${stage}`}>
      <div
        ref={mountRef}
        className={`three-stage ${hoveringRaccoon ? "raccoon-hover" : ""}`}
        onClick={openAnswer}
        onMouseEnter={() => setHoveringRaccoon(true)}
        onMouseLeave={() => setHoveringRaccoon(false)}
        role="button"
        aria-label="답변으로 이동"
      />
      {active && !modelReady && (
        <div className={`model-status ${modelError ? "error" : ""}`}>
          {modelError ? "3D 모델 로딩 실패" : "3D 너구리 불러오는 중..."}
        </div>
      )}
    </main>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      className={`toggle ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span>{label}</span>
      <b>{checked ? "ON" : "OFF"}</b>
    </button>
  );
}

function SettingsApp() {
  const [settings, setSettings] = useState(defaults);
  const [detail, setDetail] = useState<
    "about" | "usage" | "extension" | "environment" | null
  >(null);
  const [bridge, setBridge] = useState<"checking" | "connected" | "offline">(
    "checking",
  );
  const [extensionConnected, setExtensionConnected] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("nandong-guri-settings");
    if (stored) {
      try {
        const next = { ...defaults, ...JSON.parse(stored) } as Settings;
        setSettings(next);
        invoke("save_settings", { settings: next }).catch(() => {});
      } catch {
        invoke<Settings>("get_settings").then(setSettings).catch(() => {});
      }
    } else {
      invoke<Settings>("get_settings").then(setSettings).catch(() => {});
    }
    const checkConnections = () => {
      fetch("http://127.0.0.1:43119/health")
        .then((response) => setBridge(response.ok ? "connected" : "offline"))
        .catch(() => setBridge("offline"));
      fetch("http://127.0.0.1:43119/extension-status")
        .then((response) => response.json())
        .then((status: { connected?: boolean }) =>
          setExtensionConnected(Boolean(status.connected)),
        )
        .catch(() => setExtensionConnected(false));
    };
    checkConnections();
    const timer = window.setInterval(checkConnections, 3000);
    return () => window.clearInterval(timer);
  }, []);

  const save = (next: Settings) => {
    setSettings(next);
    window.localStorage.setItem("nandong-guri-settings", JSON.stringify(next));
    invoke("save_settings", { settings: next }).catch(() => {});
  };

  const updateAutostart = async (launchAtLogin: boolean) => {
    try {
      if (launchAtLogin) await enable();
      else await disable();
      save({ ...settings, launchAtLogin });
    } catch {
      save({ ...settings, launchAtLogin: false });
    }
  };

  const statusText = useMemo(
    () =>
      bridge === "connected"
        ? "로컬 브리지 연결됨"
        : bridge === "checking"
          ? "연결 확인 중"
          : "브리지 연결 대기",
    [bridge],
  );

  const detailContent = {
    about: {
      eyebrow: "ABOUT",
      title: "난동구리 소개",
      body: [
        "ChatGPT와 Gemini의 답변이 끝나는 순간, 작은 3D 너구리가 화면에 등장하구리.",
        "화면을 총총 뛰어다니다가 제자리에서 신나게 춤추구리.",
        "너구리를 클릭하면 완료된 답변이 있는 기존 탭으로 바로 이동하구리.",
      ],
    },
    usage: {
      eyebrow: "HOW IT WORKS",
      title: "앱 사용 방법",
      body: [
        "난동구리 앱과 브라우저 확장 프로그램을 먼저 켜 두구리.",
        "ChatGPT 또는 Gemini에 질문하면 답변 완료와 함께 너구리가 등장하구리.",
        "이미 답변 탭을 보고 있다면 5초 뒤 스스로 사라지구리.",
      ],
    },
    extension: {
      eyebrow: "BROWSER EXTENSION",
      title: "확장 프로그램 설치",
      body: [
        "확장 프로그램은 처음 한 번만 설치하면 이후에는 자동으로 연결되구리.",
        "파일 하나가 아니라 manifest.json이 들어 있는 browser-extension 폴더 전체를 선택해야 하구리.",
      ],
    },
    environment: {
      eyebrow: "SYSTEM",
      title: "환경 및 단축키",
      body: [
        "macOS에서는 상단 메뉴바, Windows에서는 작업 표시줄 알림 영역의 난동구리 아이콘을 사용하구리.",
        "왼쪽 클릭으로 설정을 열고, 오른쪽 클릭으로 빠른 메뉴를 열 수 있구리.",
        "긴급 퇴장은 Command 또는 Ctrl + Shift + G를 누르면 되구리.",
      ],
    },
  } as const;

  return (
    <main className="tray-settings">
      <div className="mascot-glow mascot-glow-one" />
      <div className="mascot-glow mascot-glow-two" />
      <header className="brand-hero">
        <div className="brand-copy">
          <span>NANDONG GURI</span>
          <h1>난동구리</h1>
          <p>답변이 끝나는 순간, 작은 소동이 시작됩니다.</p>
        </div>
        <button
          className="settings-close"
          type="button"
          onClick={() => invoke("hide_settings_window").catch(() => {})}
          aria-label="설정창 닫기"
          title="설정창 닫기"
        >
          ×
        </button>
        <div className="tray-status" title={`${statusText} / ${extensionConnected ? "확장 연결됨" : "확장 연결 대기"}`}>
          <i className={bridge === "connected" && extensionConnected ? "online" : ""} />
          {bridge === "connected" && extensionConnected ? "준비됨" : "연결 확인 중"}
        </div>
        <img
          className="hero-mascot"
          src="/assets/images/raccoon-fire-cutout-v2.png"
          alt="불꽃과 함께 뛰어드는 난동구리"
        />
      </header>

      <div className="settings-surface">
        <img
          className="edge-mascot controls-peek-mascot"
          src="/assets/images/raccoon-hanging-v3.png"
          alt="기능 조절 패널에서 빼꼼 내민 너구리"
        />
        <section className="tray-controls">
          <div className="section-heading">
            <span>CONTROLS</span>
            <h2>기능 조절</h2>
          </div>
          <Toggle label="효과음" checked={settings.soundEnabled} onChange={(soundEnabled) => save({ ...settings, soundEnabled })} />
          <Toggle label="시스템 알림" checked={settings.systemNotifications} onChange={(systemNotifications) => save({ ...settings, systemNotifications })} />
          <Toggle label="로그인 시 자동 실행" checked={settings.launchAtLogin} onChange={updateAutostart} />
          <label className="tray-scale">
            <span>너구리 크기 <b>{Math.round(settings.raccoonScale * 100)}%</b></span>
            <input type="range" min="0.7" max="1.4" step="0.05" value={settings.raccoonScale} onChange={(change) => save({ ...settings, raccoonScale: Number(change.target.value) })} />
          </label>
          <div className="tray-shortcut">
            <span>긴급 퇴장</span>
            <kbd>⌘/Ctrl</kbd>
            <kbd>Shift</kbd>
            <kbd>G</kbd>
            <img
              className="shortcut-mascot"
              src="/assets/images/raccoon-climbing-v3.png"
              alt=""
              aria-hidden="true"
            />
          </div>
        </section>

        <nav className="tray-navigation" aria-label="난동구리 도움말">
          <div className="section-heading">
            <span>INFORMATION</span>
            <h2>정보 및 설정</h2>
          </div>
          <button onClick={() => setDetail("about")}><span>난동구리 소개<small>앱이 하는 일</small></span><b>›</b></button>
          <button onClick={() => setDetail("usage")}><span>사용 방법<small>답변 완료부터 이동까지</small></span><b>›</b></button>
          <button onClick={() => setDetail("extension")}><span>확장 프로그램 설치<small>macOS와 Windows</small></span><b>›</b></button>
          <button onClick={() => setDetail("environment")}><span>환경 및 단축키<small>메뉴바와 시스템 트레이</small></span><b>›</b></button>
          <div className="platform-note">macOS 메뉴바 · Windows 시스템 트레이</div>
        </nav>
        <img
          className="edge-mascot peeking-mascot"
          src="/assets/images/raccoon-peeking-v3.png"
          alt=""
          aria-hidden="true"
        />
        <img
          className="edge-mascot leaning-mascot"
          src="/assets/images/raccoon-leaning-v1.png"
          alt=""
          aria-hidden="true"
        />
        <img
          className="edge-mascot upside-down-mascot"
          src="/assets/images/raccoon-upside-down-v1.png"
          alt=""
          aria-hidden="true"
        />
        <img
          className="edge-mascot looking-back-mascot"
          src="/assets/images/raccoon-looking-back-v1.png"
          alt=""
          aria-hidden="true"
        />
      </div>

      {detail && (
        <div className="detail-backdrop" onClick={() => setDetail(null)}>
          <article className="detail-sheet" onClick={(click) => click.stopPropagation()}>
            <button className="detail-close" onClick={() => setDetail(null)} aria-label="닫기">×</button>
            <span>{detailContent[detail].eyebrow}</span>
            <h2>{detailContent[detail].title}</h2>
            <div className="detail-copy">
              {detailContent[detail].body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            {detail === "extension" && (
              <div className="extension-steps">
                <div>
                  <h3>macOS · Chrome</h3>
                  <ol>
                    <li>난동구리 앱을 먼저 실행합니다.</li>
                    <li>Chrome 주소창에 <code>chrome://extensions</code>를 입력합니다.</li>
                    <li>오른쪽 위의 <b>개발자 모드</b>를 켭니다.</li>
                    <li><b>압축해제된 확장 프로그램을 로드</b>를 누릅니다.</li>
                    <li>프로젝트 루트의 <code>browser-extension</code> 폴더 전체를 선택합니다.</li>
                    <li>ChatGPT와 Gemini 탭을 <b>Command + R</b>로 새로고침합니다.</li>
                  </ol>
                </div>
                <div>
                  <h3>Windows · Chrome / Edge</h3>
                  <ol>
                    <li>Chrome은 <code>chrome://extensions</code>, Edge는 <code>edge://extensions</code>를 엽니다.</li>
                    <li><b>개발자 모드</b>를 켭니다.</li>
                    <li><b>압축해제된 확장 프로그램 로드</b> 또는 <b>압축 풀린 항목 로드</b>를 누릅니다.</li>
                    <li><code>browser-extension</code> 폴더 전체를 선택합니다.</li>
                    <li>ChatGPT와 Gemini 탭을 <b>Ctrl + R</b>로 새로고침합니다.</li>
                  </ol>
                </div>
                <p className="extension-check">설정 패널 위쪽이 <b>준비됨</b>으로 바뀌면 설치 완료입니다.</p>
              </div>
            )}
          </article>
        </div>
      )}
    </main>
  );
}

export default function App() {
  const overlay = new URLSearchParams(window.location.search).get("view") === "overlay";
  return overlay ? <RaccoonOverlay /> : <SettingsApp />;
}
