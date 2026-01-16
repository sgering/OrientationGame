# core_orientation_guess.py
# "Guess the Angle" – small surface polyline (20 m) rotated between -180°..0° (default -90° = straight down).
# On DRILL, extend the line from the surface into depth; WIN if it intersects a circular orebody
# centered at (x_target, -500 m). World units: 1 px = 1 m. Screen uses a world->screen transform
# that flips Y so negative depth draws downward (as geos prefer: up = +, down = -).

import math
import random
import pygame

# ----------------- World & screen config -----------------
PX_PER_M = 1.0          # 1 px = 1 m (as requested)
SURFACE_Y_WORLD = 0.0   # surface at y = 0 m in world coords
MAX_DEPTH_WORLD = -900  # stop the drill here if no hit (m)
MARGIN_L, MARGIN_R = 120, 120
MARGIN_T, MARGIN_B = 20, -60

# Screen size chosen to comfortably show 0..1000 m in X and ~900 m depth in Y
SCREEN_W = int(MARGIN_L + 1000 * PX_PER_M + MARGIN_R)
SCREEN_H = int(MARGIN_T + (abs(MAX_DEPTH_WORLD) + 120) * PX_PER_M + MARGIN_B)

# Origin point (pivot) on surface in world coords (0, 0). Positioned within the grid area.
ORIGIN_X_MIN = 100.0   # minimum X position (m) - left boundary of usable grid area
ORIGIN_X_MAX = 900.0   # maximum X position (m) - right boundary of usable grid area
# ORIGIN will be set per round in Game class

# Target (orebody) parameters
TARGET_Y_MIN = -500.0              # minimum depth (m)
TARGET_Y_MAX = MAX_DEPTH_WORLD    # maximum depth (m) - target will be random between TARGET_Y_MIN and TARGET_Y_MAX
TARGET_RADIUS_MIN = 5.0            # minimum radius (m)
TARGET_RADIUS_MAX = 20.0           # maximum radius (m) - target radius will be random between these values
TARGET_X_MIN, TARGET_X_MAX = 250, 900  # random X range (m) along surface projection

# Surface handle: the small visible polyline length at surface
HANDLE_LEN = 20.0  # m

# Drilling cost
DRILL_COST_PER_METER = 300.0  # Cost per meter of drilling ($/m)
DRILL_COST_BUDGET = 500000.0  # Total budget for drilling ($)

# Angle limits & default
# -90° = straight down (vertical)
ANGLE_MIN = -180.0
ANGLE_MAX = 0.0
ANGLE_DEFAULT = -90.0

# Colors
BG = (10, 18, 32)
PANEL = (16, 26, 43)
GRID = (27, 41, 66)
INK = (231, 238, 247)
MUTED = (160, 177, 196)
GREEN = (30, 132, 73)
LGREEN = (46, 204, 113)
RED = (255, 107, 107)
YELLOW = (255, 209, 102)
ACCENT = (76, 195, 138)
WHITE = (240, 244, 252)

# ----------------- Utilities -----------------
def clamp(v, a, b): return max(a, min(b, v))
def deg2rad(d): return d * math.pi / 180.0

def world_to_screen(wx, wy):
    """Flip Y so world up (+) draws upward; surface (0) near top margin."""
    sx = int(MARGIN_L + wx * PX_PER_M)
    sy = int(MARGIN_T + (-wy) * PX_PER_M)   # minus because wy<0 should be lower on screen
    return sx, sy

def line_circle_intersection(p0, p1, c, r):
    """Check if segment p0->p1 intersects circle centered at c, radius r.
       p0, p1, c are (x,y) in WORLD coords."""
    (x1, y1), (x2, y2) = p0, p1
    (cx, cy) = c
    dx, dy = (x2 - x1), (y2 - y1)
    fx, fy = (x1 - cx), (y1 - cy)
    a = dx*dx + dy*dy
    b = 2*(fx*dx + fy*dy)
    cterm = fx*fx + fy*fy - r*r
    disc = b*b - 4*a*cterm
    if disc < 0:
        return False, None
    disc_sqrt = math.sqrt(disc)
    t1 = (-b - disc_sqrt) / (2*a)
    t2 = (-b + disc_sqrt) / (2*a)
    # We need an intersection anywhere along the segment [0,1]
    for t in (t1, t2):
        if 0.0 <= t <= 1.0:
            ix = x1 + t*dx
            iy = y1 + t*dy
            return True, (ix, iy)
    return False, None

