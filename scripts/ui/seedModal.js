/**
 * Crucible of Fate - Seed Modal
 * Dialog for players to submit seed results during startup ritual
 */

import { CrucibleSocket } from "../socket.js";

export class SeedModal extends Application {
  constructor(userId, options = {}) {
    super(options);
    this.userId = userId;
    this.seedResult = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "crucible-seed-modal",
      classes: ["crucible", "crucible-seed"],
      title: game.i18n.localize("crucible.seed.title"),
      template: "modules/crucible-of-fate/templates/seed-modal.hbs",
      width: 400,
      height: "auto",
      resizable: false
    });
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("[data-action='roll']").on("click", this._onRoll.bind(this));
    html.find("[data-action='submit']").on("click", this._onSubmit.bind(this));
    html.find("[data-action='cancel']").on("click", this.close.bind(this));
    
    html.find("#crucible-seed-input").on("input", (event) => {
      this.seedResult = parseInt(event.target.value, 10);
    });
  }

  async _onRoll() {
    const roll = new Roll("1d6");
    await roll.roll();
    const result = roll.total;
    
    this.seedResult = result;
    this.element.find("#crucible-seed-input").val(result);
    
    // Show result visually
    this.element.find("#crucible-seed-input").addClass("crucible-rolled").val(result);
  }

  async _onSubmit() {
    if (!this.seedResult || this.seedResult < 1 || this.seedResult > 6) {
      this._showError(game.i18n.localize("crucible.seed.error.invalidRange"));
      return;
    }

    try {
      await CrucibleSocket.submitSeedResult(this.seedResult);
      this.element.find(".crucible-waiting").show();
      this.element.find(".crucible-seed-controls").hide();
    } catch (error) {
      this._showError(error.message);
    }
  }

  _showError(message) {
    const errorDiv = this.element.find(".crucible-error");
    errorDiv.text(message).show();
    setTimeout(() => errorDiv.fadeOut(), 5000);
  }
}

/**
 * Seed Ritual Manager
 * Handles the overall seeding flow for all players
 */
export class SeedRitualManager {
  constructor() {
    this.activeModals = new Map();
    this.isActive = false;
  }

  /**
   * Start the seeding ritual
   */
  async start() {
    if (!game.user.isGM) {
      throw new Error("Only GM can start seeding ritual");
    }

    this.isActive = true;
    await CrucibleSocket.startSeed();

    // Open modal for GM if they're viewing as a player
    // Other players will receive socket event and open their own modals
    const requireCharacter = game.settings.get("crucible-of-fate", "requireCharacterOwnership");
    const activePlayers = game.users.filter(user => {
      if (user.role !== CONST.USER_ROLES.PLAYER) return false;
      if (!user.active) return false;
      if (requireCharacter) {
        const ownedActors = game.actors.filter(a => a.testUserPermission(user, "OWNER"));
        if (ownedActors.length === 0) return false;
      }
      return true;
    });

    // Check if GM is also a player
    const gmAsPlayer = activePlayers.find(p => p.id === game.user.id);
    if (gmAsPlayer) {
      const modal = new SeedModal(game.user.id);
      modal.render(true);
      this.activeModals.set(game.user.id, modal);
    }
  }

  /**
   * Open seed modal for a specific player
   */
  openForPlayer(userId) {
    if (this.activeModals.has(userId)) {
      return; // Already open
    }

    const modal = new SeedModal(userId);
    modal.render(true);
    this.activeModals.set(userId, modal);
  }

  /**
   * Close seed modal for a specific player
   */
  closeForPlayer(userId) {
    const modal = this.activeModals.get(userId);
    if (modal) {
      modal.close();
      this.activeModals.delete(userId);
    }
  }

  /**
   * Complete the seeding ritual
   */
  complete() {
    this.isActive = false;
    // Close all modals
    for (const [userId, modal] of this.activeModals) {
      modal.close();
    }
    this.activeModals.clear();
    
    // Show completion message
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker(),
      content: `<div class="crucible-chat-message">${game.i18n.localize("crucible.seed.complete")}</div>`
    });
  }
}
