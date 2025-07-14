# Technical Context: CutFill Game

## Technology Stack

### Frontend Technologies
- **Three.js**: 3D graphics rendering and scene management
- **JavaScript (ES6+)**: Core game logic and client-side processing
- **WebSockets**: Real-time multiplayer communication
- **HTML5 Canvas**: 2D UI overlays and HUD elements
- **CSS3**: Responsive styling and animations

### Backend Technologies
- **Node.js**: Server runtime environment
- **Socket.io**: WebSocket abstraction for multiplayer
- **Express.js**: HTTP server for static assets and API endpoints
- **Supabase**: PostgreSQL database with built-in authentication, user management, and real-time subscriptions
- **Redis** (optional): Session management and caching

### Development Tools
- **Vite**: Fast build tool and development server
- **ESLint**: Code quality and style enforcement
- **Prettier**: Code formatting
- **Jest**: Unit testing framework
- **Playwright**: End-to-end testing
- **Supabase CLI**: Database migrations and local development

### Supabase Integration Benefits
- **Authentication**: Built-in user management with social logins
- **Real-time Subscriptions**: Live updates for multiplayer state
- **Row Level Security**: Secure data access control
- **Auto-generated APIs**: REST and GraphQL endpoints
- **Edge Functions**: Server-side logic deployment

## Development Environment Setup

### Prerequisites
- Node.js 18+ (LTS)
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Git for version control
- Code editor (VS Code recommended)

### Local Development
```bash
# Clone repository
git clone [repository-url]
cd cutfill-game

# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Environment Variables
```env
NODE_ENV=development
PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
REDIS_URL=redis://localhost:6379
MAX_PLAYERS_PER_SESSION=4
SESSION_TIMEOUT=1800000
```

## Technical Constraints

### Performance Requirements
- **Frame Rate**: Maintain 60 FPS on medium-spec hardware
- **Network Latency**: < 100ms for multiplayer actions
- **Memory Usage**: < 512MB for typical game session
- **Load Time**: < 5 seconds for initial game load

### Browser Compatibility
- **WebGL Support**: Required for Three.js rendering
- **WebSocket Support**: Required for multiplayer
- **ES6 Modules**: Modern JavaScript features
- **Local Storage**: For client-side preferences

### Device Support
- **Desktop**: Primary target platform
- **Tablet**: Secondary support with touch controls
- **Mobile**: Limited support due to performance constraints
- **Screen Resolution**: 1024x768 minimum, responsive design

## Architecture Constraints

### Scalability Limits
- **Concurrent Players**: 4 players per game session
- **Server Capacity**: 100 concurrent sessions per server instance
- **Database Load**: Read-heavy workload, minimal writes
- **Asset Size**: < 50MB total game assets

### Security Considerations
- **Client-Server Validation**: All game state changes validated server-side
- **Rate Limiting**: Prevent rapid-fire actions and spam
- **Data Sanitization**: Input validation for all user data
- **Session Management**: Secure session tokens and timeout handling

## Development Workflow

### Version Control Strategy
- **Main Branch**: Production-ready code
- **Develop Branch**: Integration branch for features
- **Feature Branches**: Individual feature development
- **Release Tags**: Version marking for deployments

### AI Development Integration
- **Code Generation**: AI assistance for boilerplate and patterns
- **Documentation**: AI-maintained technical documentation
- **Testing**: AI-generated test cases and edge conditions
- **Optimization**: AI-suggested performance improvements

### Quality Assurance Pipeline
1. **Local Testing**: Unit tests and linting
2. **Integration Testing**: Multiplayer scenario validation
3. **Performance Testing**: Load testing and profiling
4. **User Testing**: Playtesting with target audiences

## Deployment Strategy

### Production Environment
- **Web Server**: Nginx reverse proxy
- **Application Server**: Node.js with PM2 process manager
- **Database**: Supabase (managed PostgreSQL with built-in auth and real-time)
- **CDN**: CloudFlare for static asset delivery

### Monitoring and Logging
- **Application Metrics**: Response times, error rates
- **Game Metrics**: Player sessions, completion rates
- **System Metrics**: CPU, memory, network usage
- **Error Tracking**: Centralized error logging and alerts

### Backup and Recovery
- **Database Backups**: Supabase automated backups and point-in-time recovery
- **Code Repository**: Git-based version control
- **Asset Backups**: CDN and local storage redundancy
- **Disaster Recovery**: Documented procedures for system restore

## Known Technical Limitations

### Current Constraints
- **Single Server**: No distributed computing initially
- **Memory Limits**: Large terrains may cause performance issues
- **Network Dependency**: Requires stable internet connection
- **Browser Limitations**: No offline mode or local storage

### Technical Debt Considerations
- **Prototype Code**: Rapid development may sacrifice optimization
- **Testing Coverage**: Limited time for comprehensive testing
- **Documentation**: Focus on core functionality first
- **Scalability**: Initial architecture may need refactoring for growth

## Future Technical Enhancements

### Short-term Improvements
- **Performance Optimization**: Profiling and bottleneck removal
- **Mobile Support**: Touch controls and responsive design
- **Offline Mode**: Local gameplay without network dependency
- **Advanced Graphics**: Improved shaders and visual effects

### Long-term Vision
- **Cloud Computing**: Distributed server architecture
- **Machine Learning**: AI-powered difficulty adjustment
- **VR/AR Support**: Immersive interaction modes
- **Real-world Integration**: GPS and mapping service integration

## Learning Resources

### Documentation
- **Three.js Documentation**: https://threejs.org/docs/
- **Socket.io Guide**: https://socket.io/docs/
- **Supabase Documentation**: https://supabase.com/docs
- **Node.js API**: https://nodejs.org/api/
- **WebGL Reference**: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API

### Community Resources
- **Stack Overflow**: Q&A for specific technical issues
- **GitHub Issues**: Bug reports and feature requests
- **Discord Communities**: Real-time developer support
- **YouTube Tutorials**: Video learning for complex concepts 