# ----------------- Game State -----------------
class Game:
    def __init__(self):
        self.angle = ANGLE_DEFAULT  # deg
        self.origin_x = 0.0  # Will be set in reset_round()
        self.reset_round()

    def reset_round(self):
        # Randomize drill origin position horizontally
        self.origin_x = random.uniform(ORIGIN_X_MIN, ORIGIN_X_MAX)
        self.target_x = random.uniform(TARGET_X_MIN, TARGET_X_MAX)
        self.target_y = random.uniform(TARGET_Y_MIN, TARGET_Y_MAX)  # Random depth between -500 and MAX_DEPTH_WORLD
        self.target_radius = random.uniform(TARGET_RADIUS_MIN, TARGET_RADIUS_MAX)  # Random radius between 5 and 20 m
        self.state = "aim"  # "aim" -> "drilling" -> "win"/"lose"
        self.drill_tip = (self.origin_x, SURFACE_Y_WORLD)
        self.drill_speed_mps = 900.0  # m/s on animation (fast, purely visual)
        self.result_point = None
        self.tries_remaining = 3  # Give user 3 tries per round
        self.drill_path_length = 0.0  # Total length of drill path (m)
        self.total_cost = 0.0  # Total cost of drilling ($)
        self.accumulated_cost = 0.0  # Accumulated cost across all tries in this round ($)
    
    def get_origin(self):
        """Get the current origin point as a tuple."""
        return (self.origin_x, SURFACE_Y_WORLD)

    def start_drill(self):
        if self.state != "aim":
            return
        self.state = "drilling"
        self.drill_tip = self.get_origin()
        self.result_point = None
        self.drill_path_length = 0.0  # Reset path length for new drill attempt

    def update(self, dt):
        if self.state != "drilling":
            return
        # Extend line along current angle from origin to max depth or hit
        theta = deg2rad(self.angle)
        vx, vy = math.cos(theta), math.sin(theta)  # world directions; vy positive => up
        # Angle system: -90° = straight down, 0° = right, -180° = left
        # With angles constrained -180..0, sin(theta) is negative (down) for most angles
        # We want to move in the direction of the chosen angle, whatever that is.
        # Step distance this frame:
        step = self.drill_speed_mps * dt
        # Proposed next tip:
        nx = self.drill_tip[0] + vx * step
        ny = self.drill_tip[1] + vy * step

        # Segment from current tip to next tip for intersection
        hit, ipt = line_circle_intersection(self.drill_tip, (nx, ny), (self.target_x, self.target_y), self.target_radius)
        if hit:
            # Calculate path length to intersection point
            final_dx = ipt[0] - self.drill_tip[0]
            final_dy = ipt[1] - self.drill_tip[1]
            final_segment = math.sqrt(final_dx*final_dx + final_dy*final_dy)
            self.drill_path_length += final_segment
            self.drill_tip = ipt
            self.state = "win"
            self.result_point = ipt
            # Calculate total cost
            self.total_cost = self.drill_path_length * DRILL_COST_PER_METER
            # Add to accumulated cost
            self.accumulated_cost += self.total_cost
            return

        # Track path length for this step (only if we didn't hit)
        dx = nx - self.drill_tip[0]
        dy = ny - self.drill_tip[1]
        segment_length = math.sqrt(dx*dx + dy*dy)
        self.drill_path_length += segment_length

        # Update tip if no hit
        self.drill_tip = (nx, ny)

        # If we've crossed max depth or gone off the right edge, lose
        if self.drill_tip[1] <= MAX_DEPTH_WORLD or self.drill_tip[0] > 1100:
            # Calculate total cost based on path length
            self.total_cost = self.drill_path_length * DRILL_COST_PER_METER
            # Add to accumulated cost
            self.accumulated_cost += self.total_cost
            self.state = "lose"
            self.result_point = None
            self.tries_remaining -= 1

