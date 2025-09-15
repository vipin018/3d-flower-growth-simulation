import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// GUI Controls API with optimized defaults
const api = {
    maxCount: 1500,
    surfaceOpacity: 1,
    surfaceColor: 0xffff00,
    alignToSurface: true,
    randomRotation: false, // Disabled by default to prevent tilting
    animateRotation: false,
    rotationSpeed: 0.3,
    envIntensity: 1.2,
    flowerScale: 2.0,
    flowerScaleVariation: 0.5,
    baseFlowerScale: 4.0,
    stemColor: 0x228B22,
    blossomColor: 0xFF69B4,
    randomColors: true,
    colorVariation: 0.4,
    hoverRadius: 1.5,
    growthSpeed: 20.0,
    instantGrowth: false,
    decaySpeed: 3.0,
    maxFlowerLife: 8.0,
    spawnRate: 20,
    spawnBurst: 1,
    animateFlowers: true,
    flowerAnimationSpeed: 1.2,
    bobHeight: 0.3,
    surfaceType: 'TorusKnot',
    surfaceSize: 5.0,
    enableLOD: true,
    maxRenderDistance: 30,
    presetSlow: function() { setGrowthPreset('slow'); },
    presetNormal: function() { setGrowthPreset('normal'); },
    presetFast: function() { setGrowthPreset('fast'); },
    presetInstant: function() { setGrowthPreset('instant'); },
    clearAll: function() { clearAllFlowers(); }
};

// Color palettes for flowers
const blossomPalette = [
    0xFF1493, 0xFF69B4, 0xFF6347, 0xFF4500, 0xFFD700, 0xFFA500,
    0xFF0000, 0xDC143C, 0xB22222, 0xFF20FF, 0x9370DB, 0x8A2BE2,
    0x00FFFF, 0x00CED1, 0x20B2AA, 0x87CEEB, 0x4169E1, 0x0000FF
];
const stemPalette = [
    0x228B22, 0x32CD32, 0x006400, 0x9ACD32, 0x8FBC8F,
    0x90EE90, 0x7CFC00, 0x00FF00, 0x7FFF00, 0x98FB98,
    0x3CB371, 0x2E8B57, 0x66CDAA, 0x20B2AA, 0x008B8B
];

// Mouse and raycasting
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let lastHoverTime = 0;
let isModelLoaded = false;

// Canvas
const canvas = document.querySelector('canvas');

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xE39469);
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });

// Create room environment
const environment = new RoomEnvironment();
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(environment).texture;

// Surface
function createSurface() {
    let geometry;
    switch (api.surfaceType) {
        case 'TorusKnot':
            geometry = new THREE.TorusKnotGeometry(api.surfaceSize, api.surfaceSize * 0.3, 80, 12).toNonIndexed();
            break;
        case 'Sphere':
            geometry = new THREE.SphereGeometry(api.surfaceSize, 48, 24).toNonIndexed();
            break;
        case 'Torus':
            geometry = new THREE.TorusGeometry(api.surfaceSize, api.surfaceSize * 0.4, 12, 80).toNonIndexed();
            break;
        case 'Box':
            geometry = new THREE.BoxGeometry(api.surfaceSize * 2, api.surfaceSize * 2, api.surfaceSize * 2).toNonIndexed();
            break;
        default:
            geometry = new THREE.TorusKnotGeometry(api.surfaceSize, api.surfaceSize * 0.3, 80, 12).toNonIndexed();
    }
    return geometry;
}

let surfaceGeometry = createSurface();
const surfaceMaterial = new THREE.MeshPhysicalMaterial({
    color: api.surfaceColor,
    transparent: true,
    opacity: api.surfaceOpacity,
    metalness: 0.1,
    roughness: 0.6,
    clearcoat: 0.3,
    reflectivity: 0.7,
    envMap: scene.environment,
    envMapIntensity: 1.0
});
let surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
scene.add(surface);

// Flowers
let stemMesh, blossomMesh;
let stemGeometry, stemMaterial, blossomGeometry, blossomMaterial;

