// Core Orientation — Guess the Angle
// Web version converted from pygame

// ----------------- World & screen config -----------------
const PX_PER_M = 1.0;
const SURFACE_Y_WORLD = 0.0;
const MAX_DEPTH_WORLD = -900;
const MARGIN_L = 120;
const MARGIN_R = 120;
const MARGIN_T = 80;  // Increased to lower the surface elevation line
const MARGIN_B = -60;

// Screen size
const SCREEN_W = MARGIN_L + 1000 * PX_PER_M + MARGIN_R;
const SCREEN_H = MARGIN_T + (Math.abs(MAX_DEPTH_WORLD) + 120) * PX_PER_M + MARGIN_B;

// Origin point range
const ORIGIN_X_MIN = 100.0;
const ORIGIN_X_MAX = 900.0;

// Target parameters
const TARGET_Y_MIN = -500.0;
const TARGET_Y_MAX = MAX_DEPTH_WORLD;
const TARGET_RADIUS_MIN = 5.0;
const TARGET_RADIUS_MAX = 20.0;
const TARGET_X_MIN = 250;
const TARGET_X_MAX = 900;

// Surface handle
const HANDLE_LEN = 20.0;

// Drilling cost
const DRILL_COST_PER_METER = 300.0;
const DRILL_COST_BUDGET = 500000.0;

// Angle limits
const ANGLE_MIN = -180.0;
const ANGLE_MAX = 0.0;
const ANGLE_DEFAULT = -90.0;

// Colors (from design spec)
const COLORS = {
    BG: '#0a0c10',
    CANVAS_BG: 'rgb(16, 18, 24)',
    GRID: 'rgb(40, 44, 58)',
    CYAN: 'rgb(110, 180, 255)',
    ORANGE: 'rgb(255, 180, 110)',
    GREEN: 'rgb(70, 210, 120)',
    YELLOW: 'rgb(220, 200, 80)',
    RED: 'rgb(230, 80, 90)',
    TEXT_PRIMARY: 'rgb(230, 235, 245)',
    TEXT_SECONDARY: '#8a90a0',
    SURFACE: 'rgb(70, 95, 130)',
    WHITE: 'rgb(240, 244, 252)'
};

// ----------------- Utilities -----------------
function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

function deg2rad(d) {
    return d * Math.PI / 180.0;
}

function worldToScreen(wx, wy) {
    const sx = MARGIN_L + wx * PX_PER_M;
    const sy = MARGIN_T + (-wy) * PX_PER_M;
    return [sx, sy];
}

function lineCircleIntersection(p0, p1, c, r) {
    const [x1, y1] = p0;
    const [x2, y2] = p1;
    const [cx, cy] = c;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - cx;
    const fy = y1 - cy;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const cterm = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * cterm;
    
    if (disc < 0) {
        return [false, null];
    }
    
    const discSqrt = Math.sqrt(disc);
    const t1 = (-b - discSqrt) / (2 * a);
    const t2 = (-b + discSqrt) / (2 * a);
    
    for (const t of [t1, t2]) {
        if (t >= 0.0 && t <= 1.0) {
            const ix = x1 + t * dx;
            const iy = y1 + t * dy;
            return [true, [ix, iy]];
        }
    }
    
    return [false, null];
}

// ----------------- Game State -----------------
class Game {
    constructor() {
        this.angle = ANGLE_DEFAULT;
        this.origin_x = 0.0;
        this.resetRound();
    }
    
    resetRound() {
        this.origin_x = Math.random() * (ORIGIN_X_MAX - ORIGIN_X_MIN) + ORIGIN_X_MIN;
        this.target_x = Math.random() * (TARGET_X_MAX - TARGET_X_MIN) + TARGET_X_MIN;
        this.target_y = Math.random() * (TARGET_Y_MAX - TARGET_Y_MIN) + TARGET_Y_MIN;
        this.target_radius = Math.random() * (TARGET_RADIUS_MAX - TARGET_RADIUS_MIN) + TARGET_RADIUS_MIN;
        this.state = "aim";
        this.drill_tip = [this.origin_x, SURFACE_Y_WORLD];
        this.drill_speed_mps = 900.0;
        this.result_point = null;
        this.tries_remaining = 3;
        this.drill_path_length = 0.0;
        this.total_cost = 0.0;
        this.accumulated_cost = 0.0;
    }
    