# ----------------- Drawing -----------------
def draw_grid(screen):
    # back panels
    screen.fill(BG)
    pygame.draw.rect(screen, PANEL, (0, 0, 280, SCREEN_H))
    pygame.draw.rect(screen, PANEL, (SCREEN_W-280, 0, 280, SCREEN_H))
    # center
    pygame.draw.rect(screen, (15, 23, 38), (280, 0, SCREEN_W-560, SCREEN_H))
    # grid
    for x in range(300, SCREEN_W-300, 50):
        pygame.draw.line(screen, GRID, (x, 40), (x, SCREEN_H-50), 1)
    for y in range(40, SCREEN_H-50, 50):
        pygame.draw.line(screen, GRID, (300, y), (SCREEN_W-300, y), 1)

def text(screen, s, x, y, color=INK, size=18, bold=False, center=False):
    font = pygame.font.SysFont("arial", size, bold=bold)
    surf = font.render(s, True, color)
    rect = surf.get_rect()
    if center:
        rect.center = (x, y)
    else:
        rect.topleft = (x, y)
    screen.blit(surf, rect)

def draw_left_panel(screen, g: Game):
    text(screen, "Guess the Angle", 20, 16, INK, 22, True)
    text(screen, "Rotate the small surface line, then DRILL.", 20, 44, MUTED, 16)
    text(screen, "Controls", 20, 84, INK, 18, True)
    text(screen, "Left/Right: ±1°", 20, 110, MUTED, 16)
    text(screen, "Space: DRILL        N: new round", 20, 132, MUTED, 16)
    text(screen, "Angle clamp: -180° .. 0°", 20, 154, MUTED, 16)

    # Angle readout
    text(screen, "Angle", 20, 198, INK, 16, True)
    text(screen, f"{g.angle:6.1f}°", 20, 222, ACCENT, 28, True)

    # 1° helper at target depth
    target_depth = int(abs(g.target_y))
    text(screen, f"1° miss @ {target_depth} m", 20, 272, INK, 16, True)
    miss_1deg = math.tan(math.radians(1.0)) * abs(g.target_y)
    text(screen, f"≈ {miss_1deg:.2f} m", 20, 294, MUTED, 18)

    # Tries remaining
    text(screen, "Tries", 20, 344, INK, 16, True)
    tries_col = ACCENT if g.tries_remaining > 0 else RED
    text(screen, f"{g.tries_remaining}/3", 20, 368, tries_col, 18, True)
    
    # State
    text(screen, "State", 20, 404, INK, 16, True)
    st_col = ACCENT if g.state == "aim" else (YELLOW if g.state == "drilling" else (ACCENT if g.state=="win" else RED))
    text(screen, g.state.upper(), 20, 428, st_col, 18, True)