// Surface sampler
let sampler;
const dummy = new THREE.Object3D();
const _position = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _scale = new THREE.Vector3();

// Flower data
const flowerData = [];
let activeFlowerCount = 0;
const ages = new Float32Array(api.maxCount);
const scales = new Float32Array(api.maxCount);

// Smoother scaling function
const easeOutCubic = function(t) {
    return (--t) * t * t + 1;
};

const fastScaleCurve = function(t) {
    if (api.instantGrowth) return t > 0.05 ? 1 : 0;
    const curve = easeOutCubic(t);
    return Math.pow(curve, 0.8);
};

// Growth presets
function setGrowthPreset(preset) {
    switch(preset) {
        case 'slow':
            api.growthSpeed = 5;
            api.spawnRate = 10;
            api.instantGrowth = false;
            api.flowerScale = 1.0;
            api.baseFlowerScale = 2.0;
            break;
        case 'normal':
            api.growthSpeed = 15;
            api.spawnRate = 20;
            api.instantGrowth = false;
            api.flowerScale = 2.0;
            api.baseFlowerScale = 4.0;
            break;
        case 'fast':
            api.growthSpeed = 30;
            api.spawnRate = 40;
            api.instantGrowth = false;
            api.flowerScale = 3.0;
            api.baseFlowerScale = 5.0;
            break;
        case 'instant':
            api.growthSpeed = 60;
            api.spawnRate = 80;
            api.instantGrowth = true;
            api.flowerScale = 4.0;
            api.baseFlowerScale = 6.0;
            break;
    }
    if (isModelLoaded) {
        createFlowerInstances();
    }
}

// Initialize surface sampler
function initSampler() {
    sampler = new MeshSurfaceSampler(surface).build();
    console.log('Surface sampler initialized');
}
initSampler();

// GLB loader
const loader = new GLTFLoader();
const loadingManager = new THREE.LoadingManager();

loadingManager.onLoad = function() {
    console.log('All resources loaded - flowers ready');
    isModelLoaded = true;
};

loadingManager.onProgress = function(url, itemsLoaded, itemsTotal) {
    const progress = (itemsLoaded / itemsTotal * 100);
    console.log(`Loading progress: ${progress}%`);
};

loader.manager = loadingManager;

loader.load(
    "/Flower.glb",
    (gltf) => {
        console.log('GLTF loaded, processing meshes');
        gltf.scene.traverse((child) => {
            if (child.isMesh) {
                if (child.name === "Stem") {
                    stemGeometry = child.geometry.clone();
                    stemMaterial = child.material.clone();
                    console.log('Stem geometry and material loaded');
                }
                if (child.name === "Blossom") {
                    blossomGeometry = child.geometry.clone();
                    blossomMaterial = child.material.clone();
                    console.log('Blossom geometry and material loaded');
                }
            }
        });

        if (stemGeometry && blossomGeometry) {
            // Center geometry to ensure stem base is at y=0
            stemGeometry.computeBoundingBox();
            const stemBox = stemGeometry.boundingBox;
            const stemHeight = stemBox.max.y - stemBox.min.y;
            stemGeometry.translate(0, -stemBox.min.y, 0); // Shift so base is at y=0

            blossomGeometry.computeBoundingBox();
            const blossomBox = blossomGeometry.boundingBox;
            blossomGeometry.translate(0, -blossomBox.min.y + stemHeight, 0); // Align blossom above stem

            const defaultTransform = new THREE.Matrix4()
                .makeRotationX(Math.PI)
                .multiply(new THREE.Matrix4().makeScale(api.baseFlowerScale, api.baseFlowerScale, api.baseFlowerScale));
            
            stemGeometry.applyMatrix4(defaultTransform);
            blossomGeometry.applyMatrix4(defaultTransform);

            createFlowerInstances();
            initializeFlowerData();
            isModelLoaded = true;
            console.log('GLTF model loaded and ready - flowers can now grow');
        } else {
            console.error('Failed to load Stem or Blossom geometry from Flower.glb');
            createFallbackFlowers();
        }
    },
    (progress) => {
        const percent = (progress.loaded / progress.total * 100);
        console.log(`GLB Loading: ${percent}%`);
    },
    (error) => {
        console.error('Error loading Flower.glb:', error);
        createFallbackFlowers();
    }
);

