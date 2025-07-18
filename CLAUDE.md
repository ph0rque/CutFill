# CutFill - Professional Terrain Analysis & Cut-Fill Calculation Game

## Project Overview
CutFill is a professional-grade educational tool that gamifies terrain analysis and cut-fill calculations. It features 3D terrain visualization, real-time excavation simulation, and multi-level competitive gameplay designed for construction industry training.

## Current Status: **EVEN TERRAIN DIMENSIONS COMPLETE** ✅

### Just Completed: Professional Terrain Standardization
The game now uses industry-standard terrain dimensions with **40×40 yard lots and 10 yard depth**, providing intuitive measurements for construction professionals.

## Key Features

### 🎯 **Multi-Level Competitive Gameplay System** (Complete)
- **Sequential Level Progression**: 15+ assignments converted to unlockable levels
- **Real-time Scoring**: 50% Objective + 30% Net-Zero + 20% Operations Efficiency  
- **Server-side Validation**: Prevents cheating, ensures fair competition
- **Individual Performance Tracking**: Personal bests, completion times, operation counts
- **Global Leaderboards**: Best completion times and scores per level
- **Achievement System**: Unlocks for efficiency, speed, and precision milestones

### 🔧 **Precision Engineering Tools** (Complete)
- **7-Step Guided Workflow**: Direction → Magnitude → Area → Cross-Section → Drawing → Preview → Execute
- **Advanced Cross-Sections**: Straight walls, curved (cosine), angled (45°) profiles
- **Real-time Preview**: 3D visualization before applying operations
- **Polygon & Polyline Tools**: Complex area definition with precise boundaries
- **Professional Grade**: Sub-yard precision for construction-quality results

### 🌍 **Terrain Persistence & Management** (Complete)
- **Level-Specific Terrains**: Each level loads consistent, saved terrain configurations
- **Database Integration**: PostgreSQL storage via Supabase with full CRUD operations
- **Professional Dimensions**: 40×40 yard lots with 10 yard maximum excavation depth
- **Default Terrain Patterns**: Pre-configured terrains for levels 1-3

## Technical Architecture

### Frontend
- **Framework**: TypeScript + Vite
- **3D Engine**: Three.js for terrain rendering and manipulation
- **Styling**: CSS with responsive design
- **Build Tool**: Vite for fast development and optimized builds

### Backend
- **Server**: Node.js with Express.js
- **Database**: PostgreSQL via Supabase
- **Real-time**: Socket.io for multiplayer features
- **API**: RESTful endpoints for terrain management

### Database Schema
- **level_terrains**: Stores terrain configurations with JSONB data
- **User progress**: Tracks XP, achievements, and completion times
- **Leaderboards**: Global and per-level performance rankings

## Current Measurement Standards

### Terrain Dimensions (Updated)
- **Lot Size**: **40×40 yards** (120×120 feet internal)
- **Work Area**: **1,600 square yards** 
- **Maximum Depth**: **10 yards** (30 feet)
- **Maximum Volume**: **16,000 cubic yards** theoretical capacity

### Terrain Heights (in yards)
- **Flat Terrain**: ±1 yards variation with ±0.5 yards detail
- **Gentle Slope**: ±1 yards variation, clamped to ±3 yards
- **Rolling Hills**: 1 yards large waves, ±4 yards total range
- **Rough Terrain**: Up to ±5 yards dramatic height changes

### Material Layers (in yards)
- **Topsoil**: 0.1 yards deep
- **Subsoil**: 0.9 yards deep  
- **Clay**: 3 yards deep
- **Deep Soil**: 3 yards deep
- **Rock**: 3 yards deep

## Development Commands

### Start Development
```bash
# Frontend development server
npm run dev

# Backend server
cd server && npm start

# Database migrations
npx supabase db push
```

### Build & Test
```bash
# Build frontend
npm run build

# Run tests (check for specific test framework in package.json)
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

### Database Operations
```bash
# Apply migrations
npx supabase db push

# Reset database
npx supabase db reset

# Generate types
npx supabase gen types typescript --local
```

## Project Structure
```
CutFill/
├── src/                    # Frontend TypeScript source
│   ├── src/               # Core game modules
│   │   ├── main.ts       # Application entry point
│   │   ├── terrain.ts    # Terrain generation and management
│   │   ├── assignments.ts # Level progression system
│   │   ├── precision-tools.ts # Professional excavation tools
│   │   └── assignment-ui.ts # UI components
│   └── styles/           # CSS styling
├── server/               # Backend Node.js server
│   ├── server.js        # Express server with Socket.io
│   └── package.json     # Server dependencies
├── supabase/            # Database configuration
│   ├── migrations/      # Database schema migrations
│   └── config.toml      # Supabase configuration
├── memory-bank/         # Project context and progress
│   ├── activeContext.md # Current session context
│   └── progress.md      # Historical progress tracking
└── docs/                # Documentation and chat logs
```

## Recent Major Achievements

### ✅ **Terrain Dimension Standardization** (Just Completed)
- **Professional Standards**: 40×40 yard lots align with industry norms
- **Clean Mathematics**: Volume calculations use round numbers
- **User Experience**: Easier to estimate and plan earthwork operations
- **Coordinate System**: All axis ranges, bounds, and center points updated
- **Database Migration**: Updated stored terrain configurations to new dimensions

### ✅ **Terrain Persistence System** (Complete)
- **Database Schema**: Created `level_terrains` table for storing terrain configurations
- **Server API**: 6 comprehensive endpoints for terrain management
- **Frontend Integration**: Updated `AssignmentManager` to load saved terrains
- **Consistent Experience**: Each level uses the same terrain configuration every time

## Deployment Status
**🚀 Ready for Production**: All core systems implemented and tested with professional-grade terrain dimensions and comprehensive gameplay features.

## Future Enhancement Opportunities
- Administrative interface for level terrain creation
- Terrain sharing between players
- Weather effects on terrain properties
- Educational curriculum integration
- Equipment simulation (different tool types)

---

*This project demonstrates professional-grade terrain analysis capabilities with gamification elements designed for construction industry training and education.*