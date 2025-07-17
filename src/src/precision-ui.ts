import { PrecisionToolManager } from './precision-tools';
import type { WorkflowState, CrossSectionConfig } from './precision-tools';

export class PrecisionUI {
  private container: HTMLElement;
  private toolManager: PrecisionToolManager;
  private currentState: WorkflowState;
  private labelsVisible: boolean = true;

  constructor(toolManager: PrecisionToolManager) {
    this.toolManager = toolManager;
    this.currentState = toolManager.getWorkflowState();
    
    // Create main container
    this.container = document.createElement('div');
    this.container.id = 'precision-tools-ui';
    this.container.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0,0,0,0.9);
      color: white;
      padding: 20px;
      border-radius: 8px;
      font-family: Arial, sans-serif;
      min-width: 350px;
      max-width: 400px;
      z-index: 1001;
      pointer-events: auto;
    `;

    // Listen for state changes
    window.addEventListener('precision-tool-state-changed', (event: any) => {
      this.currentState = event.detail;
      this.updateUI();
    });

    this.updateUI();
    document.body.appendChild(this.container);
    
    // Sync initial label visibility state with terrain
    this.syncLabelVisibility();
  }

  private updateUI(): void {
    const stage = this.currentState.stage;
    
    let content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h2 style="margin: 0; color: #4CAF50;">🏗️ Precision Cut & Fill</h2>
        <button onclick="precisionUI.reset()" style="padding: 5px 10px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">↻ Reset</button>
      </div>
    `;

    // Progress indicator
    content += this.createProgressIndicator();
    
    // Stage-specific content
    switch (stage) {
      case 'direction':
        content += this.createDirectionStage();
        break;
      case 'magnitude':
        content += this.createMagnitudeStage();
        break;
      case 'area-mode':
        content += this.createAreaModeStage();
        break;
      case 'drawing':
        content += this.createDrawingStage();
        break;
      case 'cross-section':
        content += this.createCrossSectionStage();
        break;
      case 'deepest-point':
        content += this.createDeepestPointStage();
        break;
      case 'preview':
        content += this.createPreviewStage();
        break;
    }

    // Help text
    content += this.createHelpText();