// Fallback flower creation
function createFallbackFlowers() {
    console.log('Creating fallback procedural flowers');
    stemGeometry = new THREE.CylinderGeometry(0.05, 0.1, 2, 8);
    stemMaterial = new THREE.MeshPhysicalMaterial({ color: api.stemColor });
    blossomGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    blossomMaterial = new THREE.MeshPhysicalMaterial({ color: api.blossomColor });

    // Center fallback geometry
    stemGeometry.translate(0, 1, 0); // Base at y=0, height=2
    blossomGeometry.translate(0, 2, 0); // Blossom at top of stem

    const defaultTransform = new THREE.Matrix4()
        .makeRotationX(Math.PI)
        .multiply(new THREE.Matrix4().makeScale(api.baseFlowerScale, api.baseFlowerScale, api.baseFlowerScale));
    
    stemGeometry.applyMatrix4(defaultTransform);
    blossomGeometry.applyMatrix4(defaultTransform);

    createFlowerInstances();
    initializeFlowerData();
    isModelLoaded = true;
    console.log('Fallback flowers created and ready');
}

// Create flower instances
function createFlowerInstances() {
    if (!stemGeometry || !blossomGeometry) {
        console.error('Cannot create flower instances: geometries not loaded');
        return;
    }

    if (stemMesh) {
        scene.remove(stemMesh);
        stemMesh.geometry.dispose();
        stemMesh.material.dispose();
    }
    if (blossomMesh) {
        scene.remove(blossomMesh);
        blossomMesh.geometry.dispose();
        blossomMesh.material.dispose();
    }

    const enhancedStemMaterial = stemMaterial.clone();
    enhancedStemMaterial.roughness = 0.4;
    enhancedStemMaterial.metalness = 0.1;
    
    const enhancedBlossomMaterial = blossomMaterial.clone();
    enhancedBlossomMaterial.roughness = 0.3;
    enhancedBlossomMaterial.metalness = 0.0;

    stemMesh = new THREE.InstancedMesh(stemGeometry, enhancedStemMaterial, api.maxCount);
    blossomMesh = new THREE.InstancedMesh(blossomGeometry, enhancedBlossomMaterial, api.maxCount);

    stemMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    blossomMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    
    if (api.randomColors) {
        stemMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(api.maxCount * 3), 3);
        blossomMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(api.maxCount * 3), 3);
    }

    stemMesh.count = 0;
    blossomMesh.count = 0;

    scene.add(stemMesh, blossomMesh);
    console.log('Flower instances created and added to scene');
}

// Initialize flower data
function initializeFlowerData() {
    flowerData.length = 0;
    for (let i = 0; i < api.maxCount; i++) {
        flowerData.push({
            active: false,
            position: new THREE.Vector3(),
            normal: new THREE.Vector3(),
            age: 0,
            scale: 0,
            targetScale: 0,
            animPhase: Math.random() * Math.PI * 2,
            animSpeed: 0.5 + Math.random() * 1.0,
            stemColor: new THREE.Color(),
            blossomColor: new THREE.Color(),
            rotation: new THREE.Euler(),
            growthRate: 1 + Math.random() * 0.3
        });
        ages[i] = 0;
        scales[i] = 0;
    }
    activeFlowerCount = 0;
    console.log('Flower data initialized with', api.maxCount, 'slots');
}

// Update surface geometry
function updateSurface() {
    scene.remove(surface);
    surfaceGeometry.dispose();
    surfaceGeometry = createSurface();
    surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
    scene.add(surface);
    initSampler();
    clearAllFlowers();
    console.log('Surface updated to type:', api.surfaceType);
}

