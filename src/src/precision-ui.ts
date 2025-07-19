import { PrecisionToolManager } from './precision-tools';
import type { WorkflowState, CrossSectionConfig } from './precision-tools';
import { AuthService } from './auth';

export class PrecisionUI {
  private container: HTMLElement;
  private toolManager: PrecisionToolManager;
  private currentState: WorkflowState;
  private labelsVisible: boolean = true;
  private currentThickness: number = 5; // Default thickness value
  private authService?: AuthService;

  constructor(toolManager: PrecisionToolManager, authService?: AuthService) {
    this.toolManager = toolManager;
    this.authService = authService;
    this.currentState = toolManager.getWorkflowState();

    // Debug: log authService status
    console.log('PrecisionUI: authService passed:', !!authService, authService);

    // Create main container
    this.container = document.createElement('div');
    this.container.id = 'precision-tools-ui';
    this.container.style.cssText = `
      position: fixed;
      top: 60px;
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
        <div style="display: flex; gap: 5px;">
          <button onclick="precisionUI.backToMain()" style="padding: 5px 10px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🏠 Back to Main</button>
          <button onclick="precisionUI.reset()" style="padding: 5px 10px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">↻ Reset</button>
        </div>
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
    const baseStages = [
      'direction',
      'magnitude',
      'area-mode',
      'drawing',
      'cross-section',
    ];

    // For straight cross-sections, skip deepest-point and go straight to preview
    // For curved/angled cross-sections, include deepest-point before preview
    const allStages = [...baseStages];

    // Only add deepest-point stage if cross-section is not straight
    if (this.currentState.crossSection?.wallType !== 'straight') {
      allStages.push('deepest-point');
    }

    allStages.push('preview');

    const currentIndex = allStages.indexOf(this.currentState.stage);

    let indicator =
      '<div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">';
    indicator +=
      '<div style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">Progress:</div>';
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
      indicator +=
        '<div style="font-size: 10px; color: #999; margin-top: 3px;">⚡ Straight walls: deepest point skipped (uniform depth)</div>';
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
            ${directionIcon} ${direction!.toUpperCase()} Operation
          </div>
          <div style="font-size: 12px;">
            ${direction === 'cut' ? 'How deep to excavate from the highest point' : 'How high to build from the lowest point'}
          </div>
        </div>
        
        <div style="margin: 10px 0;">
          <label style="display: block; margin-bottom: 5px;">
            ${directionText}: <span id="magnitude-value" style="font-weight: bold; color: ${directionColor};">1.0 yd</span>
          </label>
          <input type="range" id="magnitude-slider" min="0.33" max="3.33" step="0.17" value="1.0" 
                 style="width: 100%; margin: 5px 0;" onchange="precisionUI.updateMagnitudeDisplay(this.value)">
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin: 5px 0;">
            <button onclick="precisionUI.setMagnitudePreset(1)" style="padding: 8px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">0.33 yd</button>
            <button onclick="precisionUI.setMagnitudePreset(3)" style="padding: 8px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">1.0 yd</button>
            <button onclick="precisionUI.setMagnitudePreset(5)" style="padding: 8px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">1.67 yd</button>
            <button onclick="precisionUI.setMagnitudePreset(10)" style="padding: 8px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">3.33 yd</button>
          </div>
          <button id="continue-button" onclick="precisionUI.setMagnitude(parseFloat(document.getElementById('magnitude-slider').value))" 
                  style="width: 100%; padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold; margin-top: 10px;">
            Continue with 1.0 yd ➤
          </button>
        </div>
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
            ${this.currentState.direction!.toUpperCase()} - ${(this.currentState.magnitude! / 3).toFixed(1)} yd - ${this.currentState.areaMode?.toUpperCase()}
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
    let totalLength = 0;
    if (area) {
      if (area.type === 'polygon') {
        const vertices = area.vertices.length;
        progressInfo = `Points added: ${vertices}`;

        // Calculate total perimeter for segments drawn so far
        if (vertices > 1) {
          for (let i = 0; i < vertices - 1; i++) {
            const start = area.vertices[i];
            const end = area.vertices[i + 1];
            const dx = end.x - start.x;
            const dz = end.z - start.z;
            totalLength += Math.sqrt(dx * dx + dz * dz);
          }

          if (area.closed && vertices > 2) {
            // Add closing segment for closed polygons
            const start = area.vertices[vertices - 1];
            const end = area.vertices[0];
            const dx = end.x - start.x;
            const dz = end.z - start.z;
            totalLength += Math.sqrt(dx * dx + dz * dz);
            const totalLengthYards = totalLength / 3; // Convert to yards
            progressInfo += ` | Perimeter: ${totalLengthYards.toFixed(1)} yd`;
          } else {
            const totalLengthYards = totalLength / 3; // Convert to yards
            progressInfo += ` | Length: ${totalLengthYards.toFixed(1)} yd`;
          }
        }

        if (vertices >= 3) {
          progressInfo += ' (Ready to close)';
        }
      } else {
        const points = area.points.length;
        progressInfo = `Points added: ${points}`;

        // Calculate total line length
        if (points > 1) {
          for (let i = 0; i < points - 1; i++) {
            const start = area.points[i];
            const end = area.points[i + 1];
            const dx = end.x - start.x;
            const dz = end.z - start.z;
            totalLength += Math.sqrt(dx * dx + dz * dz);
          }
          const totalLengthYards = totalLength / 3; // Convert to yards
          progressInfo += ` | Total Length: ${totalLengthYards.toFixed(1)} yd`;
        }
      }
    }

    return `
      <div style="margin-bottom: 15px;">
        <h3>Step 4: Draw ${areaMode === 'polygon' ? 'Polygon' : 'Polyline'}</h3>
        <div style="padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px; margin-bottom: 15px;">
          <div style="color: ${directionColor}; font-weight: bold; margin-bottom: 5px;">
            ${this.currentState.direction!.toUpperCase()} - ${(this.currentState.magnitude! / 3).toFixed(1)} yd - ${areaMode!.toUpperCase()}
          </div>
          <div style="font-size: 12px; color: #ccc;">${progressInfo}</div>
        </div>
        
        ${areaMode === 'polyline' ? this.createPolylineControls() : ''}
        
        <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 6px; margin: 15px 0;">
          <div style="font-weight: bold; margin-bottom: 10px; color: #4CAF50;">📍 Drawing Instructions:</div>
          <div style="font-size: 12px; line-height: 1.4;">
            ${
              areaMode === 'polygon'
                ? '• Click on the terrain to add polygon vertices<br>• Need at least 3 points to create a polygon<br>• Click on the first point again to close the shape<br>• Or click "Finish Drawing" when ready'
                : '• Click on the terrain to add line points<br>• Create a path for linear excavation<br>• Adjust thickness as needed<br>• Click "Finish Drawing" when ready'
            }
          </div>
        </div>
        
        <div style="margin-bottom: 10px;">
          <button onclick="precisionUI.toggleSegmentLabels()" style="padding: 8px; background: #9C27B0; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; width: 100%;">
            📏 ${this.toolManager.getLengthLabelsVisible() ? 'Hide' : 'Show'} Length Labels
          </button>
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
    const currentThickness =
      this.currentState.area?.type === 'polyline'
        ? (this.currentState.area as any).thickness
        : 5;

    return `
      <div style="margin: 15px 0; padding: 10px; background: rgba(255,152,0,0.2); border-radius: 4px;">
        <div style="font-weight: bold; margin-bottom: 10px; color: #FF9800;">🔧 Polyline Settings</div>
        <div style="margin: 10px 0;">
          <label style="display: block; margin-bottom: 5px;">
            Thickness: <span id="thickness-value" style="font-weight: bold; color: #FF9800;">${(currentThickness / 3).toFixed(1)} yd</span>
          </label>
          <input type="range" id="thickness-slider" min="1" max="20" step="0.5" value="${currentThickness}" 
                 style="width: 100%; margin-bottom: 10px;"
                 oninput="precisionUI.updateThickness()">
        </div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px;">
            <div style="margin: 5px 0; font-size: 11px;">
              <span style="color: #aaa;">Presets:</span>
              <button onclick="precisionUI.setThicknessPreset(2)" style="padding: 5px; background: #666; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">0.7 yd</button>
              <button onclick="precisionUI.setThicknessPreset(5)" style="padding: 5px; background: #666; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">1.7 yd</button>
              <button onclick="precisionUI.setThicknessPreset(10)" style="padding: 5px; background: #666; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">3.3 yd</button>
              <button onclick="precisionUI.setThicknessPreset(15)" style="padding: 5px; background: #666; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">5.0 yd</button>
            </div>
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
            ${this.currentState.direction!.toUpperCase()} - ${(this.currentState.magnitude! / 3).toFixed(1)} yd - ${this.currentState.areaMode?.toUpperCase()}
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
            ${this.currentState.direction!.toUpperCase()} - ${(this.currentState.magnitude! / 3).toFixed(1)} yd - ${this.currentState.areaMode?.toUpperCase()}
          </div>
          <div style="font-size: 12px; color: #ccc;">Cross-section: ${wallType} walls</div>
        </div>
        
        <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 6px; margin: 15px 0;">
          <div style="font-weight: bold; margin-bottom: 10px; color: #4CAF50;">📍 ${direction === 'cut' ? 'Deepest' : 'Highest'} Point Position:</div>
          <div style="font-size: 12px; line-height: 1.6;">
            Click on the terrain within your drawn area to specify where the maximum ${direction === 'cut' ? 'excavation depth' : 'fill height'} should occur.
            <br><br>
            <strong>${direction === 'cut' ? 'For cuts:' : 'For fills:'}</strong> The ${(this.currentState.magnitude! / 3).toFixed(1)} yd ${direction === 'cut' ? 'depth' : 'height'} will be applied at this point, with the cross-section shape determining how it transitions outward.
          </div>
        </div>
        
        <div style="background: rgba(${direction === 'cut' ? '255,68,68' : '33,150,243'}, 0.1); padding: 15px; border-radius: 6px; margin: 15px 0;">
          <div style="font-weight: bold; margin-bottom: 8px; color: ${directionColor};">💡 Cross-Section Effect:</div>
          <div style="font-size: 11px; line-height: 1.5;">
            ${
              wallType === 'straight'
                ? `<strong>Straight walls:</strong> Full ${(this.currentState.magnitude! / 3).toFixed(1)} yd ${direction === 'cut' ? 'depth' : 'height'} throughout the entire area.`
                : wallType === 'curved'
                  ? `<strong>Curved walls:</strong> Maximum ${(this.currentState.magnitude! / 3).toFixed(1)} yd at this point, smoothly tapering with a cosine curve toward the edges.`
                  : `<strong>Angled walls:</strong> Maximum ${(this.currentState.magnitude! / 3).toFixed(1)} yd at this point, with 45° linear slopes extending outward.`
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
            ${this.currentState.direction!.toUpperCase()} - ${(this.currentState.magnitude! / 3).toFixed(1)} yd - ${this.currentState.areaMode!.toUpperCase()}
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
    const slider = document.getElementById(
      'magnitude-slider'
    ) as HTMLInputElement;
    if (slider) {
      this.toolManager.setMagnitude(parseFloat(slider.value));
    }
  }

  updateMagnitudeDisplay(value: string): void {
    const display = document.getElementById('magnitude-value');
    if (display) {
      display.textContent = `${(parseFloat(value) / 3).toFixed(1)} yd`;
    }
    const button = document.getElementById('continue-button');
    if (button) {
      button.textContent = `Continue with ${(parseFloat(value) / 3).toFixed(1)} yd ➤`;
    }
  }

  setMagnitudePreset(value: number): void {
    const slider = document.getElementById(
      'magnitude-slider'
    ) as HTMLInputElement;
    const display = document.getElementById('magnitude-value');

    if (slider && display) {
      slider.value = value.toString();
      this.updateMagnitudeDisplay(slider.value);
      display.textContent = `${(value / 3).toFixed(1)} yd`;
      this.toolManager.setMagnitude(value);
    }
  }

  setMagnitude(value: number): void {
    this.toolManager.setMagnitude(value);
  }

  setAreaMode(mode: 'polygon' | 'polyline'): void {
    this.toolManager.setAreaMode(mode);
  }

  updateThickness(): void {
    const slider = document.getElementById(
      'thickness-slider'
    ) as HTMLInputElement;
    const display = document.getElementById('thickness-value');
    if (slider && display) {
      const thickness = parseFloat(slider.value);
      display.textContent = `${(thickness / 3).toFixed(1)} yd`;
      this.toolManager.setPolylineThickness(thickness);
    }
  }

  setThicknessPreset(value: number): void {
    const slider = document.getElementById(
      'thickness-slider'
    ) as HTMLInputElement;
    const display = document.getElementById('thickness-value');
    if (slider && display) {
      slider.value = value.toString();
      display.textContent = `${(value / 3).toFixed(1)} yd`;
      this.toolManager.setPolylineThickness(value);
    }
  }

  finishDrawing(): void {
    this.toolManager.finishDrawing();
  }

  clearDrawing(): void {
    this.toolManager.clearWorkflow();
  }

  toggleSegmentLabels(): void {
    this.toolManager.toggleLengthLabels();
    this.updateUI(); // Refresh UI to update button text
  }

  setCrossSection(wallType: 'straight' | 'curved' | 'angled'): void {
    const config: CrossSectionConfig = {
      wallType,
      deepestPoint: { x: 0, z: 0 }, // Will be set by clicking on terrain
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
        this.showNotification(
          '✅ Operation completed successfully!',
          '#4CAF50'
        );
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
    const button = document.getElementById('precision-labels-toggle');
    if (button) {
      if (this.labelsVisible) {
        button.style.background = '#4CAF50';
        button.innerHTML = '🏷️ Labels';
      } else {
        button.style.background = '#666';
        button.innerHTML = '🚫 Labels';
      }
    }
  }

  /**
   * Show game info popover instead of trying to switch panels
   */
  backToMain(): void {
    this.showGameInfoPopover();
  }

  /**
   * Create and show a popover with relevant game information
   */
  private showGameInfoPopover(): void {
    // Remove existing popover if any
    const existing = document.getElementById('game-info-popover');
    if (existing) {
      existing.remove();
    }

    // Create popover
    const popover = document.createElement('div');
    popover.id = 'game-info-popover';
    popover.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.95);
      color: white;
      padding: 25px;
      border-radius: 12px;
      font-family: Arial, sans-serif;
      min-width: 400px;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      z-index: 2000;
      border: 2px solid #4CAF50;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    `;

    // Get current game data
    const terrain = this.toolManager.getTerrain();
    const volumeData = terrain
      ? terrain.calculateVolumeDifference()
      : { cut: 0, fill: 0, net: 0 };
    const terrainStats = terrain
      ? terrain.getStats()
      : { vertexCount: 0, triangleCount: 0 };

    // Build popover content
    const content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #4CAF50; padding-bottom: 15px;">
        <h2 style="margin: 0; color: #4CAF50;">🎮 CutFill Game Info</h2>
        <button onclick="document.getElementById('game-info-popover').remove()" style="padding: 8px 12px; background: #F44336; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">✖ Close</button>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
        
        <!-- Volume Analysis -->
        <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px;">
          <h3 style="margin: 0 0 10px 0; color: #FF9800;">📊 Volume Analysis</h3>
          <div style="font-size: 14px; line-height: 1.6;">
            <div style="color: #F44336;">Cut: ${(volumeData.cut / 27).toFixed(2)} yd³</div>
            <div style="color: #2196F3;">Fill: ${(volumeData.fill / 27).toFixed(2)} yd³</div>
            <div style="color: ${Math.abs(volumeData.net) < 1 ? '#4CAF50' : '#FF9800'};">Net: ${(volumeData.net / 27).toFixed(2)} yd³</div>
          </div>
        </div>

        <!-- Terrain Stats -->
        <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px;">
          <h3 style="margin: 0 0 10px 0; color: #9C27B0;">🌍 Terrain Stats</h3>
          <div style="font-size: 14px; line-height: 1.6;">
            <div><strong>Size:</strong> 40 × 40 yd</div>
            <div><strong>Area:</strong> 1,600 yd²</div>
            <div><strong>Depth:</strong> 10 yd</div>
            <div><strong>Vertices:</strong> ${((terrainStats as any).vertexCount || (terrainStats as any).vertices || 0).toLocaleString()}</div>
            <div><strong>Triangles:</strong> ${((terrainStats as any).triangleCount || (terrainStats as any).triangles || 0).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <!-- User Progress -->
      <div style="background: rgba(76,175,80,0.2); padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #4CAF50;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h3 style="margin: 0; color: #4CAF50;">🏆 Progress & Profile</h3>
          <button onclick="precisionUI.logout()" style="padding: 6px 12px; background: #F44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">🚪 Logout</button>
        </div>
        <div style="font-size: 14px; line-height: 1.6;">
          <div><strong>User:</strong> <span id="popover-user-info">Loading...</span></div>
          <div><strong>Level:</strong> <span id="popover-user-level">🌱 Level 1 - Apprentice</span></div>
          <div><strong>XP:</strong> <span id="popover-user-xp">0 / 500 XP</span></div>
          <div><strong>Achievements:</strong> <span id="popover-achievements">0/16 Unlocked</span></div>
          <div><strong>Assignments:</strong> <span id="popover-assignments">0 Completed</span></div>
        </div>
      </div>

      <!-- Current Assignment -->
      <div style="background: rgba(33,150,243,0.2); padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #2196F3;">
        <h3 style="margin: 0 0 10px 0; color: #2196F3;">🎯 Current Assignment</h3>
        <div style="font-size: 14px; line-height: 1.6;">
          <div><strong>Assignment:</strong> <span id="popover-current-assignment">None Selected</span></div>
          <div><strong>Progress:</strong> <span id="popover-assignment-progress">0%</span></div>
          <div><strong>Objective:</strong> <span id="popover-current-objective">Select an assignment to begin</span></div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px;">
        <h3 style="margin: 0 0 15px 0; color: #FF9800;">⚡ Quick Actions</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <button onclick="precisionUI.quickSaveTerrain()" style="padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">💾 Save Terrain</button>
          <button onclick="precisionUI.showAssignments()" style="padding: 10px; background: #9C27B0; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">📋 Assignments</button>
          <button onclick="precisionUI.resetTerrain()" style="padding: 10px; background: #FF9800; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">🔄 Reset Terrain</button>
          <button onclick="precisionUI.exportTerrain()" style="padding: 10px; background: #607D8B; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">📤 Export</button>
        </div>
      </div>

      <!-- Controls Help -->
      <div style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px; border-top: 2px solid #4CAF50;">
        <h4 style="margin: 0 0 10px 0; color: #4CAF50;">🎮 Keyboard Shortcuts</h4>
        <div style="font-size: 12px; line-height: 1.4; color: #ccc;">
          <div><strong>Ctrl+S:</strong> Save terrain state</div>
          <div><strong>R:</strong> Reset terrain</div>
          <div><strong>G:</strong> Generate new terrain</div>
          <div><strong>Enter:</strong> Execute current operation</div>
          <div><strong>Escape:</strong> Reset precision workflow</div>
        </div>
      </div>
    `;

    popover.innerHTML = content;
    document.body.appendChild(popover);

    // Update dynamic content
    this.updatePopoverInfo();

    // Auto-close after 30 seconds
    setTimeout(() => {
      if (document.getElementById('game-info-popover')) {
        popover.remove();
      }
    }, 30000);

    console.log('📋 Game info popover opened');
  }

  /**
   * Update dynamic information in the popover
   */
  private updatePopoverInfo(): void {
    // Check if guest data exists and use it for user info
    const guestData = localStorage.getItem('guestData');
    if (guestData) {
      const parsedGuestData = JSON.parse(guestData);
      const ageRangeText = parsedGuestData.ageRange ? ` (${parsedGuestData.ageRange})` : '';
      const guestDisplayText = `${parsedGuestData.username || 'Guest'}${ageRangeText}`;
      
      const popoverUserInfo = document.getElementById('popover-user-info');
      if (popoverUserInfo) {
        popoverUserInfo.textContent = guestDisplayText;
      }
      
      // Also add age range to the profile section if not already displayed
      const profileSection = popoverUserInfo?.closest('div[style*="border-left: 4px solid #4CAF50"]');
      if (profileSection && parsedGuestData.ageRange) {
        const existingAgeDiv = profileSection.querySelector('#guest-age-info');
        if (!existingAgeDiv) {
          const ageDiv = document.createElement('div');
          ageDiv.id = 'guest-age-info';
          ageDiv.innerHTML = `<div><strong>Age Range:</strong> ${parsedGuestData.ageRange}</div>`;
          ageDiv.style.fontSize = '14px';
          ageDiv.style.lineHeight = '1.6';
          
          // Insert after user info
          const userInfoLine = profileSection.querySelector('div:first-child');
          if (userInfoLine && userInfoLine.nextSibling) {
            userInfoLine.parentNode?.insertBefore(ageDiv, userInfoLine.nextSibling);
          }
        }
      }
    } else {
      // Fallback to regular user info display
      const userInfoElement = document.getElementById('user-info');
      const userInfo = userInfoElement ? userInfoElement.textContent : 'Guest';
      const popoverUserInfo = document.getElementById('popover-user-info');
      if (popoverUserInfo) {
        popoverUserInfo.textContent = userInfo || 'Guest';
      }
    }

    // Update level info
    const levelElement = document.getElementById('user-level');
    const levelInfo = levelElement
      ? levelElement.textContent
      : '🌱 Level 1 - Apprentice';
    const popoverLevel = document.getElementById('popover-user-level');
    if (popoverLevel) {
      popoverLevel.textContent = levelInfo || '🌱 Level 1 - Apprentice';
    }

    // Update XP info
    const xpElement = document.getElementById('user-xp');
    const xpInfo = xpElement ? xpElement.textContent : '0 / 500 XP';
    const popoverXP = document.getElementById('popover-user-xp');
    if (popoverXP) {
      popoverXP.textContent = xpInfo || '0 / 500 XP';
    }

    // Update achievement info
    const achievementElement = document.getElementById('achievement-count');
    const achievementInfo = achievementElement
      ? achievementElement.textContent
      : '🏆 0/16 Achievements';
    const popoverAchievements = document.getElementById('popover-achievements');
    if (popoverAchievements) {
      popoverAchievements.textContent =
        achievementInfo?.replace('🏆 ', '') || '0/16 Unlocked';
    }

    // Update current assignment
    const assignmentElement = document.getElementById('current-assignment');
    const assignmentInfo = assignmentElement
      ? assignmentElement.textContent
      : 'No assignment selected';
    const popoverAssignment = document.getElementById(
      'popover-current-assignment'
    );
    if (popoverAssignment) {
      popoverAssignment.textContent = assignmentInfo || 'None Selected';
    }

    // Update assignment progress
    const progressElement = document.getElementById('assignment-progress');
    const progressInfo = progressElement
      ? progressElement.textContent
      : 'Progress: 0%';
    const popoverProgress = document.getElementById(
      'popover-assignment-progress'
    );
    if (popoverProgress) {
      popoverProgress.textContent =
        progressInfo?.replace('Progress: ', '') || '0%';
    }

    // Update current objective
    const objectiveElement = document.getElementById('objective-text');
    const objectiveInfo = objectiveElement
      ? objectiveElement.textContent
      : 'Select an assignment to begin';
    const popoverObjective = document.getElementById(
      'popover-current-objective'
    );
    if (popoverObjective) {
      popoverObjective.textContent =
        objectiveInfo || 'Select an assignment to begin';
    }
  }

  /**
   * Quick save terrain action
   */
  quickSaveTerrain(): void {
    const terrain = this.toolManager.getTerrain();
    if (terrain) {
      try {
        terrain.saveCurrentState();
        this.showNotification('💾 Terrain saved!', '#4CAF50');
      } catch (error) {
        this.showNotification('❌ Save failed', '#F44336');
      }
    }
    document.getElementById('game-info-popover')?.remove();
  }

  /**
   * Show assignments action
   */
  showAssignments(): void {
    // Trigger assignments display
    const assignmentsBtn = document.getElementById(
      'assignments-btn'
    ) as HTMLButtonElement;
    if (assignmentsBtn) {
      assignmentsBtn.click();
    }
    document.getElementById('game-info-popover')?.remove();
  }

  /**
   * Reset terrain action
   */
  resetTerrain(): void {
    const terrain = this.toolManager.getTerrain();
    if (terrain) {
      terrain.reset();
      this.showNotification('🔄 Terrain reset', '#FF9800');
    }
    document.getElementById('game-info-popover')?.remove();
  }

  /**
   * Export terrain action
   */
  exportTerrain(): void {
    const terrain = this.toolManager.getTerrain();
    if (terrain) {
      const terrainData = terrain.exportTerrain();
      const dataStr = JSON.stringify(terrainData, null, 2);
      const dataUri =
        'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

      const exportFileDefaultName = `terrain_${new Date().toISOString().slice(0, 10)}.json`;
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      this.showNotification('📤 Terrain exported', '#607D8B');
    }
    document.getElementById('game-info-popover')?.remove();
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

  private updateSliderDisplay(value: number): void {
    const display = document.getElementById('thickness-value');
    if (display) {
      display.textContent = `${(value / 3).toFixed(1)} yd`;
    }
  }

  private updateThicknessDisplay(thickness: number): void {
    const display = document.getElementById('thickness-value');
    if (display) {
      display.textContent = `${(thickness / 3).toFixed(1)} yd`;
    }
  }

  public setThickness(value: number): void {
    this.currentThickness = value;
    const slider = document.getElementById(
      'thickness-slider'
    ) as HTMLInputElement;
    const display = document.getElementById('thickness-value');

    if (slider) {
      slider.value = value.toString();
    }

    if (display) {
      display.textContent = `${(value / 3).toFixed(1)} yd`;
    }
  }

  public logout(): void {
    console.log('PrecisionUI.logout() called');

    // ALWAYS clear Supabase session to ensure clean logout
    if (this.authService) {
      this.authService.signOut().catch(error => {
        console.log('Error signing out of Supabase:', error);
      });
    }

    // Check if user is a guest
    const guestData = localStorage.getItem('guestData');
    const isGuest = !!guestData;

    if (isGuest) {
      // Handle guest logout - show guest registration form again
      this.showNotification('👋 Logging out...', '#4CAF50');
      
      // Clear guest data AND hasVisited flag to show guest registration form
      localStorage.removeItem('guestData');
      localStorage.removeItem('hasVisited');
      
      // Close any open popovers
      document.getElementById('game-info-popover')?.remove();
      
      // Reload to show guest registration form
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
      return;
    }

    // Handle authenticated user logout - also show guest registration instead of auth UI
    this.showNotification('👋 You have been logged out.', '#4CAF50');
    
    // Clear all auth data and show guest registration
    localStorage.removeItem('hasVisited');
    localStorage.clear(); // Clear all localStorage to ensure clean state
    
    document.getElementById('game-info-popover')?.remove();
    
    // Reload to show guest registration form
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }
}
