# CutFill Performance Optimization Guide

## Overview

The CutFill game is designed to maintain a consistent 60 FPS experience across a wide range of devices and browsers. This guide details the performance optimization strategies implemented in the game.

## Performance Targets

- **Target FPS**: 60 FPS
- **Maximum Memory Usage**: 512 MB
- **Minimum Device Requirements**: 
  - 2GB RAM
  - WebGL 2.0 support
  - Modern browser (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+)

## Optimization Strategies

### 1. Rendering Optimization

#### Level of Detail (LOD)
- **High Detail**: Close objects (0-50 units) use full geometry
- **Medium Detail**: Middle distance (50-100 units) uses 50% geometry
- **Low Detail**: Far objects (100+ units) use 25% geometry

#### Frustum Culling
- Objects outside the camera view are not rendered
- Reduces draw calls by 30-50% in typical scenarios
- Automatically enabled when draw calls exceed 1000

#### Instanced Rendering
- Repeated objects (grass, rocks, terrain features) use instanced rendering
- Reduces draw calls for similar objects from N to 1
- Supports up to 10,000 instances per object type

### 2. Memory Management

#### Object Pooling
- **Geometry Pool**: Reuses common shapes (box, sphere, cylinder, plane, cone)
- **Material Pool**: Shares materials across similar objects
- **Texture Pool**: Prevents duplicate texture loading

#### Automatic Cleanup
- Unused resources are cleaned up every 30 seconds
- Reference counting prevents premature disposal
- Emergency cleanup triggered at 80% memory usage

#### Texture Optimization
- **Compression**: Automatic texture compression when available
- **Mipmapping**: Generates mipmaps for better performance at distance
- **Resolution Scaling**: Reduces texture resolution under memory pressure

### 3. Adaptive Quality System

The game automatically adjusts quality based on performance:

#### Quality Levels
1. **Ultra**: All features enabled, highest quality
2. **High**: Full shadows, antialiasing, all effects
3. **Medium**: PCF shadows, basic antialiasing
4. **Low**: Basic shadows, no antialiasing, reduced effects

#### Automatic Adjustments
- **FPS < 80% target**: Reduce shadow quality
- **FPS < 70% target**: Reduce render quality
- **FPS < 60% target**: Enable LOD system
- **FPS < 50% target**: Reduce particle count
- **FPS < 30% target**: Emergency mode (basic materials only)

### 4. Terrain-Specific Optimizations

#### Chunked Terrain
- Terrain divided into 64x64 unit chunks
- Only visible chunks are rendered
- Chunks beyond 5 units are unloaded from memory

#### Terrain LOD
- **Close**: Full vertex density
- **Medium**: 50% vertex density
- **Far**: 25% vertex density with flat shading

#### Grass and Vegetation
- Instanced rendering for grass (up to 50,000 blades)
- Billboard rendering for distant vegetation
- Fading based on distance and performance

### 5. WebGL Optimizations

#### Context Management
- Single WebGL context prevents conflicts
- Proper context restoration on context loss
- Extension detection and utilization

#### Shader Optimization
- **Vertex Shader**: Efficient vertex transformations
- **Fragment Shader**: Optimized lighting calculations
- **Uniform Buffers**: Batch uniform updates

#### Draw Call Reduction
- **Batch Rendering**: Groups similar objects
- **Texture Atlasing**: Combines multiple textures
- **Geometry Merging**: Combines static geometry

### 6. Performance Monitoring

#### Real-time Metrics
- FPS monitoring with 60-frame rolling average
- Memory usage tracking
- Draw call and triangle counting
- Render time measurement

#### Performance Worker
- Background thread monitors performance
- Prevents main thread blocking
- Provides smooth performance data

#### User Controls
- **Quality Selector**: Manual quality override
- **Auto-Optimize Toggle**: Enable/disable automatic adjustments
- **Performance Monitor**: Real-time performance display (Ctrl+Shift+P)

## Device-Specific Optimizations

### Mobile Devices
- **Reduced Pixel Ratio**: Maximum 2x pixel ratio
- **Touch Optimizations**: Larger touch targets
- **Memory Constraints**: Aggressive memory management
- **Battery Optimization**: Reduced effects for battery life

