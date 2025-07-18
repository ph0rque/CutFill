# Plan for implementing multilevel game features
_Exported on 7/18/2025 at 10:09:00 CDT from Cursor (1.2.4)_

---

**User**

Review cursor rules and the memory bank, then the rest of the code. Paying attention especially to the @assignment.md , suggest a plan of action for implementing the game features to this app. Specifically, I want to turn assignments into levels, then make it multilevel. 2 or more players should compete on any one level. They gain points for 1) completing the objective of the level, 2) achieving net zero cut-fill volume, (or as close to it as possible), and finally 3) using the least number of cut-fill operations to achieve the above.

---

**Cursor**

### Plan of Action for Implementing Multi-Level Competitive Gameplay in CutFill

Based on my review of the Cursor rules (which emphasize maintaining a Memory Bank for project intelligence and using `.cursor/rules/` for patterns like coding standards and architecture decisions—I've noted the existing rules in `development.mdc`, `game-design.mdc`, and `base.mdc` for consistency), the Memory Bank files (which confirm CutFill as an educational 3D earthworks game with core mechanics around terrain manipulation, assignments as educational objectives, and real-time multiplayer via Socket.io/Supabase), and the codebase (especially `assignments.ts` for objective-based tasks, `multiplayer-enhanced.ts` and `collaborative-features.ts` for player sessions and shared objectives, and `progress.ts` for XP/scoring), here's a structured plan to transform existing assignments into competitive multi-level gameplay.

This plan aligns with the Game Week Project Guide in `assignment.md` (e.g., multiplayer support, progression systems, engagement via scoring/objectives). It builds on the current system where assignments are templated objectives (e.g., leveling areas, grading roads) with scoring (0-100 based on tolerances like volume balance). We'll evolve these into "levels" with competitive multiplayer (2+ players), adding points for objective completion, net-zero cut-fill (prioritizing closeness to zero), and minimal operations. I'll prioritize minimal disruption to existing architecture (e.g., reuse `AssignmentManager` for level management, extend `EnhancedMultiplayerManager` for competition).

The plan is divided into phases for a 3-5 day implementation (assuming AI-accelerated dev as per the project brief). Total estimated effort: ~20-30 hours, focusing on backend synchronization for low-latency multiplayer.

#### Phase 1: Preparation and Restructuring (1-2 hours)
   - **Goal:** Repurpose assignments as levels without breaking existing single-player functionality.
   - **Steps:**
     1. In `src/src/assignments.ts`:
        - Add a `levelNumber: number` field to `AssignmentConfig` interface (e.g., assign levels 1-10 based on `difficulty` or manually sequence the templates in `getAssignmentTemplates()`).
        - Update `AssignmentManager` to include level progression: Add methods like `getAvailableLevels()` (filter assignments by unlocked status) and `unlockNextLevel()` (called on completion, updating user progress in Supabase via `updateUserProgress()`).
        - Integrate net-zero scoring: In `evaluateObjective()`, add a new objective type (e.g., `'net_zero'`) that scores based on `Math.abs(volumeData.netMovement)` (e.g., full points if <5% tolerance, scaled down otherwise). Weight it at 30% of total score.
     2. In `src/src/progress.ts`:
        - Extend `UserProgress` with `unlockedLevels: number[]` and `levelScores: Record<number, { score: number; operations: number; netVolume: number }>` for tracking per-level performance.
        - Update `updateUserProgress()` to record level-specific data and unlock the next level (e.g., if level 1 completed, unlock level 2).
     3. Database updates (in `src/src/supabase.ts` or via Supabase dashboard):
        - Add columns to `user_progress` table: `unlocked_levels` (array of integers) and `level_scores` (JSONB for per-level data).
        - Ensure assignments table supports leveling (add `level_number` column and populate for existing templates).
   - **Rationale:** Builds on existing assignment templates (e.g., 'foundation_prep_1' becomes Level 1) and progress tracking. No new files needed yet.
   - **Potential Challenges:** Ensure backward compatibility for non-competitive play; test with guest users (who skip DB saves).

#### Phase 2: Implement Multi-Level Progression (4-6 hours)
   - **Goal:** Create a multi-level system where players advance through sequenced assignments.
   - **Steps:**
     1. In `src/src/assignment-ui.ts`:
        - Update UI to display "Levels" instead of "Assignments" (e.g., rename modal to "Level Selection" and show locked/unlocked status with icons like 🔒 for locked levels).
        - Add progression visualization: A progress bar showing unlocked levels (e.g., "Level 1/10 Unlocked") tied to `UserProgress.unlockedLevels`.
     2. In `src/src/assignments.ts`:
        - Modify `startAssignment()` to validate level unlocking (e.g., check if `levelNumber` is in user's unlocked levels).
        - On completion (in `completeAssignment()`), call `unlockNextLevel()` and award XP (e.g., base 100 XP + bonuses for net-zero and low operations).
     3. Add operation counting:
        - In `AssignmentProgress`, add `operationCount: number` (increment in `addToolUsage()` or during terrain mods in `main.ts`/`precision-tools.ts`).
        - Score it: In `updateProgress()`, add a metric where fewer operations = higher points (e.g., normalize against an "ideal" count per level, weighted at 20% of score).
   - **Rationale:** Leverages existing `AssignmentManager` for sequencing; ties into `progress.ts` for XP-based unlocks (e.g., start with Level 1 unlocked, require 70%+ score to unlock next).
   - **Testing:** Simulate single-player level progression; verify unlocks persist via Supabase.

#### Phase 3: Add Competitive Multiplayer (6-8 hours)
   - **Goal:** Enable 2+ players to compete on the same level with real-time scoring.
   - **Steps:**
     1. In `src/src/multiplayer-enhanced.ts`:
        - Extend `GameSession` with `currentLevel: number` and `levelScores: Record<string, { objectivePoints: number; netZeroPoints: number; operationsPoints: number; total: number }>` (per player).
        - Add events for level start/completion: `startLevel(levelNumber)` emits to server, syncing terrain and objectives for all players.
        - In `modifyTerrain()`, track operations per player and broadcast (e.g., increment player's operation count in session state).
     2. In `src/src/collaborative-features.ts`:
        - Create a new assignment type `'competitive_level'` in `initializeCollaborativeAssignments()` (extend existing competitive templates like 'speed_foundation_race').
        - In `updateTeamProgress()`, adapt for competition: Calculate per-player scores in real-time (e.g., objective completion: 50% of points, net-zero closeness: 30%, least operations: 20%). Use `progress` maps for individual tracking.
        - Add leaderboard sync: Every 5s, emit updated scores to all players.
     3. Integrate with assignments:
        - In `AssignmentManager.startAssignment()`, if in multiplayer session, set mode to competitive and sync via `multiplayerManager`.
        - On level end, rank players (e.g., winner gets bonus XP in `progress.ts`).
     4. Handle net-zero and operations in scoring:
        - Net-zero: Score = 100 * (1 - (abs(netMovement) / totalVolume)), synced per player.
        - Operations: Score = 100 * (minOperations / playerOperations), where minOperations is a level-defined ideal (add to `AssignmentConfig`).
   - **Rationale:** Builds on existing competitive templates and shared objectives; ensures low-latency via Socket.io (e.g., broadcast mods and scores).
   - **Testing:** Host 2-4 player sessions; verify real-time score updates and winner determination.

#### Phase 4: UI and Feedback Enhancements (4-6 hours)
   - **Goal:** Make competition visible and engaging.
   - **Steps:**
     1. In `src/src/multiplayer-ui.ts`:
        - Add a leaderboard panel showing real-time scores (e.g., "Player1: 85 pts (Objectives: 50, Net-Zero: 25, Operations: 10)").
        - Display level-specific UI (e.g., "Competing on Level 3: Road Grading" with timers).
     2. In `src/src/assignment-ui.ts` and `assignment-feedback.ts`:
        - Update progress indicators to show competitive rankings (e.g., color-coded bars for net-zero and operations).
        - Add post-level summary: "You ranked #2! Points Breakdown: ..."
     3. In `src/src/main.ts`:
        - Add UI buttons for "Join Competitive Level" (integrates with multiplayer session creation).
   - **Rationale:** Enhances engagement per `productContext.md` (e.g., social learning); reuses existing UI components.

#### Phase 5: Testing, Polish, and Documentation (2-4 hours)
   - **Steps:**
     1. Test edge cases: 2-player vs. 4-player, ties in scoring, disconnects (use graceful degradation in `multiplayer-enhanced.ts`).
     2. Performance: Ensure 60+ FPS during competitive play (leverage existing optimizations in `systemPatterns.md`).
     3. Update Memory Bank:
        - `activeContext.md`: Add notes on new competitive levels.
        - `progress.md`: Mark multiplayer competition as complete.
        - Create `.cursor/rules/levels.mdc` for patterns (e.g., "Levels must include net-zero scoring with <5% tolerance").
     4. Deploy and demo: Update README with competitive mode instructions.
   - **Success Metrics:** Per `assignment.md`, test for fun/engagement (e.g., playtest with 2 players), performance (<50ms latency), and progression (unlock 3+ levels).

This plan turns CutFill into a multi-level competitive game while preserving its educational core. If you approve, I can start implementing Phase 1 with code changes (e.g., edits to `assignments.ts`). Let me know if you'd like adjustments!

---

**User**

Great! Write this plan in @/tasks , naming it `1.0-gamification.md` and using the markdown format.

---

**Cursor**

```markdown

# Plan of Action for Implementing Multi-Level Competitive Gameplay in CutFill

Based on the review of Cursor rules, Memory Bank, and codebase, this plan transforms existing assignments into competitive multi-level gameplay. It aligns with the Game Week Project Guide, building on assignments as objectives, multiplayer via Socket.io/Supabase, and progress tracking.

The plan is divided into phases for a 3-5 day implementation.

## Phase 1: Preparation and Restructuring (1-2 hours)
- **Goal:** Repurpose assignments as levels without breaking existing single-player functionality.
- **Steps:**
  1. In `src/src/assignments.ts`:
     - Add a `levelNumber: number` field to `AssignmentConfig` interface (e.g., assign levels 1-10 based on `difficulty` or manually sequence the templates in `getAssignmentTemplates()`).
     - Update `AssignmentManager` to include level progression: Add methods like `getAvailableLevels()` (filter assignments by unlocked status) and `unlockNextLevel()` (called on completion, updating user progress in Supabase via `updateUserProgress()`).
     - Integrate net-zero scoring: In `evaluateObjective()`, add a new objective type (e.g., `'net_zero'`) that scores based on `Math.abs(volumeData.netMovement)` (e.g., full points if <5% tolerance, scaled down otherwise). Weight it at 30% of total score.
  2. In `src/src/progress.ts`:
     - Extend `UserProgress` with `unlockedLevels: number[]` and `levelScores: Record<number, { score: number; operations: number; netVolume: number }>` for tracking per-level performance.
     - Update `updateUserProgress()` to record level-specific data and unlock the next level (e.g., if level 1 completed, unlock level 2).
  3. Database updates (in `src/src/supabase.ts` or via Supabase dashboard):
     - Add columns to `user_progress` table: `unlocked_levels` (array of integers) and `level_scores` (JSONB for per-level data).
     - Ensure assignments table supports leveling (add `level_number` column and populate for existing templates).
- **Rationale:** Builds on existing assignment templates (e.g., 'foundation_prep_1' becomes Level 1) and progress tracking. No new files needed yet.
- **Potential Challenges:** Ensure backward compatibility for non-competitive play; test with guest users (who skip DB saves).

## Phase 2: Implement Multi-Level Progression (4-6 hours)
- **Goal:** Create a multi-level system where players advance through sequenced assignments.
- **Steps:**
  1. In `src/src/assignment-ui.ts`:
     - Update UI to display "Levels" instead of "Assignments" (e.g., rename modal to "Level Selection" and show locked/unlocked status with icons like 🔒 for locked levels).
     - Add progression visualization: A progress bar showing unlocked levels (e.g., "Level 1/10 Unlocked") tied to `UserProgress.unlockedLevels`.
  2. In `src/src/assignments.ts`:
     - Modify `startAssignment()` to validate level unlocking (e.g., check if `levelNumber` is in user's unlocked levels).
     - On completion (in `completeAssignment()`), call `unlockNextLevel()` and award XP (e.g., base 100 XP + bonuses for net-zero and low operations).
  3. Add operation counting:
     - In `AssignmentProgress`, add `operationCount: number` (increment in `addToolUsage()` or during terrain mods in `main.ts`/`precision-tools.ts`).
     - Score it: In `updateProgress()`, add a metric where fewer operations = higher points (e.g., normalize against an "ideal" count per level, weighted at 20% of score).
- **Rationale:** Leverages existing `AssignmentManager` for sequencing; ties into `progress.ts` for XP-based unlocks (e.g., start with Level 1 unlocked, require 70%+ score to unlock next).
- **Testing:** Simulate single-player level progression; verify unlocks persist via Supabase.

## Phase 3: Add Competitive Multiplayer (6-8 hours)
- **Goal:** Enable 2+ players to compete on the same level with real-time scoring.
- **Steps:**
  1. In `src/src/multiplayer-enhanced.ts`:
     - Extend `GameSession` with `currentLevel: number` and `levelScores: Record<string, { objectivePoints: number; netZeroPoints: number; operationsPoints: number; total: number }>` (per player).
     - Add events for level start/completion: `startLevel(levelNumber)` emits to server, syncing terrain and objectives for all players.
     - In `modifyTerrain()`, track operations per player and broadcast (e.g., increment player's operation count in session state).
  2. In `src/src/collaborative-features.ts`:
     - Create a new assignment type `'competitive_level'` in `initializeCollaborativeAssignments()` (extend existing competitive templates like 'speed_foundation_race').
     - In `updateTeamProgress()`, adapt for competition: Calculate per-player scores in real-time (e.g., objective completion: 50% of points, net-zero closeness: 30%, least operations: 20%). Use `progress` maps for individual tracking.
     - Add leaderboard sync: Every 5s, emit updated scores to all players.
  3. Integrate with assignments:
     - In `AssignmentManager.startAssignment()`, if in multiplayer session, set mode to competitive and sync via `multiplayerManager`.
     - On level end, rank players (e.g., winner gets bonus XP in `progress.ts`).
  4. Handle net-zero and operations in scoring:
     - Net-zero: Score = 100 * (1 - (abs(netMovement) / totalVolume)), synced per player.
     - Operations: Score = 100 * (minOperations / playerOperations), where minOperations is a level-defined ideal (add to `AssignmentConfig`).
- **Rationale:** Builds on existing competitive templates and shared objectives; ensures low-latency via Socket.io (e.g., broadcast mods and scores).
- **Testing:** Host 2-4 player sessions; verify real-time score updates and winner determination.

## Phase 4: UI and Feedback Enhancements (4-6 hours)
- **Goal:** Make competition visible and engaging.
- **Steps:**
  1. In `src/src/multiplayer-ui.ts`:
     - Add a leaderboard panel showing real-time scores (e.g., "Player1: 85 pts (Objectives: 50, Net-Zero: 25, Operations: 10)").
     - Display level-specific UI (e.g., "Competing on Level 3: Road Grading" with timers).
  2. In `src/src/assignment-ui.ts` and `assignment-feedback.ts`:
     - Update progress indicators to show competitive rankings (e.g., color-coded bars for net-zero and operations).
     - Add post-level summary: "You ranked #2! Points Breakdown: ..."
  3. In `src/src/main.ts`:
     - Add UI buttons for "Join Competitive Level" (integrates with multiplayer session creation).
- **Rationale:** Enhances engagement per `productContext.md` (e.g., social learning); reuses existing UI components.

## Phase 5: Testing, Polish, and Documentation (2-4 hours)
- **Steps:**
  1. Test edge cases: 2-player vs. 4-player, ties in scoring, disconnects (use graceful degradation in `multiplayer-enhanced.ts`).
  2. Performance: Ensure 60+ FPS during competitive play (leverage existing optimizations in `systemPatterns.md`).
  3. Update Memory Bank:
     - `activeContext.md`: Add notes on new competitive levels.
     - `progress.md`: Mark multiplayer competition as complete.
     - Create `.cursor/rules/levels.mdc` for patterns (e.g., "Levels must include net-zero scoring with <5% tolerance").
  4. Deploy and demo: Update README with competitive mode instructions.
- **Success Metrics:** Per `assignment.md`, test for fun/engagement (e.g., playtest with 2 players), performance (<50ms latency), and progression (unlock 3+ levels).

This plan turns CutFill into a multi-level competitive game while preserving its educational core.

```

---

**User**

add this file, commit, and push to github

Review cursor rules and the memory bank, then the rest of the code. Paying attention especially to the @assignment.md , review @1.0-gamification.md  and ask any clarifying questions, then suggest any improvements to the plan. Don't write any code or update @1.0-gamification.md yet.

---

**Cursor**

Excellent. I have reviewed the project's rules and Memory Bank, paying close attention to `docs/assignment.md` and our new plan in `tasks/1.0-gamification.md`.

The plan is comprehensive and logically structured, building effectively on the existing codebase. It correctly identifies the key files (`assignments.ts`, `progress.ts`, `multiplayer-enhanced.ts`) and proposes a phased approach that minimizes risk.

Before we proceed with implementation, I have a few clarifying questions and suggestions for improvement to ensure the final product aligns perfectly with your vision.

### Clarifying Questions & Suggested Improvements

1.  **Level Progression Structure**:
    *   **Current Plan**: Implies a linear progression where completing Level `N` unlocks Level `N+1`.
    *   **Question**: Is this linear path what you have in mind? Or should we consider a more flexible structure, like a level map where completing a level might unlock multiple new ones, creating branching paths? For now, I'll assume a simple linear progression is best.

2.  **Scoring Data & Leaderboards**:
    *   **Current Plan**: Store level scores in a `JSONB` column in the `user_progress` table.
    *   **Suggestion**: For more robust and performant leaderboards, I recommend creating a new SQL table, something like `level_attempts`. It would store a new row for every single time a player attempts a level, capturing their score, operation count, and net volume. This makes it much easier to query for things like "top 10 scores for Level 5" or a player's personal best. Do you agree with this approach?

3.  **Defining "Efficiency" for Operations**:
    *   **Current Plan**: Score the number of operations against a pre-defined "ideal" count for each level.
    *   **Question**: How should we determine this "ideal" count? Should it be a fixed "par" we set for each level, or should it be more dynamic, perhaps based on the best performance achieved by any player on that level so far? A fixed par is simpler to implement initially.

4.  **Real-Time Feedback**:
    *   **Current Plan**: Sync the leaderboard every 5 seconds.
    *   **Question**: Is a 5-second refresh interval sufficient for a competitive feel? We could instead broadcast score updates instantly after any action that changes the score. This would increase network traffic slightly but would make the competition feel more immediate and alive. Which do you prefer?

5.  **Joining a Competitive Match**:
    *   **Current Plan**: Implies players will be in a multiplayer session (a lobby) before the host selects a level to compete on.
    *   **Question**: Is this assumption correct? Or do you envision a system where players can browse and join competitive matches that are already in progress? The "lobby-first" approach is simpler and I recommend we start there.

Please let me know your thoughts on these points. Your feedback will help refine the plan before I begin writing any code.

---

**User**

1. Let's keep it a linear progression.
2. Good idea. Let's create a new table. 
3. Yes, let's base it on just the minimum number of operations required to achieve the Level objective.
4. Let's update instantly after any player action that changes a score, or 5 seconds if the player doesn't do anything.  
5. Let's keep it to the lobby first approach. A minimum of two players can start a competitive match. 

Also allow a player to try a level without joining a competition at any point. Taking my answers into account, go ahead and update @1.0-gamification.md But don't write any code yet. 

---

**Cursor**

Of course. I will update the plan in `tasks/1.0-gamification.md` to reflect your decisions. I'll incorporate the linear progression, the new `level_attempts` table for scoring, the "par" for operation counts, the instant score updates, the lobby-first approach with a two-player minimum, and the option for players to practice levels solo.

Here is the updated plan.

```markdown

# Plan of Action for Implementing Multi-Level Competitive Gameplay in CutFill

Based on the review of Cursor rules, Memory Bank, and codebase, this plan transforms existing assignments into competitive multi-level gameplay. It aligns with the Game Week Project Guide, building on assignments as objectives, multiplayer via Socket.io/Supabase, and progress tracking.

The plan is divided into phases for a 3-5 day implementation, following a **linear level progression** model (completing Level N unlocks Level N+1).

## Phase 1: Preparation and Restructuring (1-2 hours)
- **Goal:** Repurpose assignments as levels and establish the data structure for scoring and progression.
- **Steps:**
  1. In `src/src/assignments.ts`:
     - Add `levelNumber: number` and `idealOperations: number` fields to the `AssignmentConfig` interface. This sets the level sequence and the "par" for operation efficiency scoring.
     - Update `AssignmentManager` to manage level progression (e.g., `getAvailableLevels`, `unlockNextLevel`).
     - Integrate net-zero scoring as a new objective type (`'net_zero'`) in `evaluateObjective`, weighted at 30% of the total score.
  2. In `src/src/progress.ts`:
     - Extend the `UserProgress` interface with `unlockedLevels: number[]` to track which levels the player can access.
     - Update `updateUserProgress()` to push the next level ID to `unlockedLevels` upon successful completion.
  3. **Database Schema Update**:
     - Create a new table named `level_attempts` to store results from every competitive match. This provides robust data for leaderboards and personal bests.
       - **Columns**: `id`, `user_id`, `level_id`, `score`, `operations_count`, `net_volume`, `duration_seconds`, `completed_at`.
     - In the existing `user_progress` table, add an `unlocked_levels` column (integer array).
- **Rationale:** Establishes a solid, scalable foundation for tracking scores and progression. Creating a dedicated table for attempts is better for querying leaderboards than using a JSONB column.
- **Potential Challenges:** Migrating any existing user progress if applicable.

## Phase 2: Implement Multi-Level Progression (4-6 hours)
- **Goal:** Create a multi-level system where players advance through sequenced levels, with an option for solo practice.
- **Steps:**
  1. In `src/src/assignment-ui.ts`:
     - Overhaul the assignments modal to be a "Level Selection" screen.
     - Display levels, showing their locked/unlocked status (e.g., with a 🔒 icon).
     - For each unlocked level, provide two options: **"Practice"** (single-player mode) and **"Compete"** (initiates a multiplayer lobby).
  2. In `src/src/assignments.ts`:
     - Modify `startAssignment()` to check if a level is in the user's `unlockedLevels` array before starting.
     - On level completion, call `unlockNextLevel()` and award XP.
  3. **Implement Operation Counting & Scoring**:
     - In `AssignmentProgress`, add `operationCount: number`. Increment it on each terrain modification.
     - In `updateProgress()`, add a scoring metric for operations: `Score = 100 * (idealOperations / playerOperations)`. This score component is weighted at 20% of the final score.
- **Rationale:** Introduces the core gameplay loop of unlocking and playing levels, while providing a non-competitive practice mode as requested.
- **Testing:** Simulate a single-player completing a level, verifying the next level unlocks and the result is saved correctly.

## Phase 3: Add Competitive Multiplayer (6-8 hours)
- **Goal:** Enable 2+ players to compete on a level with real-time scoring, following a lobby-first approach.
- **Steps:**
  1. In `src/src/multiplayer-enhanced.ts`:
     - Extend `GameSession` to include `currentLevel: number` and a `liveScores` object to hold real-time scores for all players.
     - Implement the "lobby-first" flow: A player hosting a session selects a level to compete on. The match can only start with a **minimum of two players** in the session.
  2. **Implement Real-Time Score Synchronization**:
     - Broadcast score updates **instantly** after any player action that changes a score (e.g., completing an objective, modifying terrain).
     - As a fallback, also broadcast a full score-sync for all players every 5 seconds to ensure consistency.
  3. In `src/src/collaborative-features.ts`:
     - Adapt or create a new `'competitive_level'` assignment type.
     - In `updateTeamProgress()`, modify it to calculate and update individual player scores based on the three criteria (objective completion: 50%, net-zero balance: 30%, operation efficiency: 20%).
     - On level end, determine player rankings and save each player's results to the new `level_attempts` table. Award bonus XP to the winner.
- **Rationale:** Builds on the existing multiplayer foundation to create a dynamic, responsive competitive experience.
- **Testing:** Host 2-4 player sessions. Verify that scores update in real-time for all participants and that the final results are recorded correctly.

## Phase 4: UI and Feedback Enhancements (4-6 hours)
- **Goal:** Make competition visible, intuitive, and engaging.
- **Steps:**
  1. In `src/src/multiplayer-ui.ts`:
     - Implement a real-time leaderboard panel, visible during competitive matches, showing each player's ranked score and a breakdown of points.
  2. In `src/src/assignment-ui.ts` and `assignment-feedback.ts`:
     - For practice mode, show progress against the level's objectives.
     - For competitive mode, show progress relative to other players.
     - Create a post-game summary screen showing final rankings and a detailed breakdown of points for each player.
  3. In `src/src/main.ts`:
     - Ensure the "Join Competitive Level" button in the UI properly hooks into the multiplayer session/lobby creation flow.
- **Rationale:** Provides the necessary feedback to make the competition feel meaningful and fun.

## Phase 5: Testing, Polish, and Documentation (2-4 hours)
- **Steps:**
  1. Test edge cases: 2-player vs. 4-player, score ties, player disconnects.
  2. Performance: Ensure 60+ FPS is maintained during competitive play.
  3. Update Memory Bank and Rules:
     - `activeContext.md`: Note the new competitive level system.
     - `progress.md`: Mark multiplayer competition as a completed feature.
     - `.cursor/rules/levels.mdc`: Document patterns for level design (e.g., "Competitive levels must have a defined `idealOperations` count.").
  4. Demo: Update README with instructions for starting both practice and competitive modes.
- **Success Metrics:** Fun/engagement, low-latency performance, and a clear, functional progression system.

This updated plan provides a clear path to implementing the multi-level competitive game as you've envisioned.

```

Excellent. The plan is updated. I will now commit the changes and push them to your GitHub repository.

The gamification plan has been updated and pushed to GitHub.

We are now ready to begin implementation. I will start with Phase 1, which focuses on restructuring the data models and adding the new database table.

Shall I proceed?

---

**User**

Review cursor rules and the memory bank, then the rest of the code. Paying attention especially to the @assignment.md , review @1.0-gamification.md  and ask any clarifying questions, then suggest any improvements to the plan. Don't write any code or update @1.0-gamification.md yet.

---

**Cursor**

Here is a quick health-check of the updated plan after another pass through the rules, Memory Bank, `docs/assignment.md`, and the current codebase.

--------------------------------------------------------------------
Key observations
--------------------------------------------------------------------
1.  Assignments → Levels  
    •  `AssignmentConfig` already contains most of what a “Level” needs.  
    •  Age-scaling ( `age-scaling.ts` ) automatically tweaks tolerances, times, etc. – we must be sure those adjustments don’t quietly change your new “idealOperations” or “par” numbers.

2.  Scoring components already exist piecemeal  
    •  Objective completion scoring lives in `AssignmentManager.evaluateObjective()`.  
    •  Net-zero accuracy is partly there (`volume_target` objective) but will need the new dedicated `'net_zero'` type.  
    •  We currently count tool uses (`progressTracker.recordToolUsage`) but **not** raw terrain-modification calls, so an explicit operation counter must be added.

3.  Multiplayer flow  
    •  `EnhancedMultiplayerManager` already broadcasts terrain changes instantly – piggy-backing score deltas on the same event will meet the “instant update” requirement.  
    •  Lobby logic exists but needs a “minimum‐2 players to start” gate.

4.  Data persistence  
    •  Supabase migrations folder (`supabase/migrations/…`) is set up, so adding a `level_attempts` table fits the existing workflow.  
    •  There is no single source of truth for “level metadata”; templates live in code. That’s fine for now, but a future DB-driven approach could simplify live balancing.

--------------------------------------------------------------------
Clarifying questions
--------------------------------------------------------------------
A.  Ideal (Par) Operation Counts  
 • Will you hand-author `idealOperations` for every level, or should we provide an admin UI / CLI to update them later?  
 • If Age-Scaling reduces terrain size or tolerance, should the par scale automatically (e.g., multiplied by the same scaling factor), or remain fixed?

B.  Attempt Storage & Practice Mode  
 • Should **practice-mode** results also be written to `level_attempts` (flagged as `is_practice = true`) so players can still see a personal best, or kept entirely client-side?  
 • Do you want to keep **all** attempts forever (good for analytics) or prune to “latest N” per player per level?

C.  Time Limits and Duration Scoring  
 • `AssignmentConfig` already has `estimatedTime`; do we make this an enforced **time-limit** in competitive play (fail / penalty if exceeded)?  
 • If yes, does time contribute to the score, or is it only a gate?

D.  XP Rewards  
 • The existing XP formula is `baseXP * difficulty * (score/100)`. Should we add **bonus XP for podium placement** (e.g., +20 % for 1st place)?  
 • Should practice completions grant XP, or only competitive wins?

E.  Leaderboards  
 • Do we need **global** leaderboards (top 10 across all players) in addition to per-session rankings? That affects DB indexes and API design.

F.  Edge-case handling  
 • If a competitive session drops below 2 players mid-match (disconnect), do we auto-end, allow the remaining player to finish for a solo score, or pause waiting for a reconnect?

--------------------------------------------------------------------
Suggested small improvements to the plan (no file edits yet)
--------------------------------------------------------------------
1. **Add a Time-Limit Objective Type** – Keeps matches brisk and provides another predictable scoring category if you want speed bonuses later.

2. **Practice “Ghost” Option** – While practising solo, optionally show the player’s personal-best operation path overlay or volume curve as a faint ghost. This reuses the operation history we’ll already be storing.

3. **Centralise Level Metadata in One File** – Move all level template objects into a single `levels.ts` file (exported array). This aids manual editing of `idealOperations`, level numbers, time limits, etc., and could later be generated into Supabase.

4. **Version Tag on Levels** – A simple `levelVersion` field lets us change a level later without wrecking historic attempt records (the attempt stores both level_id and level_version).

5. **Server-Side Score Validation** – The server should re-compute net-zero and operations counts from received terrain modifications rather than trusting client-sent scores, preventing cheating.

Nothing needs to be added to `1.0-gamification.md` until you confirm answers to the questions above or request these improvements.

Let me know your preferences and I’ll incorporate them before any coding begins.

---

**User**

A.1 Let's hand-author idealOperations for now.
A.2 Keep it fixed for now
B.1 practice-mode should be written to level_atempts with a flag
B.2 Let's keep them for now, I may cull it later
C.1 No need to enforce it
C.2 I want this to be a more cerebral game, so let's leave the time factor out.
D.1 Sure!
D.2 Only competitive
E Sure, let's have a global leaderboard
F Allow the remaining player to finish, but penalize the dropped player score.

Based on my answers and your suggestions, go ahead and update @1.0-gamification.md but don't write any code yet.

---

**Cursor**

```markdown
// ... existing code ...
The plan is divided into phases for a 3-5 day implementation, following a **linear level progression** model (completing Level N unlocks Level N+1).

> **Key clarifications incorporated**  
> • `idealOperations` values will be **hand-authored** per level and remain **fixed** (no auto-scaling with age-scaling).  
> • All level attempts – **practice and competitive** – are written to the new `level_attempts` table; practice rows are flagged with `is_practice = true`.  
> • We will **retain every attempt** for now (no pruning).  
> • **Time is *not* a scoring factor**; no enforced time-limit objective.  
> • Extra **XP is awarded only in competitive mode** (with podium bonuses).  
> • A **global leaderboard** is required in addition to per-match rankings.  
> • If a player disconnects, remaining players may finish. The dropped player receives a penalty (score set to 0).  
> • Level metadata will be centralised in a single `levels.ts` file and versioned via `levelVersion`.  
> • Scores will be **validated server-side** to prevent tampering.

## Phase 1: Preparation and Restructuring (1-2 hours)
// ... existing code ...
      - Add `levelNumber: number`, `idealOperations: number`, and **`levelVersion: number`** fields to the `AssignmentConfig` interface.  
        • `idealOperations` is hand-authored and represents the par count.  
        • `levelVersion` allows future level tweaks without invalidating historical attempts.
// ... existing code ...
   3. **Database Schema Update**:
      - Create a new table **`level_attempts`** to store every level playthrough.  
        • Columns: `id`, `user_id`, `level_id`, `level_version`, `score`, `objective_points`, `net_zero_points`, `operations_points`, `operations_count`, `net_volume`, `duration_seconds`, `is_practice` **(boolean)**, `completed_at`.  
        • Primary index on (`level_id`, `score`) for global leaderboard queries.
// ... existing code ...
- **Goal:** Create a multi-level system where players advance through sequenced levels, with an option for solo practice.
// ... existing code ...
   3. **Implement Operation Counting & Scoring**:
// ... existing code ...
      - **XP Handling:** Practice completions write to `level_attempts` but **do not grant XP**. Competitive completions use the existing formula plus **podium bonus** (+20 % for 1st, +10 % for 2nd).
// ... existing code ...
- **Goal:** Enable 2+ players to compete on a level with real-time scoring, following a lobby-first approach.
// ... existing code ...
   2. **Implement Real-Time Score Synchronization**:
      - Scores are recalculated **server-side** from terrain events; clients receive authoritative updates instantly.  
      - Fallback full sync every 5 seconds.
// ... existing code ...
   3. In `src/src/collaborative-features.ts`:
// ... existing code ...
      - **Disconnect handling:** If a player disconnects, mark them `DNF` and set their score to 0. Remaining players may continue to finish the match.
// ... existing code ...
- **Goal:** Make competition visible, intuitive, and engaging.
// ... existing code ...
  1. In `src/src/multiplayer-ui.ts`:
      - Implement a real-time leaderboard panel ...  
      - Add a **global leaderboard view** (toggleable) that queries the top scores from `level_attempts`.
// ... existing code ...
- **Success Metrics:** Fun/engagement, low-latency performance, global leaderboard accuracy, and a clear, functional progression system.

// ... existing code ...
```

The plan is now fully updated with your clarifications and our additional safeguards. No code has been changed—only the roadmap.

Let me know when you’d like me to begin Phase 1 implementation.