def draw_right_panel(screen, g: Game):
    text(screen, "Round Info", SCREEN_W-260, 16, INK, 20, True)
    text(screen, f"Target depth: {int(abs(g.target_y))} m", SCREEN_W-260, 46, MUTED, 16)
    text(screen, f"Target X: {int(g.target_x)} m", SCREEN_W-260, 66, MUTED, 16)
    text(screen, f"Radius: {int(g.target_radius)} m", SCREEN_W-260, 86, MUTED, 16)
    if g.state in ("win", "lose"):
        if g.state == "win":
            text(screen, "Result: HIT!", SCREEN_W-260, 128, ACCENT, 20, True)
        else:
            text(screen, "Result: MISS", SCREEN_W-260, 128, RED, 20, True)
            # Show tries remaining
            if g.tries_remaining > 0:
                text(screen, f"Tries left: {g.tries_remaining}", SCREEN_W-260, 156, YELLOW, 16, True)
                text(screen, "Press SPACE to try again", SCREEN_W-260, 178, MUTED, 14, True)
            else:
                text(screen, "No tries left", SCREEN_W-260, 156, RED, 16, True)
                text(screen, "Press N for new round", SCREEN_W-260, 178, MUTED, 14, True)
        # Show miss distance if MISS
        if g.state == "lose":
            # compute minimum distance from extended ray to circle center at the bottom of path
            # (since we already animate to max depth, we can compute delta at x = target_x)
            theta = deg2rad(g.angle)
            # Handle vertical line (-90°): miss is horizontal distance
            if abs(g.angle - (-90.0)) < 0.001:
                delta = abs(g.target_x - g.origin_x)
            else:
                # y at target_x using the ray
                y_at_tx = SURFACE_Y_WORLD + math.tan(theta) * (g.target_x - g.origin_x)
                delta = abs(y_at_tx - g.target_y)
            # Position miss distance below tries message if tries remain, otherwise below "Press N for new round"
            miss_y = 200 if g.tries_remaining > 0 else 200
            text(screen, f"Δ miss: {delta:.2f} m", SCREEN_W-260, miss_y, YELLOW, 18, True)
        
        # Show drill cost information when drilling is complete
        if g.state in ("win", "lose") and g.drill_path_length > 0:
            # Calculate starting Y position based on state and messages above
            if g.state == "win":
                y_pos = 160  # Below "Result: HIT!"
            else:  # lose
                # Both cases: miss distance is at 200, so start cost info at 222
                y_pos = 222  # Below miss distance (which is at 200)
            
            text(screen, f"Path length: {g.drill_path_length:.2f} m", SCREEN_W-260, y_pos, MUTED, 16, True)
            cost_color = RED if g.state == "lose" else ACCENT
            text(screen, f"This attempt: ${g.total_cost:,.2f}", SCREEN_W-260, y_pos + 22, cost_color, 18, True)
            text(screen, f"(${DRILL_COST_PER_METER:.2f}/m)", SCREEN_W-260, y_pos + 44, MUTED, 14, True)
            # Show accumulated cost across all tries
            if g.accumulated_cost > 0:
                acc_cost_color = RED if g.state == "lose" and g.tries_remaining == 0 else (ACCENT if g.state == "win" else YELLOW)
                text(screen, f"Accumulated: ${g.accumulated_cost:,.2f}", SCREEN_W-260, y_pos + 66, acc_cost_color, 18, True)
                # Show budget status
                budget_diff = DRILL_COST_BUDGET - g.accumulated_cost
                if budget_diff >= 0:
                    text(screen, f"Budget: ${DRILL_COST_BUDGET:,.2f}", SCREEN_W-260, y_pos + 88, MUTED, 16, True)
                    text(screen, f"Under budget: ${budget_diff:,.2f}", SCREEN_W-260, y_pos + 110, ACCENT, 18, True)
                else:
                    text(screen, f"Budget: ${DRILL_COST_BUDGET:,.2f}", SCREEN_W-260, y_pos + 88, MUTED, 16, True)
                    text(screen, f"Over budget: ${abs(budget_diff):,.2f}", SCREEN_W-260, y_pos + 110, RED, 18, True)
                    text(screen, "Team is losing money!", SCREEN_W-260, y_pos + 132, RED, 16, True)
    else:
        text(screen, "Press SPACE to drill", SCREEN_W-260, 128, INK, 18, True)
        # Show budget if no attempts yet
        if g.accumulated_cost == 0 and g.tries_remaining == 3:
            text(screen, f"Budget: ${DRILL_COST_BUDGET:,.2f}", SCREEN_W-260, 156, MUTED, 16, True)
        # Show tries remaining if they've used some
        elif g.tries_remaining < 3:
            text(screen, f"Tries left: {g.tries_remaining}/3", SCREEN_W-260, 156, YELLOW, 16, True)
            # Show accumulated cost if there have been attempts
            if g.accumulated_cost > 0:
                text(screen, f"Accumulated: ${g.accumulated_cost:,.2f}", SCREEN_W-260, 178, YELLOW, 18, True)
                # Show budget status
                budget_diff = DRILL_COST_BUDGET - g.accumulated_cost
                if budget_diff >= 0:
                    text(screen, f"Budget: ${DRILL_COST_BUDGET:,.2f}", SCREEN_W-260, 200, MUTED, 16, True)
                    text(screen, f"Under budget: ${budget_diff:,.2f}", SCREEN_W-260, 222, ACCENT, 18, True)
                else:
                    text(screen, f"Budget: ${DRILL_COST_BUDGET:,.2f}", SCREEN_W-260, 200, MUTED, 16, True)
                    text(screen, f"Over budget: ${abs(budget_diff):,.2f}", SCREEN_W-260, 222, RED, 18, True)
                    text(screen, "Team is losing money!", SCREEN_W-260, 244, RED, 16, True)

