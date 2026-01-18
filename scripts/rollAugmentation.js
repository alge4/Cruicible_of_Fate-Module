/**
 * Crucible of Fate - Roll Augmentation
 * Handles roll type detection and player augmentation requests
 */

import { CrucibleState } from "./state.js";
import { CrucibleSocket } from "./socket.js";

export const RollAugmentation = {
  /**
   * Track most recent roll per player
   */
  playerRollHistory: new Map(),

  /**
   * Track augmented message IDs
   */
  augmentedMessages: new Set(),

  /**
   * Detect if a roll is a skill check or saving throw
   * Priority: D&D 5e system flags > flavor text heuristics > unknown
   * @param {ChatMessage} message - Chat message containing the roll
   * @returns {boolean} True if roll can be augmented
   */
  isAugmentableRoll(message) {
    // Check if already augmented
    if (this.augmentedMessages.has(message.id)) {
      return false;
    }

    // Check D&D 5e system flags
    if (game.system.id === "dnd5e") {
      const rollType = message.flags?.dnd5e?.roll?.type;
      if (rollType === "skill" || rollType === "save" || rollType === "savingThrow") {
        return true;
      }
    }

    // Check flavor text heuristics
    const flavor = message.flavor || "";
    const content = message.content || "";
    const text = (flavor + " " + content).toLowerCase();
    
    const keywords = [
      "skill",
      "save",
      "saving throw",
      "ability check",
      "check",
      "saving"
    ];

    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        // Exclude attack rolls
        if (text.includes("attack") && !text.includes("saving throw")) {
          continue;
        }
        return true;
      }
    }

    return false;
  },

  /**
   * Check if message is player's most recent roll
   * @param {ChatMessage} message - Chat message
   * @param {string} userId - User ID
   * @returns {boolean} True if most recent roll
   */
  isMostRecentRoll(message, userId) {
    const mostRecent = this.playerRollHistory.get(userId);
    return mostRecent === message.id;
  },

  /**
   * Register a roll message
   * @param {ChatMessage} message - Chat message
   */
  registerRoll(message) {
    if (!message.user) return;
    
    const userId = message.user.id;
    this.playerRollHistory.set(userId, message.id);
  },

  /**
   * Check if augmentation is available for a message
   * @param {ChatMessage} message - Chat message
   * @returns {boolean} True if augmentation available
   */
  canAugment(message) {
    // Must be a player (not GM)
    if (game.user.isGM) {
      return false;
    }

    // Must own the message
    if (message.user.id !== game.user.id) {
      return false;
    }

    // Must be augmentable roll type
    if (!this.isAugmentableRoll(message)) {
      return false;
    }

    // Must have dice in Player Pool
    const state = CrucibleState.getState();
    if (state.playerPoolCount < 1) {
      return false;
    }

    // Must be most recent roll
    if (!this.isMostRecentRoll(message, game.user.id)) {
      return false;
    }

    return true;
  },

  /**
   * Process augmentation request
   * @param {string} messageId - Chat message ID
   * @returns {Promise<void>}
   */
  async processAugment(messageId) {
    const message = game.messages.get(messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    // Validate eligibility
    if (!this.canAugment(message)) {
      const state = CrucibleState.getState();
      if (state.playerPoolCount < 1) {
        throw new Error(game.i18n.localize("crucible.augment.error.insufficientDice"));
      }
      if (!this.isAugmentableRoll(message)) {
        throw new Error(game.i18n.localize("crucible.augment.error.invalidRoll"));
      }
      if (this.augmentedMessages.has(message.id)) {
        throw new Error(game.i18n.localize("crucible.augment.error.alreadyAugmented"));
      }
      if (!this.isMostRecentRoll(message, game.user.id)) {
        throw new Error(game.i18n.localize("crucible.augment.error.notMostRecent"));
      }
      throw new Error(game.i18n.localize("crucible.augment.error.invalidRoll"));
    }

    // Send request to GM
    await CrucibleSocket.requestAugment(messageId);
  },

  /**
   * GM processes augmentation request
   * @param {string} userId - User ID requesting
   * @param {string} messageId - Chat message ID
   * @returns {Promise<void>}
   */
  async handleAugmentRequest(userId, messageId) {
    if (!game.user.isGM) {
      throw new Error("Only GM can handle augmentation requests");
    }

    const message = game.messages.get(messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    const user = game.users.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Validate eligibility
    const state = CrucibleState.getState();
    if (state.playerPoolCount < 1) {
      ui.notifications.warn(game.i18n.localize("crucible.augment.error.insufficientDice"));
      return;
    }

    // Check if already augmented
    if (this.augmentedMessages.has(messageId)) {
      ui.notifications.warn(game.i18n.localize("crucible.augment.error.alreadyAugmented"));
      return;
    }

    // Roll 1d6
    const roll = new Roll("1d6");
    await roll.roll();
    const result = roll.total;

    // Calculate new total (extract original total from message)
    let originalTotal = null;
    if (message.rolls && message.rolls.length > 0) {
      originalTotal = message.rolls[0].total;
    } else {
      // Try to extract from content
      const match = message.content.match(/Total:\s*(\d+)/i);
      if (match) {
        originalTotal = parseInt(match[1], 10);
      }
    }

    const newTotal = originalTotal ? originalTotal + result : null;

    // Post chat message
    let chatContent = game.i18n.format("crucible.augment.chatMessage", { result });
    if (newTotal !== null) {
      chatContent += `<br>${game.i18n.format("crucible.augment.newTotal", { total: newTotal })}`;
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ user: user }),
      content: `<div class="crucible-chat-message">${chatContent}</div>`,
      flags: {
        "crucible-of-fate": {
          augmentedMessageId: messageId,
          augmentResult: result
        }
      }
    });

    // Update pools
    const newState = await CrucibleState.updateState({
      playerPoolCount: state.playerPoolCount - 1,
      gmPoolCount: state.gmPoolCount + 1
    });

    // Mark as augmented
    this.augmentedMessages.add(messageId);

    // Broadcast state update
    CrucibleSocket.broadcastStateUpdate(newState);
  }
};
