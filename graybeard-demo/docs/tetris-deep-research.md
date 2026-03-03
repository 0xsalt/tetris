# Proven Implementation Logic for a Tetris Web Game: Game Loop, Gravity, Input, Collision, Lock Delay, and Piece Locking

---

## Abstract

This report synthesizes contemporary research and canonical implementations for building a robust Tetris web game, focusing on the core game loop, fixed-tick gravity, input handling, collision detection, lock delay, prevention of infinite floor sliding/spin spam, and correct piece locking. Drawing from academic literature, open-source projects, and authoritative community discussions, it presents a comprehensive, multi-level analysis with clear recommendations and concrete algorithms, emphasizing modern JavaScript/TypeScript approaches for both Canvas and DOM rendering. The report prioritizes recent, reliable sources and integrates findings from reinforcement learning, AI, and game development practice, providing a clear, actionable blueprint for developers.

---

## 1. Introduction

Tetris remains a canonical case study in game development and AI research due to its deceptively simple rules, emergent complexity, and the need for precise real-time mechanics ([Maricar, 2026](https://medium.com/@maricar.riswane/from-tetris-to-tetris-effect-366cc90a0134)). A robust Tetris implementation must faithfully reproduce the core gameplay loop, including gravity, user input, collision detection, lock delay, and anti-infinite stalling mechanisms, while supporting extensibility for AI agents and modern web technologies ([Tetris Guideline](https://tetris.wiki/Tetris_Guideline); [Straker, 2017](https://gist.github.com/straker/3c98304f8a6a9174efd8292800891ea1)). This report details the proven logic and algorithms necessary for such an implementation, with a focus on clarity, performance, and adherence to modern standards.

---

## 2. The Tetris Game Loop: Fixed Tick Gravity and Timing

### 2.1. Fixed Timestep vs. Variable Timestep

A canonical Tetris game loop separates physics updates (logic) from rendering, using a fixed timestep for gravity and lock delay to ensure consistent simulation regardless of frame rate ([GameDev.net, 2018](https://www.gamedev.net/forums/topic/695499-am-i-understanding-fixed-timestep-games-loop-wrong/)). This prevents issues where pieces fall faster or slower depending on device performance.

**Best Practice:**  
- Use `requestAnimationFrame` for smooth rendering ([Straker, 2017](https://gist.github.com/straker/3c98304f8a6a9174efd8292800891ea1)).
- Maintain a logic timer (e.g., `gravityTimer`) that accumulates elapsed time.
- When `gravityTimer` exceeds the gravity interval (e.g., 500ms at level 1), trigger a gravity step (piece falls one row).
- Reset `gravityTimer` after each gravity step.

**Example (JS/TS Pseudocode):**
```js
let lastUpdate = performance.now();
let gravityInterval = 500; // ms, decreases with level
let gravityTimer = 0;

function gameLoop(now) {
    let delta = now - lastUpdate;
    lastUpdate = now;
    gravityTimer += delta;

    while (gravityTimer >= gravityInterval) {
        movePieceDown();
        gravityTimer -= gravityInterval;
    }

    render();
    requestAnimationFrame(gameLoop);
}
```
This approach ensures deterministic gravity and lock delay, regardless of rendering FPS.

---

### 2.2. Gravity Acceleration

Gravity should accelerate as the player progresses, typically by reducing the interval between gravity steps ([K. Liu et al., 2012](https://www.researchgate.net/publication/400667049_Reinforcement_Learning_for_Tetris_Game_with_Genetic_Algorithms)). Modern implementations use a lookup table or formula to map level to gravity speed.

---

## 3. Input Handling

### 3.1. Keyboard Events

Tetris requires responsive input for left/right movement, rotation, soft drop, hard drop, and hold (if supported). Use `keydown` and `keyup` events for robust input ([Scribd, 2024](https://www.scribd.com/document/800693766/JavaScript-Games-in-the-DOM-Comprehensive-Guide)).

**Key Points:**
- Implement Delayed Auto Shift (DAS) and Auto Repeat Rate (ARR) for smooth movement when keys are held ([Tetris Guideline](https://tetris.wiki/Tetris_Guideline)).
- Prevent input lag by decoupling input polling from the main game loop.

**Example:**
```js
document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);
```

### 3.2. Input Buffering

Buffering inputs (especially rotations and drops) is essential at high gravity speeds to ensure playability ([Eide, 2024](https://substack.com/home/post/p-143309633?utm_campaign=post&utm_medium=web)). Implement a queue for pending inputs, processed at each logic tick.

---

## 4. Collision Detection

### 4.1. Grid-Based Collision

Tetris collision detection is efficiently handled at the grid level, not pixel level ([Processing Forum, 2014](https://forum.processing.org/two/discussion/6314/a-simple-collision-system-for-a-tetris-game-a-strange-idea.html); [Envato Tuts+, 2017](https://code.tutsplus.com/implementing-tetris-collision-detection--gamedev-852t)). Both the playfield and the active piece are represented as 2D arrays.

**Algorithm:**
- For each cell in the tetromino's shape, compute its absolute position on the board.
- If any cell is out of bounds or overlaps a non-empty cell in the board array, the move is invalid.

**Example (JS/TS):**
```js
function isValidPosition(piece, board, offsetX, offsetY) {
    for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
            if (piece.shape[y][x]) {
                let boardX = offsetX + x;
                let boardY = offsetY + y;
                if (
                    boardX < 0 || boardX >= board[0].length ||
                    boardY < 0 || boardY >= board.length ||
                    board[boardY][boardX]
                ) {
                    return false;
                }
            }
        }
    }
    return true;
}
```
This method is canonical and widely used in both academic and production code ([Envato Tuts+, 2017](https://code.tutsplus.com/implementing-tetris-collision-detection--gamedev-852t)).

---

## 5. Lock Delay and Piece Locking

### 5.1. Lock Delay Models

Modern Tetris games implement a **lock delay**—a grace period after a piece lands before it is locked in place. This allows for last-moment adjustments (e.g., tucks and spins) ([Tetris Guideline](https://tetris.wiki/Lock_delay); [Substack, 2024](https://substack.com/home/post/p-143309633?utm_campaign=post&utm_medium=web)). There are three canonical lock delay systems:

| System         | Description                                                                 | Modern Usage          |
|----------------|-----------------------------------------------------------------------------|----------------------|
| Infinity       | Unlimited resets on movement/rotation (discouraged; allows infinite stalling) | Deprecated           |
| Move Reset     | Lock delay resets on any movement/rotation, but with a reset cap (e.g., 15)  | Standard (Guideline) |
| Step Reset     | Lock delay resets only when the piece drops a row                            | Rare (Legacy)        |

**Move Reset with a cap** is the modern standard ([Tetris Guideline](https://tetris.wiki/Tetris_Guideline)).

### 5.2. Implementation Logic

- When a piece lands (cannot move down), start a lock delay timer (e.g., 500ms).
- Each valid move or rotation resets the timer, but only up to a maximum number of resets (e.g., 15).
- If the piece cannot move down and the timer expires, lock the piece in place.
- If the piece moves up (e.g., via wall kick), reset the lock delay.
- If the piece moves down (gravity or soft drop), apply "step reset" if desired.

**Example (JS/TS Pseudocode):**
```js
let lockDelay = 500; // ms
let lockTimer = 0;
let lockResets = 0;
let maxLockResets = 15;

function onPieceLand() {
    lockTimer = 0;
    lockResets = 0;
}

function onPieceMoveOrRotate() {
    if (lockResets < maxLockResets) {
        lockTimer = 0;
        lockResets++;
    }
}

function updateLockDelay(delta) {
    if (pieceCannotMoveDown()) {
        lockTimer += delta;
        if (lockTimer >= lockDelay) {
            lockPiece();
        }
    } else {
        lockTimer = 0;
        lockResets = 0;
    }
}
```
This logic prevents infinite stalling while allowing skillful maneuvers ([Tetris Guideline](https://tetris.wiki/Lock_delay); [smartspot2, 2024](https://github.com/smartspot2/tetris-ai)).

---

## 6. Preventing Infinite Floor Sliding/Spin Spam

### 6.1. The "Infinity" Problem

Allowing unlimited lock delay resets enables players (or bots) to indefinitely "slide" or "spin" pieces on the floor, breaking game flow ([Tetris Wiki, 2024](https://tetris.wiki/Infinity)). To prevent this:

- **Enforce a cap on lock delay resets** (see above).
- **Force lock** when the reset cap is reached, regardless of further movement or rotation.

### 6.2. Canonical Solution

The Tetris Guideline recommends a **15-move reset cap** ([Tetris Guideline](https://tetris.wiki/Tetris_Guideline)). This is implemented in all modern, competitive Tetris games and is essential for both fair play and AI research ([Substack, 2024](https://substack.com/home/post/p-143309633?utm_campaign=post&utm_medium=web)).

---

## 7. Piece Locking at Bottom/Stack

When a piece is locked (either by gravity, hard drop, or lock delay expiration):

- Merge the piece's blocks into the board array.
- Check for line clears and remove full rows.
- Spawn the next piece at the top.
- If the spawn position is blocked, trigger game over ([Envato Tuts+, 2017](https://code.tutsplus.com/implementing-tetris-collision-detection--gamedev-852t)).

**Example (JS/TS):**
```js
function lockPiece() {
    for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
            if (piece.shape[y][x]) {
                let boardX = piece.x + x;
                let boardY = piece.y + y;
                board[boardY][boardX] = piece.type;
            }
        }
    }
    clearLines();
    spawnNextPiece();
}
```

---

## 8. Rendering: Canvas vs. DOM

### 8.1. Canvas

- **Advantages:** Efficient for grid-based games, easy to scale, minimal DOM overhead ([GSAP, 2014](https://gsap.com/community/forums/topic/10487-performance-difference-between-dom-vs-canvas-using-greensock/)).
- **Best for:** Games with many moving elements, custom graphics, or pixel-perfect control ([DEV.to, 2024](https://dev.to/codehuntersharath/creating-tetris-game-with-html-css-canvas-and-javascript-complete-guide-2i6h)).

### 8.2. DOM

- **Advantages:** Easy UI integration, accessibility, CSS styling ([Scribd, 2024](https://www.scribd.com/document/800693766/JavaScript-Games-in-the-DOM-Comprehensive-Guide)).
- **Limitations:** Performance drops with many elements; less suited for high-frequency updates ([GSAP, 2014](https://gsap.com/community/forums/topic/10487-performance-difference-between-dom-vs-canvas-using-greensock/)).

**Recommendation:**  
Use Canvas for the main playfield and DOM for overlays/UI (score, next piece, etc.) ([GameDev StackExchange, 2012](https://gamedev.stackexchange.com/questions/23023/to-canvas-or-not-to-canvas-when-building-browser-based-games)).

---

## 9. Reference Implementations

### 9.1. Canonical JS/TS Implementations

- [Straker's Tetris (Canvas, JS)](https://gist.github.com/straker/3c98304f8a6a9174efd8292800891ea1): Clean, modern, open-source implementation with fixed-tick gravity, lock delay, and grid-based collision.
- [smartspot2/tetris-ai (p5.js, AI-ready)](https://github.com/smartspot2/tetris-ai): Implements lock delay, move reset, and AI constraints for realistic play.
- [DEV.to Complete Guide](https://dev.to/codehuntersharath/creating-tetris-game-with-html-css-canvas-and-javascript-complete-guide-2i6h): Step-by-step tutorial for building Tetris with HTML5 Canvas and JavaScript.

### 9.2. Key Algorithms and Models

| Feature             | Canonical Algorithm/Model                                 | Reference Implementation               |
|---------------------|----------------------------------------------------------|----------------------------------------|
| Game Loop           | Fixed timestep, separate logic/render                     | Straker, smartspot2                    |
| Gravity             | Timer-based, level-adjusted interval                     | Straker, smartspot2                    |
| Input Handling      | Keydown/up, DAS/ARR, input buffer                        | Straker, Tetris Guideline              |
| Collision Detection | Grid-based, per-cell overlap check                       | Straker, Envato Tuts+, Processing Forum|
| Lock Delay          | Move reset with cap, lock timer per piece                | smartspot2, Tetris Guideline           |
| Anti-Infinity       | Cap lock resets, force lock after N moves                | Tetris Guideline, smartspot2           |
| Piece Locking       | Merge piece to board, clear lines, spawn next            | Straker, Envato Tuts+                  |

---

## 10. Advanced Considerations: AI and Reinforcement Learning

### 10.1. State Representation

Efficient AI agents use summarized board features (column heights, holes, bumpiness) rather than full grid input, reducing state space and improving learning ([Tsirovasilis, 2021](https://dione.lib.unipi.gr/xmlui/bitstream/handle/unipi/13891/Thesis___Big_Data___Analytics__Ioannis_Tsirovasilis_.pdf?sequence=1&isAllowed=y); [michiel-cox/Tetris-DQN](https://github.com/michiel-cox/Tetris-DQN)).

### 10.2. Lock Delay and AI

AI agents must respect lock delay and move reset caps to avoid unrealistic strategies ([smartspot2, 2024](https://github.com/smartspot2/tetris-ai)). Reinforcement learning and genetic algorithms can outperform traditional heuristics, but only when the environment faithfully enforces these constraints ([ResearchGate, 2025](https://www.researchgate.net/publication/398901013_Optimizing_Tetris_Gameplay_Using_Reinforcement_Learning_Framework_with_Adaptive_Genetic_Algorithms)).

---

## 11. Synthesis and Recommendations

- **Fixed-tick gravity and lock delay** are essential for consistent, fair gameplay and AI research.
- **Move reset lock delay with a cap** (e.g., 15 resets) is the proven standard to prevent infinite stalling.
- **Grid-based collision detection** is canonical and efficient.
- **Canvas rendering** is preferred for the playfield; DOM is suitable for UI overlays.
- **Reference implementations** (Straker, smartspot2) provide reliable, modern codebases.
- **AI integration** requires careful state representation and strict adherence to gameplay constraints.

**Concrete Opinion:**  
The most robust, scalable, and research-proven approach to Tetris web game implementation is a fixed-timestep game loop with timer-driven gravity, grid-based collision, move-reset lock delay (with cap), and Canvas-based rendering. This architecture is not only optimal for player experience and performance but is also essential for fair benchmarking of AI agents, as demonstrated by leading open-source projects and academic research. Any deviation from these standards risks introducing exploits, non-determinism, or unplayable edge cases, especially in competitive or AI-driven environments.

---

## References

- [Tetris Guideline](https://tetris.wiki/Tetris_Guideline)
- [Tetris Lock Delay](https://tetris.wiki/Lock_delay)
- [Tetris Infinity Mechanic](https://tetris.wiki/Infinity)
- [Straker's Tetris JS Implementation](https://gist.github.com/straker/3c98304f8a6a9174efd8292800891ea1)
- [smartspot2/tetris-ai](https://github.com/smartspot2/tetris-ai)
- [DEV.to Tetris Guide](https://dev.to/codehuntersharath/creating-tetris-game-with-html-css-canvas-and-javascript-complete-guide-2i6h)
- [GSAP Forum: DOM vs Canvas Performance](https://gsap.com/community/forums/topic/10487-performance-difference-between-dom-vs-canvas-using-greensock/)
- [Processing Forum: Tetris Collision](https://forum.processing.org/two/discussion/6314/a-simple-collision-system-for-a-tetris-game-a-strange-idea.html)
- [Envato Tuts+: Tetris Collision Detection](https://code.tutsplus.com/implementing-tetris-collision-detection--gamedev-852t)
- [GameDev StackExchange: Canvas vs DOM](https://gamedev.stackexchange.com/questions/23023/to-canvas-or-not-to-canvas-when-building-browser-based-games)
- [Scribd: JS Games in the DOM](https://www.scribd.com/document/800693766/JavaScript-Games-in-the-DOM-Comprehensive-Guide)
- [Substack: Score One Million Tetris Points](https://substack.com/home/post/p-143309633?utm_campaign=post&utm_medium=web)
- [ResearchGate: Optimizing Tetris Gameplay Using RL and GAs](https://www.researchgate.net/publication/398901013_Optimizing_Tetris_Gameplay_Using_Reinforcement_Learning_Framework_with_Adaptive_Genetic_Algorithms)
- [Tsirovasilis, I. (2021). Thesis on Tetris RL](https://dione.lib.unipi.gr/xmlui/bitstream/handle/unipi/13891/Thesis___Big_Data___Analytics__Ioannis_Tsirovasilis_.pdf?sequence=1&isAllowed=y)
- [michiel-cox/Tetris-DQN](https://github.com/michiel-cox/Tetris-DQN)
- [Maricar, R. (2026). From Tetris to Tetris Effect](https://medium.com/@maricar.riswane/from-tetris-to-tetris-effect-366cc90a0134)
- [GameDev.net: Fixed Timestep Loop](https://www.gamedev.net/forums/topic/695499-am-i-understanding-fixed-timestep-games-loop-wrong/)
- [K. Liu et al., 2012. Tetris FPGA Implementation](https://www.researchgate.net/publication/400667049_Reinforcement_Learning_for_Tetris_Game_with_Genetic_Algorithms)

---

*This report reflects the state of the art as of March 3, 2026, and prioritizes recent, reliable, and canonical sources for the implementation of Tetris web games.*