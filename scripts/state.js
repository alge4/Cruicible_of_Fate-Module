/**
 * Crucible of Fate - State Management
 * Handles world-level settings and state persistence
 */

export const CrucibleState = {
  /**
   * Get the current state from world settings
   * @returns {Object} Current state object
   */
  getState() {
    return {
      playerPoolCount: game.settings.get("crucible-of-fate", "playerPoolCount") || 0,
      gmPoolCount: game.settings.get("crucible-of-fate", "gmPoolCount") || 0,
      overrideEnabled: game.settings.get("crucible-of-fate", "overrideEnabled") || false,
      seededPlayers: game.settings.get("crucible-of-fate", "seededPlayers") || [],
      lastSeededAt: game.settings.get("crucible-of-fate", "lastSeededAt") || null
    };
  },

  /**
   * Update state (GM-only, validates invariant)
   * @param {Object} delta - Changes to apply
   * @returns {Promise<Object>} Updated state
   */
  async updateState(delta) {
    if (!game.user.isGM) {
      throw new Error("Only GM can update state");
    }

    const currentState = this.getState();
    const newState = { ...currentState, ...delta };

    // Validate and enforce invariant if override is disabled
    if (!newState.overrideEnabled) {
      const activePlayerCount = this.getActivePlayerCount();
      const totalDice = newState.playerPoolCount + newState.gmPoolCount;
      
      if (totalDice !== activePlayerCount) {
        // Auto-balance: prefer adjusting Player Pool first
        const difference = activePlayerCount - totalDice;
        newState.playerPoolCount = Math.max(0, newState.playerPoolCount + difference);
        
        // If Player Pool adjustment wasn't enough, adjust GM Pool
        const newTotal = newState.playerPoolCount + newState.gmPoolCount;
        if (newTotal !== activePlayerCount) {
          newState.gmPoolCount = activePlayerCount - newState.playerPoolCount;
        }
      }
    }

    // Update each setting
    for (const [key, value] of Object.entries(newState)) {
      if (key !== "overrideEnabled" || delta.hasOwnProperty("overrideEnabled")) {
        await game.settings.set("crucible-of-fate", key, value);
      }
    }

    return this.getState();
  },

  /**
   * Get count of active players
   * @param {boolean} requireCharacter - If true, player must own at least one character
   * @returns {number} Active player count
   */
  getActivePlayerCount(requireCharacter = false) {
    const players = game.users.filter(user => {
      if (user.role !== CONST.USER_ROLES.PLAYER) return false;
      if (!user.active) return false;
      if (requireCharacter) {
        const ownedActors = game.actors.filter(a => a.testUserPermission(user, "OWNER"));
        if (ownedActors.length === 0) return false;
      }
      return true;
    });
    return players.length;
  },

  /**
   * Enforce invariant (auto-balance pools when override OFF)
   * @returns {Promise<Object>} Updated state
   */
  async enforceInvariant() {
    const state = this.getState();
    if (state.overrideEnabled) {
      return state; // No enforcement needed
    }

    const activePlayerCount = this.getActivePlayerCount();
    const totalDice = state.playerPoolCount + state.gmPoolCount;
    
    if (totalDice !== activePlayerCount) {
      // Prefer adjusting Player Pool first
      const difference = activePlayerCount - totalDice;
      const newPlayerPool = Math.max(0, state.playerPoolCount + difference);
      const newGmPool = activePlayerCount - newPlayerPool;
      
      return await this.updateState({
        playerPoolCount: newPlayerPool,
        gmPoolCount: newGmPool
      });
    }

    return state;
  },

  /**
   * Initialize default settings
   */
  async initializeSettings() {
    // Register all settings
    game.settings.register("crucible-of-fate", "playerPoolCount", {
      name: "Player Pool Count",
      hint: "Number of dice in the Player Pool",
      scope: "world",
      config: false,
      type: Number,
      default: 0
    });

    game.settings.register("crucible-of-fate", "gmPoolCount", {
      name: "GM Pool Count",
      hint: "Number of dice in the GM Pool",
      scope: "world",
      config: false,
      type: Number,
      default: 0
    });

    game.settings.register("crucible-of-fate", "overrideEnabled", {
      name: "Override Mode",
      hint: "When enabled, total dice count is not tied to player count",
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });

    game.settings.register("crucible-of-fate", "seededPlayers", {
      name: "Seeded Players",
      hint: "Array of user IDs who have seeded dice",
      scope: "world",
      config: false,
      type: Array,
      default: []
    });

    game.settings.register("crucible-of-fate", "lastSeededAt", {
      name: "Last Seeded At",
      hint: "ISO timestamp of last seeding ritual",
      scope: "world",
      config: false,
      type: String,
      default: null
    });

    game.settings.register("crucible-of-fate", "requireCharacterOwnership", {
      name: "Require Character Ownership",
      hint: "If enabled, only players who own at least one character count as active",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });
  }
};