    getOrigin() {
        return [this.origin_x, SURFACE_Y_WORLD];
    }
    
    startDrill() {
        if (this.state !== "aim") return;
        this.state = "drilling";
        this.drill_tip = this.getOrigin();
        this.result_point = null;
        this.drill_path_length = 0.0;
    }
    
    update(dt) {
        if (this.state !== "drilling") return;
        
        const theta = deg2rad(this.angle);
        const vx = Math.cos(theta);
        const vy = Math.sin(theta);
        const step = this.drill_speed_mps * dt;
        const nx = this.drill_tip[0] + vx * step;
        const ny = this.drill_tip[1] + vy * step;
        
        const [hit, ipt] = lineCircleIntersection(
            this.drill_tip,
            [nx, ny],
            [this.target_x, this.target_y],
            this.target_radius
        );
        
        if (hit) {
            const final_dx = ipt[0] - this.drill_tip[0];
            const final_dy = ipt[1] - this.drill_tip[1];
            const final_segment = Math.sqrt(final_dx * final_dx + final_dy * final_dy);
            this.drill_path_length += final_segment;
            this.drill_tip = ipt;
            this.state = "win";
            this.result_point = ipt;
            this.total_cost = this.drill_path_length * DRILL_COST_PER_METER;
            this.accumulated_cost += this.total_cost;
            return;
        }
        
        const dx = nx - this.drill_tip[0];
        const dy = ny - this.drill_tip[1];
        const segment_length = Math.sqrt(dx * dx + dy * dy);
        this.drill_path_length += segment_length;
        this.drill_tip = [nx, ny];
        
        if (this.drill_tip[1] <= MAX_DEPTH_WORLD || this.drill_tip[0] > 1100) {
            this.total_cost = this.drill_path_length * DRILL_COST_PER_METER;
            this.accumulated_cost += this.total_cost;
            this.state = "lose";
            this.result_point = null;
            this.tries_remaining -= 1;
        }
    }
}