// Clear all flowers
function clearAllFlowers() {
    if (flowerData.length === 0) return;
    for (let i = 0; i < api.maxCount; i++) {
        flowerData[i].active = false;
        flowerData[i].scale = 0;
        flowerData[i].targetScale = 0;
        ages[i] = 0;
        scales[i] = 0;
    }
    activeFlowerCount = 0;
    if (stemMesh && blossomMesh) {
        stemMesh.count = 0;
        blossomMesh.count = 0;
        updateFlowerInstances();
    }
    console.log('All flowers cleared');
}

// Spawn flowers on surface
function spawnFlowerAt(worldPosition, normal) {
    if (!isModelLoaded) {
        console.log('Model not loaded yet, skipping flower spawn');
        return;
    }
    
    const flowersToSpawn = Math.min(api.spawnBurst, api.maxCount - activeFlowerCount);
    
    for (let burst = 0; burst < flowersToSpawn; burst++) {
        if (activeFlowerCount >= api.maxCount) break;
        
        for (let i = 0; i < api.maxCount; i++) {
            if (!flowerData[i].active) {
                const flower = flowerData[i];
                flower.active = true;
                // Position exactly at intersection point
                flower.position.copy(worldPosition);
                flower.normal.copy(normal);
                flower.age = 0;
                flower.targetScale = api.flowerScale + (Math.random() - 0.5) * api.flowerScaleVariation;
                ages[i] = 0;
                scales[i] = api.instantGrowth ? 1 : fastScaleCurve(ages[i]);

                if (api.randomColors) {
                    flower.stemColor.setHex(stemPalette[Math.floor(Math.random() * stemPalette.length)]);
                    flower.blossomColor.setHex(blossomPalette[Math.floor(Math.random() * blossomPalette.length)]);
                    flower.stemColor.offsetHSL(
                        (Math.random() - 0.5) * api.colorVariation,
                        (Math.random() - 0.5) * api.colorVariation * 0.7,
                        (Math.random() - 0.5) * api.colorVariation * 0.4
                    );
                    flower.blossomColor.offsetHSL(
                        (Math.random() - 0.5) * api.colorVariation,
                        (Math.random() - 0.5) * api.colorVariation * 0.7,
                        (Math.random() - 0.5) * api.colorVariation * 0.4
                    );
                } else {
                    flower.stemColor.setHex(api.stemColor);
                    flower.blossomColor.setHex(api.blossomColor);
                }

                if (api.alignToSurface) {
                    const normalTarget = worldPosition.clone().add(normal);
                    dummy.position.copy(worldPosition);
                    dummy.lookAt(normalTarget);
                    flower.rotation.copy(dummy.rotation);
                    // Apply slight random yaw if randomRotation is enabled
                    if (api.randomRotation) {
                        flower.rotation.y += Math.random() * Math.PI * 2;
                    }
                }

                activeFlowerCount++;
                break;
            }
        }
    }
    
    if (flowersToSpawn > 0) {
        console.log(`Spawned ${flowersToSpawn} flowers. Active count: ${activeFlowerCount}`);
    }
}

// Update flowers
function updateFlowers(deltaTime) {
    if (!stemMesh || !blossomMesh || flowerData.length === 0 || !isModelLoaded) {
        return;
    }

    const speedMultiplier = api.growthSpeed / 10.0;
    const maxUpdatesPerFrame = 500;
    let updatesThisFrame = 0;

    for (let i = 0; i < api.maxCount && updatesThisFrame < maxUpdatesPerFrame; i++) {
        const flower = flowerData[i];
        if (flower.active) {
            updatesThisFrame++;
            const growthIncrement = deltaTime * speedMultiplier * flower.growthRate;
            ages[i] += growthIncrement;
            
            if (ages[i] >= 1) {
                ages[i] = 0.001;
                scales[i] = 0;
                flower.active = false;
                activeFlowerCount--;
                continue;
            }

            scales[i] = fastScaleCurve(ages[i]) * flower.targetScale;
            flower.scale = scales[i];
        }
    }
}

