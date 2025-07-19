// Performance Optimization System - 60 FPS Target with Efficient Rendering and Memory Management

import * as THREE from 'three';

export interface PerformanceConfig {
  targetFPS: number;
  maxMemoryUsage: number; // MB
  renderQuality: 'low' | 'medium' | 'high' | 'ultra';
  enableLOD: boolean;
  enableInstancing: boolean;
  enableFrustumCulling: boolean;
  enableOcclusion: boolean;
  maxLights: number;
  shadowQuality: 'off' | 'low' | 'medium' | 'high';
  antialiasing: boolean;
  vsync: boolean;
}

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  materials: number;
  renderTime: number;
  updateTime: number;
}

export interface OptimizationStrategy {
  name: string;
  priority: number;
  condition: (metrics: PerformanceMetrics) => boolean;
  apply: () => void;
  revert: () => void;
}

export class PerformanceOptimizer {
  private config: PerformanceConfig;
  private metrics: PerformanceMetrics;
  private strategies: OptimizationStrategy[] = [];
  private isMonitoring = false;
  private frameTimeHistory: number[] = [];
  private memoryHistory: number[] = [];
  private lastFrameTime = 0;
  private frameCount = 0;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private geometryPool: Map<string, THREE.BufferGeometry> = new Map();
  private materialPool: Map<string, THREE.Material> = new Map();
  private texturePool: Map<string, THREE.Texture> = new Map();
  private instancedMeshes: Map<string, THREE.InstancedMesh> = new Map();
  private culledObjects: THREE.Object3D[] = [];
  private lodObjects: Map<THREE.Object3D, THREE.LOD> = new Map();
  private performanceWorker: Worker | null = null;

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = {
      targetFPS: 60,
      maxMemoryUsage: 512,
      renderQuality: 'medium',
      enableLOD: true,
      enableInstancing: true,
      enableFrustumCulling: true,
      enableOcclusion: false,
      maxLights: 8,
      shadowQuality: 'medium',
      antialiasing: true,
      vsync: true,
      ...config,
    };

    this.metrics = {
      fps: 0,
      frameTime: 0,
      memoryUsage: 0,
      drawCalls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
      materials: 0,
      renderTime: 0,
      updateTime: 0,
    };

