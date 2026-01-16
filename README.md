# Core Orientation — Guess the Angle

A web-based drilling simulation game where you must guess the correct angle to hit an orebody target.

## Game Description

"Guess the Angle" – Rotate the small surface line between -180° and 0°, then drill. The drill extends from the surface into depth. You win if it intersects the circular orebody target. You have 3 tries per round to hit the target while staying within budget.

## Controls

- **Left/Right Arrow Keys**: Rotate angle by ±1°
- **Space**: Start drilling (or try again after a miss)
- **N**: Start a new round
- **DRILL Button**: Start drilling
- **NEW ROUND Button**: Start a new round

## Features

- Real-time angle adjustment
- Animated drilling visualization
- Cost tracking per attempt and accumulated across tries
- Budget system ($500,000 budget)
- Visual feedback for hits and misses
- Miss distance calculation

## Deployment to GitHub Pages

1. Push these files to a GitHub repository
2. Go to repository Settings → Pages
3. Select the branch (usually `main` or `master`)
4. Select the root folder
5. Click Save
6. Your game will be available at `https://[username].github.io/[repository-name]`

## Files

- `index.html` - Main HTML structure
- `style.css` - Styling following the industrial design specification
- `game.js` - Game logic and rendering

## Design

The game follows a dark, technical, industrial aesthetic with:
- Dark blue-gray palette (#0a0c10 background)
- Cyan/orange accents for visual elements
- Monospace typography
- Semi-transparent HUD panels
- Subtle glows and shadows