// Update flower instances
function updateFlowerInstances() {
    if (!stemMesh || !blossomMesh || !stemMesh.instanceMatrix || !blossomMesh.instanceMatrix || !isModelLoaded) {
        return;
    }

    let visibleCount = 0;
    const cameraPosition = camera.position;
    
    for (let i = 0; i < api.maxCount; i++) {
        const flower = flowerData[i];
        if (flower.active && scales[i] > 0.01) {
            if (api.enableLOD) {
                const distance = cameraPosition.distanceTo(flower.position);
                if (distance > api.maxRenderDistance) continue;
            }
            
            dummy.position.copy(flower.position);
            dummy.rotation.copy(flower.rotation);

            if (api.animateFlowers) {
                const time = Date.now() * 0.001;
                const bobOffset = Math.sin(time * api.flowerAnimationSpeed * flower.animSpeed + flower.animPhase) 
                    * api.bobHeight * scales[i];
                const swayOffset = Math.cos(time * api.flowerAnimationSpeed * flower.animSpeed * 0.7 + flower.animPhase) 
                    * api.bobHeight * 0.3 * scales[i];
                
                const localUp = new THREE.Vector3(0, 1, 0);
                const localSide = new THREE.Vector3(1, 0, 0);
                localUp.applyEuler(flower.rotation);
                localSide.applyEuler(flower.rotation);
                
                dummy.position.add(localUp.multiplyScalar(bobOffset));
                dummy.position.add(localSide.multiplyScalar(swayOffset));
            }

            dummy.scale.set(scales[i], scales[i], scales[i]);
            dummy.updateMatrix();

            stemMesh.setMatrixAt(visibleCount, dummy.matrix);
            blossomMesh.setMatrixAt(visibleCount, dummy.matrix);

            if (api.randomColors && stemMesh.instanceColor && blossomMesh.instanceColor) {
                stemMesh.setColorAt(visibleCount, flower.stemColor);
                blossomMesh.setColorAt(visibleCount, flower.blossomColor);
            }

            visibleCount++;
        }
    }

    stemMesh.count = visibleCount;
    blossomMesh.count = visibleCount;
    stemMesh.instanceMatrix.needsUpdate = true;
    blossomMesh.instanceMatrix.needsUpdate = true;

    if (api.randomColors && stemMesh.instanceColor && blossomMesh.instanceColor) {
        stemMesh.instanceColor.needsUpdate = true;
        blossomMesh.instanceColor.needsUpdate = true;
    }
}

// Mouse interaction
function onMouseMove(event) {
    if (!isModelLoaded) return;
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(surface);
    
    if (intersects.length > 0) {
        const intersectPoint = intersects[0].point;
        const intersectNormal = intersects[0].normal;
        
        const currentTime = Date.now() * 0.001;
        const spawnInterval = 1 / api.spawnRate;
        
        if (currentTime - lastHoverTime > spawnInterval) {
            spawnFlowerAt(intersectPoint, intersectNormal);
            lastHoverTime = currentTime;
        }
    }
}

function onMouseClick(event) {
    if (!isModelLoaded) return;
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(surface);
    
    if (intersects.length > 0) {
        const intersectPoint = intersects[0].point;
        const intersectNormal = intersects[0].normal;
        
        const oldBurst = api.spawnBurst;
        api.spawnBurst = 5;
        spawnFlowerAt(intersectPoint, intersectNormal);
        api.spawnBurst = oldBurst;
    }
}

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 0.6 * api.envIntensity);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.0 * api.envIntensity);
dirLight.position.set(10, 15, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
scene.add(dirLight);

const pointLight = new THREE.PointLight(0xff7f50, 0.7 * api.envIntensity, 100);
pointLight.position.set(-15, 10, -15);
scene.add(pointLight);

const fillLight = new THREE.PointLight(0x87CEEB, 0.4 * api.envIntensity, 80);
fillLight.position.set(15, 5, 15);
scene.add(fillLight);

// Sizes
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
};

// Camera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 1000);
camera.position.set(18, 18, 18);
camera.lookAt(0, 0, 0);
scene.add(camera);

renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// GUI
const gui = new GUI();

// Quick Presets folder
const presetsFolder = gui.addFolder('Quick Presets');
presetsFolder.add(api, 'presetSlow').name('Slow Growth');
presetsFolder.add(api, 'presetNormal').name('Normal Growth');
presetsFolder.add(api, 'presetFast').name('Fast Growth');
presetsFolder.add(api, 'presetInstant').name('Instant Bloom');
presetsFolder.open();

// Speed Controls folder
const speedFolder = gui.addFolder('Speed Controls');
speedFolder.add(api, 'growthSpeed', 1, 60, 1).name('Growth Speed');
speedFolder.add(api, 'instantGrowth').name('Instant Growth');
speedFolder.add(api, 'spawnRate', 1, 80, 1).name('Spawn Rate (per sec)');
speedFolder.add(api, 'spawnBurst', 1, 10, 1).name('Flowers per Spawn');
speedFolder.add(api, 'maxFlowerLife', 1.0, 20.0, 1.0).name('Flower Lifespan');
speedFolder.open();

// Flower Controls
const flowerFolder = gui.addFolder('Flowers');
flowerFolder.add(api, 'flowerScale', 0.1, 10.0, 0.1).name('Growth Scale').listen();
flowerFolder.add(api, 'flowerScaleVariation', 0.0, 2.0, 0.1).name('Scale Variation').listen();
flowerFolder.add(api, 'baseFlowerScale', 1.0, 10.0, 0.1).name('Base Model Scale').onChange(() => {
    if (isModelLoaded) createFlowerInstances();
}).listen();
flowerFolder.add(api, 'randomColors').name('Random Colors');
flowerFolder.add(api, 'colorVariation', 0.0, 1.0, 0.05).name('Color Variation');
flowerFolder.addColor(api, 'stemColor').name('Stem Color');
flowerFolder.addColor(api, 'blossomColor').name('Blossom Color');
flowerFolder.open();

// Surface Controls
const surfaceFolder = gui.addFolder('Surface');
surfaceFolder.add(api, 'surfaceType', ['TorusKnot', 'Sphere', 'Torus', 'Box']).name('Type').onChange(updateSurface);
surfaceFolder.add(api, 'surfaceSize', 1.0, 15.0, 0.5).name('Size').onChange(updateSurface);
surfaceFolder.add(api, 'surfaceOpacity', 0.0, 1.0, 0.05).name('Opacity').onChange(() => {
    surfaceMaterial.opacity = api.surfaceOpacity;
});
surfaceFolder.addColor(api, 'surfaceColor').name('Color').onChange(() => {
    surfaceMaterial.color.setHex(api.surfaceColor);
});

// Animation Controls
const animationFolder = gui.addFolder('Animation');
animationFolder.add(api, 'animateRotation').name('Rotate Surface');
animationFolder.add(api, 'rotationSpeed', 0.0, 2.0, 0.05).name('Rotation Speed');
animationFolder.add(api, 'animateFlowers').name('Animate Flowers');
animationFolder.add(api, 'flowerAnimationSpeed', 0.1, 5.0, 0.1).name('Animation Speed');
animationFolder.add(api, 'bobHeight', 0.0, 1.0, 0.05).name('Bob Height');

// Performance Controls
const performanceFolder = gui.addFolder('Performance');
performanceFolder.add(api, 'maxCount', 500, 3000, 100).name('Max Flowers').onChange(() => {
    initializeFlowerData();
    if (isModelLoaded) createFlowerInstances();
});
performanceFolder.add(api, 'enableLOD').name('Enable LOD');
performanceFolder.add(api, 'maxRenderDistance', 10, 50, 5).name('Max Render Distance');

// Utility Controls
const utilityFolder = gui.addFolder('Utilities');
utilityFolder.add(api, 'clearAll').name('Clear All Flowers');