    this.initializeOptimizationStrategies();
    this.setupPerformanceWorker();
  }

  private initializeOptimizationStrategies(): void {
    this.strategies = [
      {
        name: 'Reduce Shadow Quality',
        priority: 1,
        condition: metrics => metrics.fps < this.config.targetFPS * 0.8,
        apply: () => this.reduceShadowQuality(),
        revert: () => this.increaseShadowQuality(),
      },
      {
        name: 'Enable Frustum Culling',
        priority: 2,
        condition: metrics => metrics.drawCalls > 1000,
        apply: () => this.enableFrustumCulling(),
        revert: () => this.disableFrustumCulling(),
      },
      {
        name: 'Reduce Render Quality',
        priority: 3,
        condition: metrics => metrics.fps < this.config.targetFPS * 0.7,
        apply: () => this.reduceRenderQuality(),
        revert: () => this.increaseRenderQuality(),
      },
      {
        name: 'Enable Level of Detail',
        priority: 4,
        condition: metrics => metrics.triangles > 50000,
        apply: () => this.enableLOD(),
        revert: () => this.disableLOD(),
      },
      {
        name: 'Reduce Particle Count',
        priority: 5,
        condition: metrics => metrics.fps < this.config.targetFPS * 0.6,
        apply: () => this.reduceParticles(),
        revert: () => this.increaseParticles(),
      },
      {
        name: 'Disable Antialiasing',
        priority: 6,
        condition: metrics => metrics.fps < this.config.targetFPS * 0.5,
        apply: () => this.disableAntialiasing(),
        revert: () => this.enableAntialiasing(),
      },
      {
        name: 'Emergency Mode',
        priority: 10,
        condition: metrics => metrics.fps < this.config.targetFPS * 0.3,
        apply: () => this.enableEmergencyMode(),
        revert: () => this.disableEmergencyMode(),
      },
    ];
  }

  private setupPerformanceWorker(): void {
    // Create a web worker for background performance monitoring
    const workerCode = `
      let metrics = {
        fps: 0,
        frameTime: 0,
        memoryUsage: 0
      };
      
      let frameCount = 0;
      let lastTime = performance.now();
      
      function calculateMetrics() {
        const currentTime = performance.now();
        const deltaTime = currentTime - lastTime;
        
        if (deltaTime >= 1000) {
          metrics.fps = frameCount;
          metrics.frameTime = deltaTime / frameCount;
          frameCount = 0;
          lastTime = currentTime;
          
          // Memory usage (if available)
          if (performance.memory) {
            metrics.memoryUsage = performance.memory.usedJSHeapSize / 1024 / 1024;
          }
          
          postMessage(metrics);
        }
        
        requestAnimationFrame(calculateMetrics);
      }
      
      addEventListener('message', (e) => {
        if (e.data.type === 'frame') {
          frameCount++;
        }
      });
      
      calculateMetrics();
    `;

    try {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.performanceWorker = new Worker(URL.createObjectURL(blob));

      this.performanceWorker.onmessage = e => {
        this.metrics.fps = e.data.fps;
        this.metrics.frameTime = e.data.frameTime;
        this.metrics.memoryUsage = e.data.memoryUsage;
        this.onMetricsUpdate();
      };
    } catch (error) {
      console.warn('Performance worker not available:', error);
    }
  }

  public initialize(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ): void {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.optimizeRenderer();
    this.setupGeometryPooling();
    this.setupMaterialPooling();
    this.setupTexturePooling();
    this.setupInstancedRendering();
    this.setupMemoryManagement();
    this.startMonitoring();
  }

  private optimizeRenderer(): void {
    if (!this.renderer) return;

    // Enable renderer optimizations
    this.renderer.sortObjects = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Configure render settings based on quality
    switch (this.config.renderQuality) {
      case 'low':
        this.renderer.shadowMap.enabled = false;
        this.renderer.shadowMap.type = THREE.BasicShadowMap;
        break;
      case 'medium':
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        break;
      case 'high':
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        break;
      case 'ultra':
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.VSMShadowMap;
        break;
    }

    // Enable WebGL extensions for better performance
    const gl = this.renderer.getContext();
    const extensions = [
      'OES_texture_float',
      'OES_texture_float_linear',
      'OES_texture_half_float',
      'OES_texture_half_float_linear',
      'WEBGL_depth_texture',
      'OES_element_index_uint',
    ];

    extensions.forEach(ext => {
      gl.getExtension(ext);
    });
  }

  private setupGeometryPooling(): void {
    // Create common geometry pool
    const commonGeometries = [
      { name: 'box', geometry: new THREE.BoxGeometry(1, 1, 1) },
      { name: 'sphere', geometry: new THREE.SphereGeometry(0.5, 16, 16) },
      {
        name: 'cylinder',
        geometry: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
      },
      { name: 'plane', geometry: new THREE.PlaneGeometry(1, 1) },
      { name: 'cone', geometry: new THREE.ConeGeometry(0.5, 1, 16) },
    ];

    commonGeometries.forEach(({ name, geometry }) => {
      this.geometryPool.set(name, geometry);
    });
  }

  private setupMaterialPooling(): void {
    // Create common material pool
    const commonMaterials = [
      { name: 'basic', material: new THREE.MeshBasicMaterial() },
      { name: 'lambert', material: new THREE.MeshLambertMaterial() },
      { name: 'phong', material: new THREE.MeshPhongMaterial() },
      { name: 'standard', material: new THREE.MeshStandardMaterial() },
    ];

    commonMaterials.forEach(({ name, material }) => {
      this.materialPool.set(name, material);
    });
  }

  private setupTexturePooling(): void {
    // Texture pooling will be populated as textures are loaded
    // This helps avoid loading the same texture multiple times
  }

  private setupInstancedRendering(): void {
    if (!this.config.enableInstancing) return;

    // Set up instanced rendering for repeated objects
    // This will be used for terrain tiles, vegetation, etc.
  }

  private setupMemoryManagement(): void {
    // Set up periodic memory cleanup
    setInterval(() => {
      this.cleanupUnusedResources();
    }, 30000); // Clean up every 30 seconds

    // Monitor memory usage
    if ((performance as any).memory) {
      setInterval(() => {
        const memory = (performance as any).memory;
        this.metrics.memoryUsage = memory.usedJSHeapSize / 1024 / 1024;

        if (this.metrics.memoryUsage > this.config.maxMemoryUsage) {
          this.emergencyMemoryCleanup();
        }
      }, 5000);
    }
  }

  private startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitorPerformance();
  }

  private monitorPerformance(): void {
    const startTime = performance.now();

    // Update frame count
    this.frameCount++;

    // Send frame signal to worker
    if (this.performanceWorker) {
      this.performanceWorker.postMessage({ type: 'frame' });
    }

    // Calculate metrics
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;

    this.frameTimeHistory.push(deltaTime);
    if (this.frameTimeHistory.length > 60) {
      this.frameTimeHistory.shift();
    }

    // Update metrics
    this.metrics.frameTime = deltaTime;
    this.updateRenderMetrics();

    // Continue monitoring
    if (this.isMonitoring) {
      requestAnimationFrame(() => this.monitorPerformance());
    }
  }

  private updateRenderMetrics(): void {
    if (!this.renderer) return;

    const info = this.renderer.info;
    this.metrics.drawCalls = info.render.calls;
    this.metrics.triangles = info.render.triangles;
    this.metrics.geometries = info.memory.geometries;
    this.metrics.textures = info.memory.textures;

    // Calculate FPS from frame time history
    if (this.frameTimeHistory.length > 0) {
      const avgFrameTime =
        this.frameTimeHistory.reduce((a, b) => a + b, 0) /
        this.frameTimeHistory.length;
      this.metrics.fps = 1000 / avgFrameTime;
    }
  }

  private onMetricsUpdate(): void {
    // Apply optimization strategies based on current metrics
    this.applyOptimizationStrategies();

    // Trigger performance update event
    this.dispatchPerformanceEvent();
  }

  private applyOptimizationStrategies(): void {
    const sortedStrategies = this.strategies.sort(
      (a, b) => a.priority - b.priority
    );

    for (const strategy of sortedStrategies) {
      if (strategy.condition(this.metrics)) {
        console.log(`Applying optimization strategy: ${strategy.name}`);
        strategy.apply();
        break; // Apply one strategy at a time
      }
    }
  }

  private dispatchPerformanceEvent(): void {
    const event = new CustomEvent('performanceUpdate', {
      detail: { ...this.metrics },
    });
    window.dispatchEvent(event);
  }

  // Optimization strategy implementations
  private reduceShadowQuality(): void {
    if (!this.renderer || !this.scene) return;

    this.scene.traverse(object => {
      if (object instanceof THREE.Light && object.shadow) {
        object.shadow.mapSize.width = Math.max(
          256,
          object.shadow.mapSize.width / 2
        );
        object.shadow.mapSize.height = Math.max(
          256,
          object.shadow.mapSize.height / 2
        );
      }
    });
  }

  private increaseShadowQuality(): void {
    if (!this.renderer || !this.scene) return;

    this.scene.traverse(object => {
      if (object instanceof THREE.Light && object.shadow) {
        object.shadow.mapSize.width = Math.min(
          2048,
          object.shadow.mapSize.width * 2
        );
        object.shadow.mapSize.height = Math.min(
          2048,
          object.shadow.mapSize.height * 2
        );
      }
    });
  }

  private enableFrustumCulling(): void {
    if (!this.scene || !this.camera) return;

    const frustum = new THREE.Frustum();
    const matrix = new THREE.Matrix4();

    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        matrix.multiplyMatrices(
          this.camera!.projectionMatrix,
          this.camera!.matrixWorldInverse
        );
        frustum.setFromProjectionMatrix(matrix);

        if (!frustum.intersectsObject(object)) {
          object.visible = false;
          this.culledObjects.push(object);
        }
      }
    });
  }

  private disableFrustumCulling(): void {
    this.culledObjects.forEach(object => {
      object.visible = true;
    });
    this.culledObjects = [];
  }

  private reduceRenderQuality(): void {
    if (!this.renderer) return;

    const currentPixelRatio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(Math.max(0.5, currentPixelRatio * 0.8));
  }

  private increaseRenderQuality(): void {
    if (!this.renderer) return;

    const currentPixelRatio = this.renderer.getPixelRatio();
    const maxPixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(
      Math.min(maxPixelRatio, currentPixelRatio * 1.2)
    );
  }

  private enableLOD(): void {
    if (!this.scene || !this.camera) return;

    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh && !this.lodObjects.has(object)) {
        const lod = new THREE.LOD();

        // High detail (close)
        lod.addLevel(object, 0);

        // Medium detail (middle distance)
        const mediumGeometry = object.geometry.clone();
        mediumGeometry.attributes.position.array =
          mediumGeometry.attributes.position.array.slice(
            0,
            mediumGeometry.attributes.position.array.length / 2
          );
        const mediumMesh = new THREE.Mesh(mediumGeometry, object.material);
        lod.addLevel(mediumMesh, 50);

        // Low detail (far)
        const lowGeometry = object.geometry.clone();
        lowGeometry.attributes.position.array =
          lowGeometry.attributes.position.array.slice(
            0,
            lowGeometry.attributes.position.array.length / 4
          );
        const lowMesh = new THREE.Mesh(lowGeometry, object.material);
        lod.addLevel(lowMesh, 100);

        // Replace object with LOD
        object.parent?.add(lod);
        object.parent?.remove(object);

        this.lodObjects.set(object, lod);
      }
    });
  }

  private disableLOD(): void {
    this.lodObjects.forEach((lod, originalObject) => {
      lod.parent?.add(originalObject);
      lod.parent?.remove(lod);
    });
    this.lodObjects.clear();
  }

  private reduceParticles(): void {
    if (!this.scene) return;

    this.scene.traverse(object => {
      if (object instanceof THREE.Points) {
        const geometry = object.geometry as THREE.BufferGeometry;
        if (geometry.attributes.position) {
          const positions = geometry.attributes.position.array;
          const reducedPositions = new Float32Array(positions.length / 2);

          for (let i = 0; i < reducedPositions.length; i += 3) {
            reducedPositions[i] = positions[i * 2];
            reducedPositions[i + 1] = positions[i * 2 + 1];
            reducedPositions[i + 2] = positions[i * 2 + 2];
          }

          geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(reducedPositions, 3)
          );
        }
      }
    });
  }

  private increaseParticles(): void {
    // Restore original particle counts if available
    // This would require storing original state
  }

  private disableAntialiasing(): void {
    if (!this.renderer) return;

    // This would require recreating the renderer
    // For now, just disable post-processing AA
    this.config.antialiasing = false;
  }

  private enableAntialiasing(): void {
    if (!this.renderer) return;

    this.config.antialiasing = true;
  }

  private enableEmergencyMode(): void {
    // Extreme performance mode
    if (!this.renderer || !this.scene) return;

    // Disable all shadows
    this.renderer.shadowMap.enabled = false;

    // Reduce render resolution
    this.renderer.setPixelRatio(0.5);

    // Disable complex materials
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        if (
          object.material instanceof THREE.MeshStandardMaterial ||
          object.material instanceof THREE.MeshPhongMaterial
        ) {
          object.material = new THREE.MeshBasicMaterial({
            color: object.material.color,
          });
        }
      }
    });
  }

  private disableEmergencyMode(): void {
    // Restore normal settings
    this.optimizeRenderer();
  }

  private cleanupUnusedResources(): void {
    if (!this.renderer) return;

    // Clean up unused geometries
    this.geometryPool.forEach((geometry, key) => {
      if (geometry.userData.refCount === 0) {
        geometry.dispose();
        this.geometryPool.delete(key);
      }
    });

    // Clean up unused materials
    this.materialPool.forEach((material, key) => {
      if (material.userData.refCount === 0) {
        material.dispose();
        this.materialPool.delete(key);
      }
    });

    // Clean up unused textures
    this.texturePool.forEach((texture, key) => {
      if (texture.userData.refCount === 0) {
        texture.dispose();
        this.texturePool.delete(key);
      }
    });

    // Force garbage collection if available
    if ((window as any).gc) {
      (window as any).gc();
    }
  }

  private emergencyMemoryCleanup(): void {
    console.warn('Emergency memory cleanup triggered');

    // Aggressive cleanup
    this.cleanupUnusedResources();

    // Clear texture cache
    THREE.Cache.clear();

    // Reduce texture resolution
    this.texturePool.forEach(texture => {
      if (texture.image) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = texture.image.width / 2;
        canvas.height = texture.image.height / 2;

        if (ctx) {
          ctx.drawImage(texture.image, 0, 0, canvas.width, canvas.height);
          texture.image = canvas;
          texture.needsUpdate = true;
        }
      }
    });
  }

  // Public API
  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public getConfig(): PerformanceConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.optimizeRenderer();
  }

  public forceOptimization(): void {
    this.applyOptimizationStrategies();
  }

  public getGeometry(name: string): THREE.BufferGeometry | undefined {
    const geometry = this.geometryPool.get(name);
    if (geometry) {
      geometry.userData.refCount = (geometry.userData.refCount || 0) + 1;
    }
    return geometry;
  }

  public getMaterial(name: string): THREE.Material | undefined {
    const material = this.materialPool.get(name);
    if (material) {
      material.userData.refCount = (material.userData.refCount || 0) + 1;
    }
    return material;
  }

  public getTexture(name: string): THREE.Texture | undefined {
    const texture = this.texturePool.get(name);
    if (texture) {
      texture.userData.refCount = (texture.userData.refCount || 0) + 1;
    }
    return texture;
  }

  public addTexture(name: string, texture: THREE.Texture): void {
    this.texturePool.set(name, texture);
  }

  public releaseGeometry(name: string): void {
    const geometry = this.geometryPool.get(name);
    if (geometry) {
      geometry.userData.refCount = Math.max(
        0,
        (geometry.userData.refCount || 1) - 1
      );
    }
  }

  public releaseMaterial(name: string): void {
    const material = this.materialPool.get(name);
    if (material) {
      material.userData.refCount = Math.max(
        0,
        (material.userData.refCount || 1) - 1
      );
    }
  }

  public releaseTexture(name: string): void {
    const texture = this.texturePool.get(name);
    if (texture) {
      texture.userData.refCount = Math.max(
        0,
        (texture.userData.refCount || 1) - 1
      );
    }
  }

  public createInstancedMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    count: number
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    return mesh;
  }

  public dispose(): void {
    this.isMonitoring = false;

    if (this.performanceWorker) {
      this.performanceWorker.terminate();
    }

    // Clean up all resources
    this.geometryPool.forEach(geometry => geometry.dispose());
    this.materialPool.forEach(material => material.dispose());
    this.texturePool.forEach(texture => texture.dispose());

    this.geometryPool.clear();
    this.materialPool.clear();
    this.texturePool.clear();
    this.instancedMeshes.clear();
    this.lodObjects.clear();
  }
}