### Low-End Devices
- **Automatic Detection**: Based on device memory and CPU cores
- **Reduced Quality**: Starts with lower quality settings
- **Simplified Shaders**: Basic lighting and materials
- **Reduced Geometry**: Lower polygon counts

### High-End Devices
- **Enhanced Features**: Ultra quality mode available
- **Advanced Effects**: Volumetric lighting, advanced shadows
- **Higher Resolutions**: Supports 4K rendering
- **Extended Draw Distance**: Larger render distances

## Best Practices for Developers

### 1. Geometry Management
```typescript
// Use geometry pooling
const geometry = performanceOptimizer.getGeometry('box');

// Release when done
performanceOptimizer.releaseGeometry('box');
```

### 2. Material Sharing
```typescript
// Share materials between similar objects
const material = performanceOptimizer.getMaterial('standard');
const mesh1 = new THREE.Mesh(geometry1, material);
const mesh2 = new THREE.Mesh(geometry2, material);
```

### 3. Texture Loading
```typescript
// Use texture pooling
const texture = performanceOptimizer.getTexture('grass');
if (!texture) {
  const newTexture = textureLoader.load('grass.jpg');
  performanceOptimizer.addTexture('grass', newTexture);
}
```

### 4. Instanced Rendering
```typescript
// For repeated objects
const instancedMesh = performanceOptimizer.createInstancedMesh(
  geometry, 
  material, 
  1000 // instance count
);
```

### 5. Performance Monitoring
```typescript
// Get current metrics
const metrics = performanceOptimizer.getMetrics();
console.log(`FPS: ${metrics.fps}, Memory: ${metrics.memoryUsage}MB`);

// Listen for performance updates
window.addEventListener('performanceUpdate', (e) => {
  const metrics = (e as CustomEvent).detail;
  // React to performance changes
});
```

## Troubleshooting Performance Issues

### Low FPS (< 30 FPS)
1. **Check GPU**: Verify WebGL 2.0 support
2. **Reduce Quality**: Set quality to "Low" or "Medium"
3. **Enable Auto-Optimize**: Let the system adjust automatically
4. **Close Other Applications**: Free up system resources
5. **Update Browser**: Ensure latest browser version

### High Memory Usage (> 400 MB)
1. **Enable Memory Monitoring**: Check for memory leaks
2. **Reduce Texture Quality**: Lower resolution textures
3. **Clear Cache**: Refresh the page to clear caches
4. **Disable Advanced Features**: Turn off particles and effects

### Stuttering or Frame Drops
1. **Check Background Apps**: Close unnecessary applications
2. **Disable Browser Extensions**: Some extensions affect performance
3. **Enable VSync**: Reduce frame rate to match display
4. **Reduce Render Distance**: Lower LOD distances

## Performance Metrics Dashboard

Access the performance dashboard with `Ctrl+Shift+P` to view:

- **FPS**: Current frame rate with color coding
- **Frame Time**: Time per frame in milliseconds
- **Memory Usage**: Current memory consumption
- **Draw Calls**: Number of draw calls per frame
- **Triangles**: Triangle count being rendered
- **Geometries**: Number of loaded geometries
- **Textures**: Number of loaded textures

## Future Optimizations

### Planned Improvements
1. **WebGPU Support**: Migration to WebGPU for better performance
2. **Compute Shaders**: GPU-based terrain calculations
3. **Occlusion Culling**: Hide objects behind others
4. **Temporal Upsampling**: Render at lower resolution and upscale
5. **Streaming**: Load terrain data on demand

### Research Areas
1. **Neural Network Optimization**: AI-based quality adjustment
2. **Predictive Loading**: Load content based on user behavior
3. **Collaborative Rendering**: Distribute rendering across devices
4. **Cloud-Based Processing**: Offload calculations to cloud

## Conclusion

The CutFill performance optimization system provides a robust foundation for maintaining 60 FPS across diverse hardware configurations. The adaptive quality system ensures optimal performance while preserving visual quality where possible.

For developers working on the project, following the best practices outlined in this guide will help maintain the performance standards and provide a smooth user experience for all players.

For more technical details, refer to the `performance-optimization.ts` source code and the inline documentation. 