// Environment Controls
const envFolder = gui.addFolder('Environment');
envFolder.add(api, 'envIntensity', 0.0, 3.0, 0.1).name('Light Intensity').onChange(() => {
    ambientLight.intensity = 0.6 * api.envIntensity;
    dirLight.intensity = 1.0 * api.envIntensity;
    pointLight.intensity = 0.7 * api.envIntensity;
    fillLight.intensity = 0.4 * api.envIntensity;
    renderer.toneMappingExposure = Math.max(0.5, api.envIntensity);
});

// Event listeners
canvas.addEventListener('mousemove', onMouseMove);
canvas.addEventListener('click', onMouseClick);

window.addEventListener('resize', () => {
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;
    camera.aspect = sizes.width / sizes.height;
    camera.updateProjectionMatrix();
    renderer.setSize(sizes.width, sizes.height);
});

// Keyboard shortcuts
window.addEventListener('keydown', (event) => {
    switch(event.code) {
        case 'Digit1':
            setGrowthPreset('slow');
            break;
        case 'Digit2':
            setGrowthPreset('normal');
            break;
        case 'Digit3':
            setGrowthPreset('fast');
            break;
        case 'Digit4':
            setGrowthPreset('instant');
            break;
        case 'KeyC':
            clearAllFlowers();
            break;
        case 'KeyR':
            api.animateRotation = !api.animateRotation;
            break;
        case 'KeyI':
            api.instantGrowth = !api.instantGrowth;
            break;
        case 'Space':
            event.preventDefault();
            api.animateFlowers = !api.animateFlowers;
            break;
    }
});

// Performance monitoring
let frameCount = 0;
let lastFPSTime = performance.now();
let fps = 60;

function updateFPS() {
    frameCount++;
    const currentTime = performance.now();
    if (currentTime - lastFPSTime >= 1000) {
        fps = Math.round((frameCount * 1000) / (currentTime - lastFPSTime));
        frameCount = 0;
        lastFPSTime = currentTime;
        
        if (fps < 30 && api.maxCount > 500) {
            console.log('Low FPS detected, reducing flower count');
            api.maxCount = Math.max(500, api.maxCount - 200);
            initializeFlowerData();
            if (isModelLoaded) createFlowerInstances();
        }
    }
}

// Animation loop
const clock = new THREE.Clock();

function animate() {
    const deltaTime = Math.min(clock.getDelta(), 0.05);
    
    updateFPS();
    
    if (isModelLoaded) {
        updateFlowers(deltaTime);
        updateFlowerInstances();
    }

    if (api.animateRotation) {
        const elapsedTime = clock.getElapsedTime();
        const rotationSpeed = api.rotationSpeed;
        surface.rotation.x = Math.sin(elapsedTime * 0.4 * rotationSpeed) * 0.3;
        surface.rotation.y = elapsedTime * rotationSpeed;
        surface.rotation.z = Math.cos(elapsedTime * 0.6 * rotationSpeed) * 0.1;
        
        if (stemMesh && blossomMesh) {
            stemMesh.rotation.copy(surface.rotation);
            blossomMesh.rotation.copy(surface.rotation);
        }
    }

    controls.update();
    renderer.render(scene, camera);
    
    requestAnimationFrame(animate);
}

animate();

// Auto-spawn demo flowers
function startDemo() {
    if (!isModelLoaded) {
        setTimeout(startDemo, 100);
        return;
    }
    
    console.log('Starting demo - spawning initial flowers');
    
    for (let i = 0; i < 10; i++) {
        setTimeout(() => {
            if (sampler && isModelLoaded) {
                sampler.sample(_position, _normal);
                spawnFlowerAt(_position, _normal);
            }
        }, i * 300);
    }
}

setTimeout(startDemo, 1000);

if (typeof window !== 'undefined') {
    window.flowerAPI = {
        spawnFlower: spawnFlowerAt,
        clearAll: clearAllFlowers,
        setPreset: setGrowthPreset,
        getStats: () => ({
            activeFlowers: activeFlowerCount,
            maxFlowers: api.maxCount,
            fps: fps,
            modelLoaded: isModelLoaded
        }),
        api: api
    };
}