// Performance Monitor UI Component
export class PerformanceMonitorUI {
  private optimizer: PerformanceOptimizer;
  private container: HTMLElement | null = null;
  private isVisible = false;

  constructor(optimizer: PerformanceOptimizer) {
    this.optimizer = optimizer;
    this.createUI();
    this.setupEventListeners();
  }

  private createUI(): void {
    this.container = document.createElement('div');
    this.container.id = 'performance-monitor';
    this.container.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px;
      border-radius: 5px;
      font-family: monospace;
      font-size: 12px;
      z-index: 10000;
      min-width: 200px;
      display: none;
    `;

    document.body.appendChild(this.container);
  }

  private setupEventListeners(): void {
    window.addEventListener('performanceUpdate', (e: CustomEvent) => {
      this.updateDisplay(e.detail);
    });

    // Toggle visibility with Ctrl+Shift+P
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        this.toggle();
      }
    });
  }

  private updateDisplay(metrics: PerformanceMetrics): void {
    if (!this.container || !this.isVisible) return;

    const config = this.optimizer.getConfig();

    this.container.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 5px;">Performance Monitor</div>
      <div>FPS: ${metrics.fps.toFixed(1)} / ${config.targetFPS}</div>
      <div>Frame Time: ${metrics.frameTime.toFixed(2)}ms</div>
      <div>Memory: ${metrics.memoryUsage.toFixed(1)}MB / ${config.maxMemoryUsage}MB</div>
      <div>Draw Calls: ${metrics.drawCalls}</div>
      <div>Triangles: ${metrics.triangles.toLocaleString()}</div>
      <div>Geometries: ${metrics.geometries}</div>
      <div>Textures: ${metrics.textures}</div>
      <div style="margin-top: 10px;">
        <div style="font-weight: bold;">Quality: ${config.renderQuality}</div>
        <div>Shadows: ${config.shadowQuality}</div>
        <div>LOD: ${config.enableLOD ? 'On' : 'Off'}</div>
        <div>Culling: ${config.enableFrustumCulling ? 'On' : 'Off'}</div>
      </div>
    `;

    // Color-code FPS
    const fpsElement = this.container.querySelector(
      'div:nth-child(2)'
    ) as HTMLElement;
    if (fpsElement) {
      if (metrics.fps >= config.targetFPS * 0.9) {
        fpsElement.style.color = '#4CAF50';
      } else if (metrics.fps >= config.targetFPS * 0.6) {
        fpsElement.style.color = '#FF9800';
      } else {
        fpsElement.style.color = '#F44336';
      }
    }
  }

