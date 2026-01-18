# Crucible of Fate – Foundry VTT Implementation Brief

This document is an **AI-facing implementation brief** for a Foundry VTT module that implements Mark Hulmes’ *Crucible of Fate* mechanic as a visual, interactive system.

Target platform: **Foundry VTT v11+**  
Module type: **System-agnostic (with optional D&D 5e enhancements)**

---

## 0. Goals

Implement a Foundry module that provides:

- Two visible pools of **d6 Crucible Dice**
  - **Player Pool**
  - **GM Pool**
- Dice migrate between pools when spent
- Total dice count is tied to number of active players (unless GM override)
- Players can augment **skill checks and saving throws only**
- GM has broad, non-restrictive control tools

Non-goals:
- No per-player dice ownership
- No hardcoding GM homebrew effects
- No attack or damage automation for players

---

## 1. Core Rules Summary

### Dice
- All Crucible dice are **d6**
- Dice are communal, not player-owned

### Total Dice Constraint
- Total dice = number of **active players**
- Enforced automatically unless GM override is enabled

### Startup Seeding (“Invoke the Crucible”)
Each active player:
- Rolls or enters **1d6**
- Result assignment:
  - **1–3 → GM Pool**
  - **4–6 → Player Pool**
- Dice created are exactly the dice in circulation

### Player Usage
- Players may spend **1 die**
- Adds **+1d6**
- Only valid for:
  - Skill checks
  - Saving throws
- Must be declared *before resolution*
  - Digitally enforced as: only allowed on the player’s **most recent roll**

### GM Usage
- GM may:
  - Spend dice freely
  - Roll dice for homebrew effects
  - Move multiple dice between pools
  - Add/remove dice in override mode

The module **does not need to understand why** GM dice are spent.

---

## 2. Persistence & State

Use **world-level settings** (or one world document flag).

### Required State
- `playerPoolCount: number`
- `gmPoolCount: number`
- `overrideEnabled: boolean`
- `seededPlayers: string[]` (userIds)
- `lastSeededAt: ISO string`

Optional:
- `auditLog: {timestamp, action, delta}[]` (GM-only)

### Invariant (when override OFF)
```
playerPoolCount + gmPoolCount === activePlayerCount
```

### Active Player Definition
Default:
- User role = PLAYER
- User is connected

Optional setting:
- Must own at least one character

GM is authoritative for all writes.

---

## 3. Crucible UI Panel

A floating panel visible to all users.

### Display
- Two labeled areas:
  - Player Pool
  - GM Pool
- Dice icons (cap visible dice at ~12, then show “+N”)
- Totals:
  - Players: X
  - GM: Y
  - Total: X+Y

### Permissions
Players:
- View only

GM:
- Full control buttons

---

## 4. GM Controls

### Buttons
- **Invoke Crucible**
- **Move Dice…**
- **Roll GM Die**
- **Override Toggle**
- **Reset Pools**

### Move Dice Modal
Inputs:
- Direction: Player → GM or GM → Player
- Amount: integer ≥ 1

Validation:
- Cannot move more dice than exist in source pool

### Override Mode
When enabled:
- GM may freely set pool counts
- Total dice no longer tied to player count

When disabled:
- Module auto-rebalances to enforce invariant
- Prefer removing/adding dice to Player Pool first

---

## 5. Startup Seeding Flow (“Invoke Crucible”)

1. GM clicks **Invoke Crucible**
2. Module determines active players
3. Clears `seededPlayers`
4. For each active player:
   - Open modal:
     - Enter number (1–6) **or**
     - Click “Roll”
5. On submission:
   - Validate 1–6
   - Assign die:
     - 1–3 → GM Pool
     - 4–6 → Player Pool
   - Mark player as seeded
6. When all players seeded:
   - Close ritual
   - Pools become active

Networking:
- Players send results via socket
- GM validates and writes state

---

## 6. Right-Click Roll Augmentation (Players)

### Context Menu Entry
**“Invoke Crucible (+1d6)”**

### Visibility Conditions
- User is a player (not GM)
- Roll belongs to the user
- Roll is:
  - Skill check **or**
  - Saving throw
- Player Pool ≥ 1
- Roll is the **most recent roll by that player**
- Roll has not already been augmented

### Roll Type Detection
Priority:
1. System flags (e.g. dnd5e roll metadata)
2. Flavor text heuristics
3. If unknown → hide option

### On Click
1. Player sends request to GM via socket
2. GM validates eligibility
3. GM rolls **1d6**
4. Post follow-up chat message:
   - “Crucible invoked: +1d6 = N”
   - Show new total
5. Update pools:
   - Player Pool −1
   - GM Pool +1

Do **not** attempt to mutate original roll unless system-specific support is added.

---

## 7. GM Dice Spending Helper (Optional)

Button: **“Spend GM Die”**

Behavior:
- Roll 1d6
- Post result to chat (GM-only or public, configurable)
- Move die GM → Player (default)

Optional dropdown:
- “Spend without transfer”

This is a helper, not enforced mechanics.

---

## 8. Sockets & Authority

- GM is authoritative
- Players request actions
- GM validates and applies changes
- GM broadcasts updated state

Socket events:
- `crucible.startSeed`
- `crucible.seedResult`
- `crucible.stateUpdate`
- `crucible.requestAugment`

---

## 9. File Structure (Suggested)

```
crucible-of-fate-ui/
├─ module.json
├─ scripts/
│  ├─ main.js
│  ├─ socket.js
│  ├─ state.js
│  ├─ chatContext.js
│  └─ ui/
│     └─ cruciblePanel.js
├─ templates/
│  └─ crucible-panel.hbs
├─ styles/
│  └─ crucible.css
├─ lang/
│  └─ en.json
```

---

## 10. Acceptance Checklist

- [ ] Pools visible to all users
- [ ] Startup seeding assigns dice correctly
- [ ] Total dice equals player count (override OFF)
- [ ] Players can only augment skills/saves
- [ ] Right-click option only appears on valid rolls
- [ ] Dice migrate Player → GM on player spend
- [ ] GM can move dice freely
- [ ] State persists across reloads

---

## 11. Design Principle

This module is a **ritual object**, not a dice replacement.

It should:
- Make fate visible
- Enforce player constraints gently
- Empower the GM without assumptions
- Stay system-agnostic by default

Automation should never override narration.
