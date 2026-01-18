/**
 * Crucible of Fate - Socket System
 * GM-authoritative event handling for multiplayer synchronization
 */

import { CrucibleState } from "./state.js";

export const CrucibleSocket = {
  /**
   * Register socket event handlers
   */
  register() {
    game.socket.on("module.crucible-of-fate", (data) => {
      const { type, payload } = data;
      
      switch (type) {
        case "stateUpdate":
          this.handleStateUpdate(payload);
          break;
        case "seedStarted":
          this.handleSeedStarted(payload);
          break;
        case "seedComplete":
          this.handleSeedComplete(payload);
          break;
        case "seedResult":
          // GM-only handler
          if (game.user.isGM) {
            Hooks.callAll("crucible.handleSeedResult", payload.userId, payload.result);
          }
          break;
        case "requestAugment":
          // GM-only handler
          if (game.user.isGM) {
            Hooks.callAll("crucible.handleAugmentRequest", payload.userId, payload.messageId);
          }
          break;
        default:
          console.warn(`Unknown socket event type: ${type}`);
      }
    });
  },

  /**
   * Handle state update broadcast from GM
   * @param {Object} payload - New state data
   */
  handleStateUpdate(payload) {
    // Trigger UI update for all users
    Hooks.callAll("crucible.stateUpdated", payload);
  },

  /**
   * Handle seed ritual started
   * @param {Object} payload - Seed ritual data
   */
  handleSeedStarted(payload) {
    Hooks.callAll("crucible.seedStarted", payload);
  },

  /**
   * Handle seed ritual completion
   * @param {Object} payload - Completion data
   */
  handleSeedComplete(payload) {
    Hooks.callAll("crucible.seedComplete", payload);
  },

  /**
   * GM initiates seeding ritual
   * @returns {Promise<void>}
   */
  async startSeed() {
    if (!game.user.isGM) {
      throw new Error("Only GM can start seeding");
    }

    // Clear seeded players
    await CrucibleState.updateState({
      seededPlayers: [],
      lastSeededAt: null
    });

    // Broadcast to all clients
    game.socket.emit("module.crucible-of-fate", {
      type: "seedStarted",
      payload: {
        activePlayers: CrucibleState.getActivePlayerCount(
          game.settings.get("crucible-of-fate", "requireCharacterOwnership")
        )
      }
    });
  },

  /**
   * Player submits seed result
   * @param {number} result - Dice result (1-6)
   * @returns {Promise<void>}
   */
  async submitSeedResult(result) {
    if (game.user.isGM) {
      throw new Error("GM cannot submit seed results");
    }

    if (result < 1 || result > 6) {
      throw new Error("Seed result must be between 1 and 6");
    }

    // Send to GM for validation
    game.socket.emit("module.crucible-of-fate", {
      type: "seedResult",
      payload: {
        userId: game.user.id,
        result: result
      }
    });
  },

  /**
   * GM processes seed result from player
   * @param {string} userId - User ID
   * @param {number} result - Dice result (1-6)
   * @returns {Promise<void>}
   */
  async processSeedResult(userId, result) {
    if (!game.user.isGM) {
      throw new Error("Only GM can process seed results");
    }

    const state = CrucibleState.getState();
    
    // Check if player already seeded
    if (state.seededPlayers.includes(userId)) {
      console.warn(`User ${userId} already seeded`);
      return;
    }

    // Assign die to pool: 1-3 → GM Pool, 4-6 → Player Pool
    const delta = {};
    if (result >= 1 && result <= 3) {
      delta.gmPoolCount = state.gmPoolCount + 1;
    } else {
      delta.playerPoolCount = state.playerPoolCount + 1;
    }

    // Add to seeded players
    delta.seededPlayers = [...state.seededPlayers, userId];
    delta.lastSeededAt = new Date().toISOString();

    // Update state
    const newState = await CrucibleState.updateState(delta);

    // Broadcast update
    this.broadcastStateUpdate(newState);

    // Check if all players have seeded
    const activePlayerCount = CrucibleState.getActivePlayerCount(
      game.settings.get("crucible-of-fate", "requireCharacterOwnership")
    );
    
    if (newState.seededPlayers.length >= activePlayerCount) {
      // All players seeded
      game.socket.emit("module.crucible-of-fate", {
        type: "seedComplete",
        payload: { state: newState }
      });
    }
  },

  /**
   * Player requests roll augmentation
   * @param {string} messageId - Chat message ID of the roll
   * @returns {Promise<void>}
   */
  async requestAugment(messageId) {
    if (game.user.isGM) {
      throw new Error("GM cannot request augmentation");
    }

    // Send request to GM
    game.socket.emit("module.crucible-of-fate", {
      type: "requestAugment",
      payload: {
        userId: game.user.id,
        messageId: messageId
      }
    });
  },

  /**
   * GM processes augmentation request
   * @param {string} userId - User ID requesting augmentation
   * @param {string} messageId - Chat message ID
   * @returns {Promise<void>}
   */
  async processAugmentRequest(userId, messageId) {
    if (!game.user.isGM) {
      throw new Error("Only GM can process augmentation requests");
    }

    // Validation will be done in rollAugmentation.js
    // This just handles the socket communication
    Hooks.callAll("crucible.processAugmentRequest", userId, messageId);
  },

  /**
   * Broadcast state update to all clients
   * @param {Object} state - Current state
   */
  broadcastStateUpdate(state) {
    game.socket.emit("module.crucible-of-fate", {
      type: "stateUpdate",
      payload: state
    });
  }
};
