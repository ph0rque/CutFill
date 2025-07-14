# System Patterns: CutFill Game Architecture

## Core Architecture Patterns

### Client-Server Model
- **Web-based Client**: Three.js for 3D rendering and interaction
- **Real-time Server**: WebSocket-based multiplayer synchronization
- **State Management**: Centralized server authority with optimistic client updates
- **Data Persistence**: Supabase for user sessions, progress, and real-time multiplayer state

### Game Loop Architecture
```
Input → Game State → Physics → Rendering → Network Sync
  ↑                                              ↓
  ←─────────── Network Updates ←─────────────────
```

### Component-Based Design
- **Terrain System**: Grid-based height maps with dynamic modification
- **Volume Calculator**: Real-time cut/fill calculations with tolerance checking
- **Water System**: Flow simulation and drainage modeling
- **Hazard System**: Erosion, landslides, and environmental challenges
- **UI System**: Layered interface with contextual feedback

## Key Technical Decisions

### 3D Visualization Strategy
- **Grid-Based Terrain**: Structured mesh for predictable calculations
- **Real-time Deformation**: Dynamic vertex manipulation for smooth interaction
- **Visual Feedback**: Color overlays and transparency for cut/fill visualization
- **Performance Optimization**: Level-of-detail rendering for complex scenes

### Multiplayer Synchronization
- **Server Authority**: Centralized state management prevents conflicts
- **Delta Compression**: Send only changes to minimize bandwidth
- **Prediction System**: Client-side prediction with server reconciliation
- **Conflict Resolution**: Last-write-wins for concurrent operations

### Educational Integration
- **Metrics Engine**: Real-time calculation of educational KPIs
- **Replay System**: Action recording for analysis and improvement
- **Adaptive Difficulty**: Dynamic adjustment based on performance
- **Progress Tracking**: Skill development monitoring across sessions

## Data Models

### Terrain Representation
```javascript
{
  grid: {
    width: number,
    height: number,
    resolution: number,
    heights: Float32Array
  },
  metadata: {
    soilTypes: Array<SoilType>,
    waterTable: number,
    stability: Float32Array
  }
}
```

### Player State
```javascript
{
  id: string,
  position: Vector3,
  tool: ToolType,
  volume: {
    cut: number,
    fill: number,
    net: number
  },
  score: ScoreMetrics
}
```

### Game Session
```javascript
{
  id: string,
  players: Array<Player>,
  terrain: TerrainData,
  assignment: Assignment,
  constraints: {
    timeLimit: number,
    tolerance: number,
    netZeroRequired: boolean
  }
}
```

## Performance Patterns

### Rendering Optimization
- **Frustum Culling**: Render only visible terrain sections
- **Mesh Simplification**: Reduce polygon count for distant objects
- **Texture Atlasing**: Combine textures to reduce draw calls
- **Instanced Rendering**: Efficient particle systems for debris

### Network Optimization
- **Message Batching**: Group multiple updates into single packets
- **Priority Systems**: Critical updates first, cosmetic updates later
- **Compression**: Quantize position data for network efficiency
- **Buffering**: Smooth network jitter with interpolation

### Memory Management
- **Object Pooling**: Reuse frequent objects (particles, UI elements)
- **Garbage Collection**: Minimize allocation during gameplay
- **Asset Streaming**: Load terrain sections on demand
- **Cache Strategy**: Persistent storage for frequently accessed data

## Security and Validation

### Input Validation
- **Boundary Checking**: Prevent out-of-bounds terrain modifications
- **Rate Limiting**: Control action frequency to prevent abuse
- **Sanity Checks**: Validate physical constraints (volume conservation)
- **Cheat Prevention**: Server-side validation of all game state changes

### Data Integrity
- **Checksums**: Verify terrain state consistency
- **Version Control**: Track changes for debugging and rollback
- **Backup Strategy**: Regular state snapshots for recovery
- **Audit Trail**: Log all significant game actions

## Scalability Considerations

### Horizontal Scaling
- **Stateless Services**: Enable load balancing across servers
- **Database Scaling**: Supabase managed PostgreSQL with automatic scaling
- **CDN Integration**: Serve static assets from edge locations
- **Microservices**: Separate concerns for independent scaling

### Vertical Scaling
- **Resource Monitoring**: Track CPU, memory, and network usage
- **Caching Strategy**: Reduce database load with intelligent caching
- **Algorithm Optimization**: Improve core calculation performance
- **Memory Optimization**: Reduce footprint for higher player density

## Development Patterns

### AI-Accelerated Development
- **Iterative Prototyping**: Rapid testing of game mechanics
- **Automated Testing**: AI-generated test cases for edge conditions
- **Code Generation**: AI assistance for boilerplate and patterns
- **Documentation**: AI-maintained technical documentation
- **Database Integration**: Supabase client libraries for rapid development

### Quality Assurance
- **Test-Driven Development**: Unit tests for core calculations
- **Integration Testing**: Multiplayer scenario validation
- **Performance Testing**: Load testing under realistic conditions
- **User Testing**: Playtesting with target audience segments 