def draw_scene(screen, g: Game):
    # Surface line (world y=0)
    sx1, sy1 = world_to_screen(0, SURFACE_Y_WORLD)
    sx2, sy2 = world_to_screen(1000, SURFACE_Y_WORLD)
    pygame.draw.line(screen, (70, 95, 130), (sx1, sy1), (sx2, sy2), 2)

    # Origin marker
    origin = g.get_origin()
    ox, oy = world_to_screen(*origin)
    pygame.draw.circle(screen, WHITE, (ox, oy), 5)

    # Small surface handle line (20 m) showing current angle; visible only at surface
    # Direction from angle
    theta = deg2rad(g.angle)
    hx = g.origin_x + math.cos(theta) * HANDLE_LEN
    hy = SURFACE_Y_WORLD + math.sin(theta) * HANDLE_LEN
    h1 = world_to_screen(g.origin_x, SURFACE_Y_WORLD)
    h2 = world_to_screen(hx, hy)
    pygame.draw.line(screen, WHITE, h1, h2, 3)

    # Target orebody (circle)
    tx, ty = world_to_screen(g.target_x, g.target_y)
    pygame.draw.circle(screen, LGREEN, (tx, ty), int(g.target_radius), 0)
    pygame.draw.circle(screen, GREEN, (tx, ty), int(g.target_radius), 3)

    # If drilling or finished, draw the drill trace (animated)
    if g.state in ("drilling", "win", "lose"):
        # Draw segment from origin to current drill tip
        dx, dy = world_to_screen(*g.drill_tip)
        pygame.draw.line(screen, RED, (ox, oy), (dx, dy), 3)
        # If win, draw a small highlight at intersection
        if g.state == "win" and g.result_point:
            ix, iy = world_to_screen(*g.result_point)
            pygame.draw.circle(screen, ACCENT, (ix, iy), 6)

    # Labels
    text(screen, "Section view — 1 px = 1 m (world y negative is down)", SCREEN_W//2, 30, MUTED, 14, center=True)

# ----------------- Main loop -----------------
def main():
    pygame.init()
    screen = pygame.display.set_mode((SCREEN_W, SCREEN_H))
    pygame.display.set_caption("Core Orientation — Guess the Angle")
    clock = pygame.time.Clock()

    g = Game()

    running = True
    while running:
        dt = clock.tick(60) / 1000.0

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                mods = pygame.key.get_mods()
                big = bool(mods & pygame.KMOD_SHIFT)

                if event.key == pygame.K_ESCAPE:
                    running = False
                elif g.state == "aim":
                    if event.key == pygame.K_LEFT:
                        g.angle = clamp(g.angle - 1.0, ANGLE_MIN, ANGLE_MAX)  # Rotate 1° left
                    elif event.key == pygame.K_RIGHT:
                        g.angle = clamp(g.angle + 1.0, ANGLE_MIN, ANGLE_MAX)  # Rotate 1° right
                # Drill / new round
                if event.key == pygame.K_SPACE:
                    if g.state == "aim":
                        g.start_drill()
                    elif g.state == "lose" and g.tries_remaining > 0:
                        # Allow another try if tries remaining
                        g.state = "aim"
                elif event.key == pygame.K_n and g.state in ("win", "lose", "aim"):
                    g.reset_round()

        # Update
        g.update(dt)

        # Draw
        draw_grid(screen)
        draw_left_panel(screen, g)
        draw_right_panel(screen, g)
        draw_scene(screen, g)

        pygame.display.flip()

    pygame.quit()

if __name__ == "__main__":
    main()
