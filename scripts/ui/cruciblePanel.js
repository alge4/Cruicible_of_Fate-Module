/**
 * Crucible of Fate - Crucible Panel
 * Main floating panel displaying dice pools and GM controls
 */

import { CrucibleState } from "../state.js";
import { CrucibleSocket } from "../socket.js";
import { MoveDiceModal } from "./moveDiceModal.js";
import { SeedRitualManager } from "./seedModal.js";

export class CruciblePanel extends Application {
  static instance = null;

  constructor(options = {}) {
    super(options);
    CruciblePanel.instance = this;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "crucible-panel",
      classes: ["crucible", "crucible-panel"],
      title: game.i18n.localize("crucible.title"),
      template: "modules/crucible-of-fate/templates/crucible-panel.hbs",
      width: 300,
      height: "auto",
      resizable: true,
      minimizable: true,
      draggable: true
    });
  }

  getData() {
    const state = CrucibleState.getState();
    const maxVisibleDice = 12;

    // Prepare dice arrays for display
    const playerDice = Array(Math.min(state.playerPoolCount, maxVisibleDice)).fill(0);
    const gmDice = Array(Math.min(state.gmPoolCount, maxVisibleDice)).fill(0);
    
    const playerOverflow = Math.max(0, state.playerPoolCount - maxVisibleDice);
    const gmOverflow = Math.max(0, state.gmPoolCount - maxVisibleDice);

    return {
      playerPoolCount: state.playerPoolCount,
      gmPoolCount: state.gmPoolCount,
      totalDice: state.playerPoolCount + state.gmPoolCount,
      overrideEnabled: state.overrideEnabled,
      isGM: game.user.isGM,
      playerDice: playerDice,
      gmDice: gmDice,
      playerOverflow: playerOverflow,
      gmOverflow: gmOverflow
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    if (game.user.isGM) {
      html.find("[data-action='invoke']").on("click", this._onInvokeCrucible.bind(this));
      html.find("[data-action='move']").on("click", this._onMoveDice.bind(this));
      html.find("[data-action='rollGmDie']").on("click", this._onRollGmDie.bind(this));
      html.find("[data-action='override']").on("click", this._onToggleOverride.bind(this));
      html.find("[data-action='reset']").on("click", this._onResetPools.bind(this));
    }
  }

  async _onInvokeCrucible() {
    const manager = new SeedRitualManager();
    await manager.start();
  }

  _onMoveDice() {
    const modal = new MoveDiceModal();
    modal.render(true);
  }

  async _onRollGmDie() {
    const state = CrucibleState.getState();
    if (state.gmPoolCount < 1) {
      ui.notifications.warn(game.i18n.localize("crucible.moveDice.error.insufficientDice"));
      return;
    }

    const roll = new Roll("1d6");
    await roll.roll();
    const result = roll.total;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker(),
      content: `<div class="crucible-chat-message">${game.i18n.format("crucible.rollGmDie.chatMessage", { result })}</div>`
    });

    // Move die GM → Player (default behavior)
    const newState = await CrucibleState.updateState({
      gmPoolCount: state.gmPoolCount - 1,
      playerPoolCount: state.playerPoolCount + 1
    });

    CrucibleSocket.broadcastStateUpdate(newState);
  }

  async _onToggleOverride() {
    const state = CrucibleState.getState();
    const newState = await CrucibleState.updateState({
      overrideEnabled: !state.overrideEnabled
    });

    CrucibleSocket.broadcastStateUpdate(newState);
    this.render();
  }

  async _onResetPools() {
    const confirmed = await Dialog.confirm({
      title: game.i18n.localize("crucible.reset.confirm"),
      content: game.i18n.localize("crucible.reset.confirm"),
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (confirmed) {
      const newState = await CrucibleState.updateState({
        playerPoolCount: 0,
        gmPoolCount: 0
      });

      CrucibleSocket.broadcastStateUpdate(newState);
    }
  }

  /**
   * Refresh the panel display
   */
  refresh() {
    this.render();
  }
}