    this.container.innerHTML = content;
  }

  private createProgressIndicator(): string {
    // Base stages that are always present
    const baseStages = ['direction', 'magnitude', 'area-mode', 'drawing', 'cross-section'];
    
    // For straight cross-sections, skip deepest-point and go straight to preview
    // For curved/angled cross-sections, include deepest-point before preview
    const allStages = [...baseStages];
    
    // Only add deepest-point stage if cross-section is not straight
    if (this.currentState.crossSection?.wallType !== 'straight') {
      allStages.push('deepest-point');
    }
    
    allStages.push('preview');
    
    const currentIndex = allStages.indexOf(this.currentState.stage);
    
    let indicator = '<div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">';
    indicator += '<div style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">Progress:</div>';
    indicator += '<div style="display: flex; gap: 5px;">';
    
    allStages.forEach((stage, index) => {
      const isActive = index === currentIndex;
      const isCompleted = index < currentIndex;
      const color = isCompleted ? '#4CAF50' : isActive ? '#2196F3' : '#666';
      const symbol = isCompleted ? '✓' : isActive ? '●' : '○';
      
      indicator += `<div style="color: ${color}; font-weight: bold;">${symbol}</div>`;
    });
    
    indicator += '</div>';
    indicator += `<div style="font-size: 11px; color: #ccc; margin-top: 3px;">Step ${currentIndex + 1} of ${allStages.length}</div>`;
    
    // Add explanation for straight cross-sections
    if (this.currentState.crossSection?.wallType === 'straight') {
      indicator += '<div style="font-size: 10px; color: #999; margin-top: 3px;">⚡ Straight walls: deepest point skipped (uniform depth)</div>';
    }
    
    indicator += '</div>';
    
    return indicator;
  }

  private createDirectionStage(): string {
    return `
      <div style="margin-bottom: 15px;">
        <h3>Step 1: Choose Operation Direction</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0;">
          <button onclick="precisionUI.setDirection('cut')" style="padding: 15px; background: #FF4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold;">
            ⛏️ CUT<br>
            <span style="font-size: 12px; font-weight: normal;">Remove earth (excavate down)</span>
          </button>
          <button onclick="precisionUI.setDirection('fill')" style="padding: 15px; background: #2196F3; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold;">
            🏔️ FILL<br>
            <span style="font-size: 12px; font-weight: normal;">Add earth (build up)</span>
          </button>
        </div>
        <div style="font-size: 12px; color: #ccc; margin-top: 10px;">
          Choose whether you want to remove earth (cut) or add earth (fill) to the terrain.
        </div>
      </div>
    `;
  }

  private createMagnitudeStage(): string {
    const direction = this.currentState.direction;
    const directionText = direction === 'cut' ? 'Cut Depth' : 'Fill Height';
    const directionIcon = direction === 'cut' ? '⬇️' : '⬆️';
    const directionColor = direction === 'cut' ? '#FF4444' : '#2196F3';
    
    return `
      <div style="margin-bottom: 15px;">
        <h3>Step 2: Set ${directionText}</h3>
        <div style="padding: 10px; background: rgba(${direction === 'cut' ? '255,68,68' : '33,150,243'}, 0.2); border-radius: 4px; margin-bottom: 10px;">
          <div style="color: ${directionColor}; font-weight: bold; margin-bottom: 5px;">
            ${directionIcon} ${direction?.toUpperCase()} Operation
          </div>
          <div style="font-size: 12px;">
            ${direction === 'cut' ? 'How deep to excavate from the highest point' : 'How high to build from the lowest point'}
          </div>
        </div>
        
        <div style="margin: 10px 0;">
          <label style="display: block; margin-bottom: 5px;">
            ${directionText}: <span id="magnitude-value" style="font-weight: bold; color: ${directionColor};">3.0 ft</span>
          </label>
          <input type="range" id="magnitude-slider" min="0.5" max="20" step="0.5" value="3" 
                 style="width: 100%; margin-bottom: 10px;"
                 oninput="precisionUI.updateMagnitudeDisplay()">
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin: 10px 0;">
          <button onclick="precisionUI.setMagnitudePreset(1)" style="padding: 8px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">1 ft</button>
          <button onclick="precisionUI.setMagnitudePreset(3)" style="padding: 8px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">3 ft</button>
          <button onclick="precisionUI.setMagnitudePreset(5)" style="padding: 8px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">5 ft</button>
          <button onclick="precisionUI.setMagnitudePreset(10)" style="padding: 8px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">10 ft</button>
        </div>
        
        <button onclick="precisionUI.confirmMagnitude()" style="width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold;">
          Continue with ${document.getElementById('magnitude-value')?.textContent || '3.0 ft'} ➤
        </button>
      </div>
    `;
  }

  private createAreaModeStage(): string {
    const direction = this.currentState.direction;
    const directionColor = direction === 'cut' ? '#FF4444' : '#2196F3';
    
    return `
      <div style="margin-bottom: 15px;">
        <h3>Step 3: Choose Area Shape</h3>
        <div style="padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px; margin-bottom: 15px;">
          <div style="color: ${directionColor}; font-weight: bold; margin-bottom: 5px;">
            ${this.currentState.direction?.toUpperCase()} - ${this.currentState.magnitude} ft
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 15px 0;">
          <button onclick="precisionUI.setAreaMode('polygon')" style="padding: 15px; background: #9C27B0; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold;">
            ⬟ POLYGON<br>
            <span style="font-size: 12px; font-weight: normal;">Custom shape area</span>
          </button>
          <button onclick="precisionUI.setAreaMode('polyline')" style="padding: 15px; background: #FF9800; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold;">
            ➰ POLYLINE<br>
            <span style="font-size: 12px; font-weight: normal;">Linear excavation</span>
          </button>
        </div>
        
        <div style="font-size: 12px; color: #ccc; margin-top: 10px;">
          <div style="margin-bottom: 5px;"><strong>Polygon:</strong> Click points to create a custom shaped area</div>
          <div><strong>Polyline:</strong> Create a linear excavation like a trench or canal</div>
        </div>
      </div>
    `;
  }

  private createDrawingStage(): string {
    const areaMode = this.currentState.areaMode;
    const direction = this.currentState.direction;
    const directionColor = direction === 'cut' ? '#FF4444' : '#2196F3';
    const area = this.currentState.area;
    
    let progressInfo = '';
    if (area) {
      if (area.type === 'polygon') {
        const vertices = area.vertices.length;
        progressInfo = `Points added: ${vertices}`;
        if (vertices >= 3) {
          progressInfo += ' (Ready to close)';
        }
      } else {
        const points = area.points.length;
        progressInfo = `Points added: ${points}`;
      }
    }
    
    return `
      <div style="margin-bottom: 15px;">
        <h3>Step 4: Draw ${areaMode === 'polygon' ? 'Polygon' : 'Polyline'}</h3>
        <div style="padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px; margin-bottom: 15px;">
          <div style="color: ${directionColor}; font-weight: bold; margin-bottom: 5px;">
            ${this.currentState.direction?.toUpperCase()} - ${this.currentState.magnitude} ft - ${areaMode?.toUpperCase()}
          </div>
          <div style="font-size: 12px; color: #ccc;">${progressInfo}</div>
        </div>
        
        ${areaMode === 'polyline' ? this.createPolylineControls() : ''}
        
        <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 6px; margin: 15px 0;">
          <div style="font-weight: bold; margin-bottom: 10px; color: #4CAF50;">📍 Drawing Instructions:</div>
          <div style="font-size: 12px; line-height: 1.4;">
            ${areaMode === 'polygon' 
              ? '• Click on the terrain to add polygon vertices<br>• Need at least 3 points to create a polygon<br>• Click on the first point again to close the shape<br>• Or click "Finish Drawing" when ready'
              : '• Click on the terrain to add line points<br>• Create a path for linear excavation<br>• Adjust thickness as needed<br>• Click "Finish Drawing" when ready'
            }
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <button onclick="precisionUI.finishDrawing()" style="padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold;">
            ✓ Finish Drawing
          </button>
          <button onclick="precisionUI.clearDrawing()" style="padding: 12px; background: #F44336; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
            🗑️ Clear
          </button>
        </div>
      </div>
    `;
  }

  private createPolylineControls(): string {
    const currentThickness = this.currentState.area?.type === 'polyline' 
      ? (this.currentState.area as any).thickness 
      : 5;
    
    return `
      <div style="margin: 15px 0; padding: 10px; background: rgba(255,152,0,0.2); border-radius: 4px;">
        <div style="font-weight: bold; margin-bottom: 10px; color: #FF9800;">🔧 Polyline Settings</div>
        <div style="margin: 10px 0;">
          <label style="display: block; margin-bottom: 5px;">
            Thickness: <span id="thickness-value" style="font-weight: bold; color: #FF9800;">${currentThickness.toFixed(1)} ft</span>
          </label>
          <input type="range" id="thickness-slider" min="1" max="20" step="0.5" value="${currentThickness}" 
                 style="width: 100%; margin-bottom: 10px;"
                 oninput="precisionUI.updateThickness()">
        </div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px;">
          <button onclick="precisionUI.setThicknessPreset(2)" style="padding: 5px; background: #666; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">2 ft</button>
          <button onclick="precisionUI.setThicknessPreset(5)" style="padding: 5px; background: #666; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">5 ft</button>
          <button onclick="precisionUI.setThicknessPreset(10)" style="padding: 5px; background: #666; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">10 ft</button>
          <button onclick="precisionUI.setThicknessPreset(15)" style="padding: 5px; background: #666; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">15 ft</button>
        </div>
      </div>
    `;
  }

  private createCrossSectionStage(): string {
    const direction = this.currentState.direction;
    const directionColor = direction === 'cut' ? '#FF4444' : '#2196F3';
    
    return `
      <div style="margin-bottom: 15px;">
        <h3>Step 5: Configure Cross-Section</h3>
        <div style="padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px; margin-bottom: 15px;">
          <div style="color: ${directionColor}; font-weight: bold; margin-bottom: 5px;">
            ${this.currentState.direction?.toUpperCase()} - ${this.currentState.magnitude} ft - ${this.currentState.areaMode?.toUpperCase()}
          </div>
        </div>
        
        <div style="margin-bottom: 15px;">
          <div style="font-weight: bold; margin-bottom: 10px;">🏗️ Wall Type:</div>
          <div style="display: grid; grid-template-columns: 1fr; gap: 8px;">
            <button onclick="precisionUI.setCrossSection('straight')" style="padding: 12px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; text-align: left; transition: background 0.2s;">
              <div style="font-weight: bold; margin-bottom: 4px;">📐 Straight Walls (90°)</div>
              <div style="font-size: 11px; opacity: 0.8;">Vertical sides throughout entire area</div>
              <div style="font-size: 10px; color: #4CAF50; margin-top: 2px;">• Maximum material removal/addition</div>
            </button>
            <button onclick="precisionUI.setCrossSection('curved')" style="padding: 12px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; text-align: left; transition: background 0.2s;">
              <div style="font-weight: bold; margin-bottom: 4px;">🌊 Curved Walls (Smooth)</div>
              <div style="font-size: 11px; opacity: 0.8;">Cosine curve from center to edges</div>
              <div style="font-size: 10px; color: #2196F3; margin-top: 2px;">• Natural bowl/mound shape • Stable slopes</div>
            </button>
            <button onclick="precisionUI.setCrossSection('angled')" style="padding: 12px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; text-align: left; transition: background 0.2s;">
              <div style="font-weight: bold; margin-bottom: 4px;">⚡ Angled Walls (45°)</div>
              <div style="font-size: 11px; opacity: 0.8;">Linear slopes from center outward</div>
              <div style="font-size: 10px; color: #FF9800; margin-top: 2px;">• 1:1 slope ratio • Good drainage • Construction-ready</div>
            </button>
          </div>
        </div>
        
        <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 6px; margin: 15px 0;">
          <div style="font-weight: bold; margin-bottom: 10px; color: #4CAF50;">📊 Cross-Section Comparison:</div>
          <div style="font-size: 11px; line-height: 1.6;">
            <div style="margin-bottom: 4px;"><strong>Straight:</strong> Full depth everywhere (most excavation)</div>
            <div style="margin-bottom: 4px;"><strong>Curved:</strong> Maximum at center, tapering smoothly to edges</div>
            <div style="margin-bottom: 4px;"><strong>Angled:</strong> Slopes at 45° from center (practical for construction)</div>
          </div>
        </div>
        
        <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 6px; margin: 15px 0;">
          <div style="font-weight: bold; margin-bottom: 10px; color: #4CAF50;">📍 Next Step:</div>
          <div style="font-size: 12px; line-height: 1.4;">
            <div style="margin-bottom: 8px;"><strong>Straight Walls:</strong> Go directly to 3D preview (uniform depth everywhere)</div>
            <div><strong>Curved/Angled Walls:</strong> Select deepest point position, then see 3D preview</div>
          </div>
        </div>
      </div>
    `;
  }

  private createDeepestPointStage(): string {
    const direction = this.currentState.direction;
    const directionColor = direction === 'cut' ? '#FF4444' : '#2196F3';
    const wallType = this.currentState.crossSection?.wallType || 'straight';
    
    return `
      <div style="margin-bottom: 15px;">
        <h3>Step 6: Position ${direction === 'cut' ? 'Deepest' : 'Highest'} Point</h3>
        <div style="padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px; margin-bottom: 15px;">
          <div style="color: ${directionColor}; font-weight: bold; margin-bottom: 5px;">
            ${this.currentState.direction?.toUpperCase()} - ${this.currentState.magnitude} ft - ${this.currentState.areaMode?.toUpperCase()}
          </div>
          <div style="font-size: 12px; color: #ccc;">Cross-section: ${wallType} walls</div>
        </div>
        
        <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 6px; margin: 15px 0;">
          <div style="font-weight: bold; margin-bottom: 10px; color: #4CAF50;">📍 ${direction === 'cut' ? 'Deepest' : 'Highest'} Point Position:</div>
          <div style="font-size: 12px; line-height: 1.6;">
            Click on the terrain within your drawn area to specify where the maximum ${direction === 'cut' ? 'excavation depth' : 'fill height'} should occur.
            <br><br>
            <strong>${direction === 'cut' ? 'For cuts:' : 'For fills:'}</strong> The ${this.currentState.magnitude} ft ${direction === 'cut' ? 'depth' : 'height'} will be applied at this point, with the cross-section shape determining how it transitions outward.
          </div>
        </div>
        
        <div style="background: rgba(${direction === 'cut' ? '255,68,68' : '33,150,243'}, 0.1); padding: 15px; border-radius: 6px; margin: 15px 0;">
          <div style="font-weight: bold; margin-bottom: 8px; color: ${directionColor};">💡 Cross-Section Effect:</div>
          <div style="font-size: 11px; line-height: 1.5;">
            ${wallType === 'straight' ? 
              `<strong>Straight walls:</strong> Full ${this.currentState.magnitude} ft ${direction === 'cut' ? 'depth' : 'height'} throughout the entire area.` :
              wallType === 'curved' ?
              `<strong>Curved walls:</strong> Maximum ${this.currentState.magnitude} ft at this point, smoothly tapering with a cosine curve toward the edges.` :
              `<strong>Angled walls:</strong> Maximum ${this.currentState.magnitude} ft at this point, with 45° linear slopes extending outward.`
            }
          </div>
        </div>
      </div>
    `;
  }

  private createPreviewStage(): string {
    const direction = this.currentState.direction;
    const directionColor = direction === 'cut' ? '#FF4444' : '#2196F3';
    
    return `
      <div style="margin-bottom: 15px;">
        <h3>Step 6: Preview & Execute</h3>
        <div style="padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px; margin-bottom: 15px;">
          <div style="color: ${directionColor}; font-weight: bold; margin-bottom: 5px;">
            ${this.currentState.direction?.toUpperCase()} - ${this.currentState.magnitude} ft - ${this.currentState.areaMode?.toUpperCase()}
          </div>
          <div style="font-size: 12px; color: #ccc;">
            Wall Type: ${this.currentState.crossSection?.wallType || 'Not set'}
          </div>
        </div>
        
        <div style="background: rgba(76,175,80,0.2); padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #4CAF50;">
          <div style="font-weight: bold; margin-bottom: 10px; color: #4CAF50;">✨ Preview Active</div>
          <div style="font-size: 12px; line-height: 1.4;">
            You can see a 3D preview of your operation on the terrain. Click anywhere within the area to position the deepest point, then execute when ready.
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px;">
          <button onclick="precisionUI.executeOperation()" style="padding: 15px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold;">
            ⚡ Execute Operation
          </button>
          <button onclick="precisionUI.reset()" style="padding: 15px; background: #F44336; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
            ❌ Cancel
          </button>
        </div>
      </div>
    `;
  }

  private createHelpText(): string {
    return `
      <div style="margin-top: 20px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 4px; border-top: 1px solid #333;">
        <div style="font-size: 11px; color: #999;">
          <strong>Controls:</strong> Left-click to interact | Right-drag to rotate camera | Scroll to zoom
        </div>
      </div>
    `;
  }

  // Public methods called from UI
  setDirection(direction: 'cut' | 'fill'): void {
    this.toolManager.setDirection(direction);
  }

  confirmMagnitude(): void {
    const slider = document.getElementById('magnitude-slider') as HTMLInputElement;
    if (slider) {
      this.toolManager.setMagnitude(parseFloat(slider.value));
    }
  }

  updateMagnitudeDisplay(): void {
    const slider = document.getElementById('magnitude-slider') as HTMLInputElement;
    const display = document.getElementById('magnitude-value');
    if (slider && display) {
      display.textContent = `${parseFloat(slider.value).toFixed(1)} ft`;
    }
  }

  setMagnitudePreset(value: number): void {
    const slider = document.getElementById('magnitude-slider') as HTMLInputElement;
    const display = document.getElementById('magnitude-value');
    if (slider && display) {
      slider.value = value.toString();
      display.textContent = `${value.toFixed(1)} ft`;
    }
  }

  setAreaMode(mode: 'polygon' | 'polyline'): void {
    this.toolManager.setAreaMode(mode);
  }

  updateThickness(): void {
    const slider = document.getElementById('thickness-slider') as HTMLInputElement;
    const display = document.getElementById('thickness-value');
    if (slider && display) {
      const thickness = parseFloat(slider.value);
      display.textContent = `${thickness.toFixed(1)} ft`;
      this.toolManager.setPolylineThickness(thickness);
    }
  }

  setThicknessPreset(value: number): void {
    const slider = document.getElementById('thickness-slider') as HTMLInputElement;
    const display = document.getElementById('thickness-value');
    if (slider && display) {
      slider.value = value.toString();
      display.textContent = `${value.toFixed(1)} ft`;
      this.toolManager.setPolylineThickness(value);
    }
  }

  finishDrawing(): void {
    this.toolManager.finishDrawing();
  }

  clearDrawing(): void {
    this.toolManager.clearWorkflow();
  }

  setCrossSection(wallType: 'straight' | 'curved' | 'angled'): void {
    const config: CrossSectionConfig = {
      wallType,
      deepestPoint: { x: 0, z: 0 } // Will be set by clicking on terrain
    };
    this.toolManager.setCrossSection(config);
  }

  async executeOperation(): Promise<void> {
    // Show loading spinner
    this.showLoadingSpinner();
    
    try {
      // Small delay to ensure spinner is visible
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const success = await this.toolManager.executeOperation();
      
      if (success) {
        // Operation successful
        this.hideLoadingSpinner();
        this.showNotification('✅ Operation completed successfully!', '#4CAF50');
      } else {
        this.hideLoadingSpinner();
        this.showNotification('❌ Failed to execute operation', '#F44336');
      }
    } catch (error) {
      this.hideLoadingSpinner();
      this.showNotification('❌ Error during operation: ' + error, '#F44336');
      console.error('Operation execution error:', error);
    }
  }

  reset(): void {
    this.toolManager.clearWorkflow();
  }

  toggleLabels(): void {
    this.labelsVisible = !this.labelsVisible;
    
    // Access the scaleReferences from the global window object
    const scaleReferences = (window as any).scaleReferences;
    if (scaleReferences && scaleReferences.markers) {
      scaleReferences.markers.visible = this.labelsVisible;
    }
    
    // Access terrain instance to control contour labels
    const terrain = this.toolManager.getTerrain();
    if (terrain) {
      terrain.setContourLabelsVisible(this.labelsVisible);
    }
    
    // Show notification
    const status = this.labelsVisible ? 'shown' : 'hidden';
    this.showNotification(`📍 All labels ${status}`, '#4CAF50');
    
    // Update button appearance
    this.updateLabelsButton();
  }

  // Sync label visibility state with terrain on initialization
  private syncLabelVisibility(): void {
    const terrain = this.toolManager.getTerrain();
    if (terrain) {
      // Set terrain's label visibility to match UI state
      terrain.setContourLabelsVisible(this.labelsVisible);
    }
  }

  public updateLabelsButton(): void {
    const button = document.getElementById('precision-labels-toggle') as HTMLButtonElement;
    if (button) {
      button.style.background = this.labelsVisible ? '#4CAF50' : '#666';
      button.textContent = this.labelsVisible ? '🏷️ Labels' : '🚫 Labels';
    }
  }

  private showLoadingSpinner(): void {
    // Create or show loading overlay
    let spinner = document.getElementById('precision-loading-spinner');
    if (!spinner) {
      spinner = document.createElement('div');
      spinner.id = 'precision-loading-spinner';
      spinner.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
          <div style="
            border: 4px solid #f3f3f3;
            border-radius: 50%;
            border-top: 4px solid #4CAF50;
            width: 40px;
            height: 40px;
            animation: spin 2s linear infinite;
            margin-bottom: 15px;
          "></div>
          <div style="color: white; font-size: 16px; font-weight: bold;">Processing terrain...</div>
          <div style="color: #ccc; font-size: 12px; margin-top: 5px;">This may take a moment for large areas</div>
        </div>
        <style>
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      `;
      spinner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 10000;
        pointer-events: all;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      document.body.appendChild(spinner);
    } else {
      spinner.style.display = 'flex';
    }
  }

  private hideLoadingSpinner(): void {
    const spinner = document.getElementById('precision-loading-spinner');
    if (spinner) {
      spinner.style.display = 'none';
    }
  }

  private showNotification(message: string, color: string): void {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${color};
      color: white;
      padding: 10px 15px;
      border-radius: 4px;
      z-index: 2000;
      font-size: 14px;
      animation: slideInOut 3s ease-in-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 3000);
  }

  destroy(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
} 