// ----------------- Drawing -----------------
class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.setCanvasSize();
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.setCanvasSize();
        });
    }
    
    setCanvasSize() {
        // Set actual pixel size (maintain high DPI)
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = SCREEN_W * dpr;
        this.canvas.height = SCREEN_H * dpr;
        this.canvas.style.width = SCREEN_W + 'px';
        this.canvas.style.height = SCREEN_H + 'px';
        // Scale context for high DPI
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    
    drawGrid() {
        this.ctx.fillStyle = COLORS.CANVAS_BG;
        this.ctx.fillRect(280, 0, SCREEN_W - 560, SCREEN_H);
        
        this.ctx.strokeStyle = COLORS.GRID;
        this.ctx.lineWidth = 1;
        
        for (let x = 300; x < SCREEN_W - 300; x += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 40);
            this.ctx.lineTo(x, SCREEN_H - 50);
            this.ctx.stroke();
        }
        
        for (let y = 40; y < SCREEN_H - 50; y += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(300, y);
            this.ctx.lineTo(SCREEN_W - 300, y);
            this.ctx.stroke();
        }
    }
    
    drawBlobShape(centerX, centerY, baseRadius) {
        // Draw an irregular blob shape instead of a perfect circle
        // Create an organic, irregular shape using multiple points
        const numPoints = 16;
        const points = [];
        
        // Use deterministic seed based on center position for consistency
        const seedX = Math.floor(centerX * 0.1);
        const seedY = Math.floor(centerY * 0.1);
        
        // Generate irregular points around the center
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            // Use deterministic variation based on angle and seed to keep it consistent
            const variation1 = Math.sin(angle * 3.7 + seedX) * 0.25;
            const variation2 = Math.cos(angle * 2.3 + seedY) * 0.2;
            const variation3 = Math.sin(angle * 5.1) * 0.15;
            const radius = baseRadius * (0.75 + variation1 + variation2 + variation3);
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            points.push([x, y]);
        }
        
        // Draw filled blob
        this.ctx.fillStyle = COLORS.YELLOW;
        this.ctx.beginPath();
        this.ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            // Use quadratic curves for smoother blob shape
            const nextIdx = (i + 1) % points.length;
            const cpX = (points[i][0] + points[nextIdx][0]) / 2;
            const cpY = (points[i][1] + points[nextIdx][1]) / 2;
            this.ctx.quadraticCurveTo(points[i][0], points[i][1], cpX, cpY);
        }
        this.ctx.closePath();
        this.ctx.fill();
        
        // Draw outline with slightly darker yellow
        this.ctx.strokeStyle = 'rgb(200, 180, 60)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }
    
    drawDrillRigIcon(x, y) {
        // Draw a stylized drilling rig icon above the surface point
        // Icon size: approximately 40px tall, 20px wide
        const rigHeight = 40;
        const rigWidth = 20;
        const baseHeight = 8;
        const baseWidth = 16;
        
        // Save context
        this.ctx.save();
        
        // Position: center x, above surface (y - rigHeight)
        const rigX = x;
        const rigY = y - rigHeight - 5; // 5px gap above surface
        
        // Draw base (blocky structure)
        this.ctx.fillStyle = 'rgb(20, 24, 32)';
        this.ctx.fillRect(rigX - baseWidth/2, rigY + rigHeight - baseHeight, baseWidth, baseHeight);
        
        // Base highlights (orange/brown accents)
        this.ctx.strokeStyle = COLORS.ORANGE;
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeRect(rigX - baseWidth/2, rigY + rigHeight - baseHeight, baseWidth, baseHeight);
        
        // Draw vertical mast (lattice structure)
        const mastWidth = 4;
        const mastX = rigX - mastWidth/2;
        const mastY = rigY;
        const mastHeight = rigHeight - baseHeight;
        
        // Main mast structure (dark)
        this.ctx.fillStyle = 'rgb(15, 18, 25)';
        this.ctx.fillRect(mastX, mastY, mastWidth, mastHeight);
        
        // Mast highlights (orange/cyan accents for depth)
        this.ctx.strokeStyle = COLORS.ORANGE;
        this.ctx.lineWidth = 1;
        
        // Left edge highlight
        this.ctx.beginPath();
        this.ctx.moveTo(mastX, mastY);
        this.ctx.lineTo(mastX, mastY + mastHeight);
        this.ctx.stroke();
        
        // Right edge highlight
        this.ctx.beginPath();
        this.ctx.moveTo(mastX + mastWidth, mastY);
        this.ctx.lineTo(mastX + mastWidth, mastY + mastHeight);
        this.ctx.stroke();
        
        // Horizontal cross members (lattice detail)
        for (let i = 1; i < 4; i++) {
            const crossY = mastY + (mastHeight * i / 4);
            this.ctx.beginPath();
            this.ctx.moveTo(mastX, crossY);
            this.ctx.lineTo(mastX + mastWidth, crossY);
            this.ctx.stroke();
        }
        
        // Top platform/crown
        this.ctx.fillStyle = 'rgb(25, 30, 40)';
        this.ctx.fillRect(rigX - 6, rigY - 2, 12, 4);
        this.ctx.strokeStyle = COLORS.CYAN;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(rigX - 6, rigY - 2, 12, 4);
        
        // Small details - side supports
        this.ctx.strokeStyle = COLORS.ORANGE;
        this.ctx.lineWidth = 1;
        // Left support
        this.ctx.beginPath();
        this.ctx.moveTo(rigX - baseWidth/2, rigY + rigHeight - baseHeight);
        this.ctx.lineTo(rigX - mastWidth/2, rigY + rigHeight - baseHeight - 5);
        this.ctx.stroke();
        // Right support
        this.ctx.beginPath();
        this.ctx.moveTo(rigX + baseWidth/2, rigY + rigHeight - baseHeight);
        this.ctx.lineTo(rigX + mastWidth/2, rigY + rigHeight - baseHeight - 5);
        this.ctx.stroke();
        
        // Restore context
        this.ctx.restore();
    }
    
    drawScene(game) {
        // Surface line
        const [sx1, sy1] = worldToScreen(0, SURFACE_Y_WORLD);
        const [sx2, sy2] = worldToScreen(1000, SURFACE_Y_WORLD);
        
        this.ctx.strokeStyle = COLORS.SURFACE;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(sx1, sy1);
        this.ctx.lineTo(sx2, sy2);
        this.ctx.stroke();
        
        // Origin marker
        const origin = game.getOrigin();
        const [ox, oy] = worldToScreen(...origin);
        
        // Draw drilling rig icon above the origin
        this.drawDrillRigIcon(ox, oy);
        
        this.ctx.fillStyle = COLORS.WHITE;
        this.ctx.beginPath();
        this.ctx.arc(ox, oy, 5, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Surface handle line
        const theta = deg2rad(game.angle);
        const hx = game.origin_x + Math.cos(theta) * HANDLE_LEN;
        const hy = SURFACE_Y_WORLD + Math.sin(theta) * HANDLE_LEN;
        const [h1x, h1y] = worldToScreen(game.origin_x, SURFACE_Y_WORLD);
        const [h2x, h2y] = worldToScreen(hx, hy);
        
        this.ctx.strokeStyle = COLORS.WHITE;
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(h1x, h1y);
        this.ctx.lineTo(h2x, h2y);
        this.ctx.stroke();
        
        // Target orebody - draw as yellow blob shape
        const [tx, ty] = worldToScreen(game.target_x, game.target_y);
        this.drawBlobShape(tx, ty, game.target_radius);
        
        // Drill trace
        if (game.state === "drilling" || game.state === "win" || game.state === "lose") {
            const [dx, dy] = worldToScreen(...game.drill_tip);
            this.ctx.strokeStyle = COLORS.ORANGE;
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(ox, oy);
            this.ctx.lineTo(dx, dy);
            this.ctx.stroke();
            
            if (game.state === "win" && game.result_point) {
                const [ix, iy] = worldToScreen(...game.result_point);
                this.ctx.fillStyle = COLORS.CYAN;
                this.ctx.beginPath();
                this.ctx.arc(ix, iy, 6, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
        
        // Label - positioned above the surface elevation line
        const surfaceY = MARGIN_T; // Surface line Y position
        this.ctx.fillStyle = COLORS.TEXT_SECONDARY;
        this.ctx.font = '14px Consolas, "Courier New", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Section view — 1 px = 1 m (world y negative is down)', SCREEN_W / 2, surfaceY - 20);
    }
    
    drawNotification(game) {
        // Draw notification overlay in the center of the canvas area
        if (game.state === "lose" || game.state === "win") {
            const centerX = SCREEN_W / 2;
            const centerY = SCREEN_H / 2;
            
            // Semi-transparent background
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(280, centerY - 60, SCREEN_W - 560, 120);
            
            // Border
            this.ctx.strokeStyle = game.state === "win" ? COLORS.GREEN : COLORS.RED;
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(280, centerY - 60, SCREEN_W - 560, 120);
            
            // Notification text
            let message = '';
            let color = COLORS.CYAN;
            
            if (game.state === "win") {
                message = 'TARGET HIT! Press N for new round';
                color = COLORS.GREEN;
            } else if (game.state === "lose") {
                if (game.tries_remaining > 0) {
                    message = 'MISS! Press SPACE to try again';
                    color = COLORS.YELLOW;
                } else {
                    message = 'ROUND COMPLETE! Press N for new round';
                    color = COLORS.RED;
                }
            }
            
            this.ctx.fillStyle = color;
            this.ctx.font = 'bold 28px Consolas, "Courier New", monospace';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            // Add text shadow for visibility
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            this.ctx.shadowBlur = 4;
            this.ctx.shadowOffsetX = 2;
            this.ctx.shadowOffsetY = 2;
            
            this.ctx.fillText(message, centerX, centerY);
            
            // Reset shadow
            this.ctx.shadowColor = 'transparent';
            this.ctx.shadowBlur = 0;
            this.ctx.shadowOffsetX = 0;
            this.ctx.shadowOffsetY = 0;
        }
    }
    
    render(game) {
        this.ctx.fillStyle = COLORS.BG;
        this.ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
        
        this.drawGrid();
        this.drawScene(game);
        this.drawNotification(game);
    }
}

// ----------------- UI Updates -----------------
function updateUI(game) {
    // Angle display
    document.getElementById('angleDisplay').textContent = `${game.angle.toFixed(1)}°`;
    document.getElementById('angleDisplay').className = 'hud-value text-cyan';
    
    // Target depth for 1° miss calculation
    const targetDepth = Math.abs(game.target_y);
    document.getElementById('targetDepth').textContent = Math.floor(targetDepth);
    const miss1deg = Math.tan(deg2rad(1.0)) * targetDepth;
    document.getElementById('miss1deg').textContent = miss1deg.toFixed(2);
    
    // Tries
    const triesEl = document.getElementById('triesDisplay');
    triesEl.textContent = `${game.tries_remaining}/3`;
    triesEl.className = game.tries_remaining > 0 ? 'hud-value text-green' : 'hud-value text-red';
    
    // State
    const stateEl = document.getElementById('stateDisplay');
    stateEl.textContent = game.state.toUpperCase();
    if (game.state === "aim") {
        stateEl.className = 'hud-value text-green';
    } else if (game.state === "drilling") {
        stateEl.className = 'hud-value text-yellow';
    } else if (game.state === "win") {
        stateEl.className = 'hud-value text-green';
    } else {
        stateEl.className = 'hud-value text-red';
    }
    
    // Round info
    document.getElementById('targetDepthInfo').textContent = Math.floor(targetDepth);
    document.getElementById('targetXInfo').textContent = Math.floor(game.target_x);
    document.getElementById('targetRadiusInfo').textContent = Math.floor(game.target_radius);
    
    // Result section
    const resultSection = document.getElementById('resultSection');
    const costSection = document.getElementById('costSection');
    const aimSection = document.getElementById('aimSection');
    
    if (game.state === "win" || game.state === "lose") {
        resultSection.style.display = 'block';
        costSection.style.display = 'block';
        aimSection.style.display = 'none';
        
        const resultText = document.getElementById('resultText');
        if (game.state === "win") {
            resultText.textContent = 'Result: HIT!';
            resultText.className = 'hud-value text-green';
        } else {
            resultText.textContent = 'Result: MISS';
            resultText.className = 'hud-value text-red';
            
            // Miss distance
            const theta = deg2rad(game.angle);
            let delta;
            if (Math.abs(game.angle - (-90.0)) < 0.001) {
                delta = Math.abs(game.target_x - game.origin_x);
            } else {
                const y_at_tx = SURFACE_Y_WORLD + Math.tan(theta) * (game.target_x - game.origin_x);
                delta = Math.abs(y_at_tx - game.target_y);
            }
            document.getElementById('missDistanceText').textContent = `Δ miss: ${delta.toFixed(2)} m`;
            document.getElementById('missDistanceText').className = 'hud-text text-yellow';
        }
        
        // Tries left
        const triesLeftText = document.getElementById('triesLeftText');
        const tryAgainInstruction = document.getElementById('tryAgainInstruction');
        const newRoundInstruction = document.getElementById('newRoundInstruction');
        
        if (game.tries_remaining > 0) {
            triesLeftText.textContent = `Tries left: ${game.tries_remaining}`;
            triesLeftText.className = 'hud-text text-yellow';
            tryAgainInstruction.style.display = 'block';
            newRoundInstruction.style.display = 'none';
        } else {
            triesLeftText.textContent = 'No tries left';
            triesLeftText.className = 'hud-text text-red';
            tryAgainInstruction.style.display = 'none';
            newRoundInstruction.style.display = 'block';
        }
        
        // Cost info
        if (game.drill_path_length > 0) {
            document.getElementById('pathLength').textContent = game.drill_path_length.toFixed(2);
            
            const attemptCostEl = document.getElementById('attemptCost');
            attemptCostEl.textContent = `This attempt: $${game.total_cost.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            attemptCostEl.className = game.state === "lose" ? 'hud-value text-red' : 'hud-value text-green';
            
            if (game.accumulated_cost > 0) {
                const accCostEl = document.getElementById('accumulatedCost');
                let accColor;
                if (game.state === "lose" && game.tries_remaining === 0) {
                    accColor = 'text-red';
                } else if (game.state === "win") {
                    accColor = 'text-green';
                } else {
                    accColor = 'text-yellow';
                }
                accCostEl.textContent = `Accumulated: $${game.accumulated_cost.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                accCostEl.className = `hud-value ${accColor}`;
                
                // Budget info
                const budgetInfo = document.getElementById('budgetInfo');
                const budgetDiff = DRILL_COST_BUDGET - game.accumulated_cost;
                if (budgetDiff >= 0) {
                    budgetInfo.innerHTML = `
                        <div class="hud-text">Budget: $${DRILL_COST_BUDGET.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                        <div class="hud-value text-green">Under budget: $${budgetDiff.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    `;
                } else {
                    budgetInfo.innerHTML = `
                        <div class="hud-text">Budget: $${DRILL_COST_BUDGET.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                        <div class="hud-value text-red">Over budget: $${Math.abs(budgetDiff).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                        <div class="hud-text text-red">Team is losing money!</div>
                    `;
                }
            }
        }
    } else {
        resultSection.style.display = 'none';
        costSection.style.display = 'none';
        aimSection.style.display = 'block';
        
        if (game.accumulated_cost === 0 && game.tries_remaining === 3) {
            document.getElementById('budgetInitial').textContent = `Budget: $${DRILL_COST_BUDGET.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            document.getElementById('budgetInitial').className = 'hud-text';
        } else if (game.tries_remaining < 3) {
            // Show accumulated cost while aiming
            const budgetInitial = document.getElementById('budgetInitial');
            const budgetDiff = DRILL_COST_BUDGET - game.accumulated_cost;
            if (budgetDiff >= 0) {
                budgetInitial.innerHTML = `
                    <div>Accumulated: $${game.accumulated_cost.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    <div>Budget: $${DRILL_COST_BUDGET.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    <div class="text-green">Under budget: $${budgetDiff.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                `;
            } else {
                budgetInitial.innerHTML = `
                    <div>Accumulated: $${game.accumulated_cost.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    <div>Budget: $${DRILL_COST_BUDGET.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    <div class="text-red">Over budget: $${Math.abs(budgetDiff).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    <div class="text-red">Team is losing money!</div>
                `;
            }
            budgetInitial.className = 'hud-text';
        }
    }
}

// ----------------- Main -----------------
const canvas = document.getElementById('gameCanvas');
const renderer = new Renderer(canvas);
const game = new Game();

let lastTime = performance.now();

function gameLoop(currentTime) {
    const dt = (currentTime - lastTime) / 1000.0;
    lastTime = currentTime;
    
    game.update(dt);
    renderer.render(game);
    updateUI(game);
    
    requestAnimationFrame(gameLoop);
}

// ----------------- Help Modal -----------------
const helpModal = document.getElementById('helpModal');
const helpBtn = document.getElementById('helpBtn');
const closeHelpBtn = document.getElementById('closeHelpBtn');
const closeHelpBtn2 = document.getElementById('closeHelpBtn2');

function openHelp() {
    helpModal.classList.add('active');
}

function closeHelp() {
    helpModal.classList.remove('active');
}

helpBtn.addEventListener('click', openHelp);
closeHelpBtn.addEventListener('click', closeHelp);
closeHelpBtn2.addEventListener('click', closeHelp);

// Close modal when clicking outside
helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) {
        closeHelp();
    }
});

// Event listeners
document.getElementById('drillBtn').addEventListener('click', () => {
    if (game.state === "aim") {
        game.startDrill();
    } else if (game.state === "lose" && game.tries_remaining > 0) {
        game.state = "aim";
    }
});

document.getElementById('newRoundBtn').addEventListener('click', () => {
    if (game.state === "win" || game.state === "lose" || game.state === "aim") {
        game.resetRound();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // Close help modal if open
        if (helpModal.classList.contains('active')) {
            closeHelp();
            return;
        }
    } else if (game.state === "aim") {
        if (e.key === 'ArrowLeft') {
            game.angle = clamp(game.angle - 1.0, ANGLE_MIN, ANGLE_MAX);
        } else if (e.key === 'ArrowRight') {
            game.angle = clamp(game.angle + 1.0, ANGLE_MIN, ANGLE_MAX);
        }
    }
    
    if (e.key === ' ') {
        e.preventDefault();
        if (game.state === "aim") {
            game.startDrill();
        } else if (game.state === "lose" && game.tries_remaining > 0) {
            game.state = "aim";
        }
    } else if (e.key === 'n' || e.key === 'N') {
        if (game.state === "win" || game.state === "lose" || game.state === "aim") {
            game.resetRound();
        }
    }
});

// Start game loop
updateUI(game);
gameLoop(performance.now());
