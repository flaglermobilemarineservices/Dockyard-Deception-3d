/**
 * Dockside Deception Halloween asset helpers.
 *
 * This file intentionally does not import Three.js or GLTFLoader. Pass the
 * game's existing GLTFLoader instance into the model/animation helpers.
 */

export const HALLOWEEN_ASSETS = Object.freeze({
  music: "./boat-daddy-rick.mp3",
  pumpkinTotem: "./pumpkin-totem.glb",
  deathAnimation: "./rick-gage-dead.glb",
});

let halloweenMusic = null;

/**
 * Call this from the same click/tap that starts the game. Browsers normally
 * block autoplay until the player interacts with the page.
 */
export async function startHalloweenMusic({ volume = 0.55, loop = true } = {}) {
  if (!halloweenMusic) {
    halloweenMusic = new Audio(HALLOWEEN_ASSETS.music);
    halloweenMusic.preload = "auto";
  }

  halloweenMusic.loop = loop;
  halloweenMusic.volume = Math.max(0, Math.min(1, volume));

  try {
    await halloweenMusic.play();
    return halloweenMusic;
  } catch (error) {
    console.warn("Halloween music could not start until another player tap.", error);
    return null;
  }
}

export function stopHalloweenMusic({ reset = false } = {}) {
  if (!halloweenMusic) return;
  halloweenMusic.pause();
  if (reset) halloweenMusic.currentTime = 0;
}

export function setHalloweenMusicMuted(muted) {
  if (halloweenMusic) halloweenMusic.muted = Boolean(muted);
}

function loadGLTF(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

/**
 * Loads one pumpkin totem and adds it to the supplied Three.js scene.
 */
export async function addPumpkinTotem({
  loader,
  scene,
  position = { x: 0, y: 0, z: 0 },
  rotationY = 0,
  scale = 1,
  castShadow = true,
  receiveShadow = true,
} = {}) {
  if (!loader || !scene) {
    throw new Error("addPumpkinTotem requires both loader and scene.");
  }

  const gltf = await loadGLTF(loader, HALLOWEEN_ASSETS.pumpkinTotem);
  const model = gltf.scene;

  model.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
  model.rotation.y = rotationY;
  model.scale.setScalar(scale);
  model.name = "HalloweenPumpkinTotem";

  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = castShadow;
    object.receiveShadow = receiveShadow;
  });

  scene.add(model);
  return model;
}

/**
 * Loads the GLB containing the two included death clips: Dead and Dead.001.
 * Retarget the chosen clip to Rick/Gage with the same retargeting method used
 * for the other Mixamo/Meshy animations in the game.
 */
export async function loadDeathAnimationSource({ loader } = {}) {
  if (!loader) throw new Error("loadDeathAnimationSource requires a GLTFLoader.");

  const gltf = await loadGLTF(loader, HALLOWEEN_ASSETS.deathAnimation);
  const preferredClip =
    gltf.animations.find((clip) => clip.name === "Dead") ?? gltf.animations[0] ?? null;

  return {
    sourceScene: gltf.scene,
    animations: gltf.animations,
    preferredClip,
  };
}

/**
 * Use after creating an AnimationAction for the death clip.
 * It plays once and freezes on the final pose.
 */
export function configureDeathAction(action, THREE) {
  if (!action || !THREE) return action;
  action.reset();
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.enabled = true;
  return action;
}