  public toggle(): void {
    this.isVisible = !this.isVisible;
    if (this.container) {
      this.container.style.display = this.isVisible ? 'block' : 'none';
    }
  }

  public show(): void {
    this.isVisible = true;
    if (this.container) {
      this.container.style.display = 'block';
    }
  }

  public hide(): void {
    this.isVisible = false;
    if (this.container) {
      this.container.style.display = 'none';
    }
  }
}

// Terrain Performance Optimizer
export class TerrainPerformanceOptimizer {
  private terrain: any; // Reference to terrain system
  private chunkSize = 64;
  private loadDistance = 3;
  private unloadDistance = 5;
  private activeChunks: Map<string, any> = new Map();
  private chunkPool: any[] = [];

  constructor(terrain: any) {
    this.terrain = terrain;
  }

  public optimizeTerrainRendering(): void {
    // Implement terrain-specific optimizations
    this.setupChunking();
    this.setupLOD();
    this.setupCulling();
    this.setupInstancedGrass();
  }

  private setupChunking(): void {
    // Divide terrain into chunks for efficient loading/unloading
    // Only render chunks near the camera
  }

  private setupLOD(): void {
    // Implement distance-based level of detail for terrain
    // Reduce geometry complexity for distant terrain
  }

  private setupCulling(): void {
    // Implement frustum culling for terrain chunks
    // Hide chunks outside camera view
  }

  private setupInstancedGrass(): void {
    // Use instanced rendering for grass and vegetation
    // Dramatically reduces draw calls
  }
}

// Create and export global performance optimizer
export const performanceOptimizer = new PerformanceOptimizer({
  targetFPS: 60,
  maxMemoryUsage: 512,
  renderQuality: 'medium',
  enableLOD: true,
  enableInstancing: true,
  enableFrustumCulling: true,
});

export const performanceMonitorUI = new PerformanceMonitorUI(
  performanceOptimizer
);
