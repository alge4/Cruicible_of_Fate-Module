/**
 * Crucible of Fate - Move Dice Modal
 * Dialog for GM to transfer dice between pools
 */

import { CrucibleState } from "../state.js";
import { CrucibleSocket } from "../socket.js";

export class MoveDiceModal extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "crucible-move-dice-modal",
      classes: ["crucible", "crucible-move-dice"],
      title: game.i18n.localize("crucible.moveDice.title"),
      template: "modules/crucible-of-fate/templates/move-dice-modal.hbs",
      width: 400,
      height: "auto",
      resizable: false
    });
  }

  getData() {
    const state = CrucibleState.getState();
    return {
      playerPoolCount: state.playerPoolCount,
      gmPoolCount: state.gmPoolCount
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("form").on("submit", this._onSubmit.bind(this));
    html.find("[data-action='cancel']").on("click", this.close.bind(this));
  }

  async _onSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    
    const direction = formData.get("direction");
    const amount = parseInt(formData.get("amount"), 10);

    // Validation
    if (amount < 1) {
      this._showError(game.i18n.localize("crucible.moveDice.error.invalidAmount"));
      return;
    }

    const state = CrucibleState.getState();
    let sourcePool, targetPool, delta;

    if (direction === "playerToGm") {
      if (state.playerPoolCount < amount) {
        this._showError(game.i18n.localize("crucible.moveDice.error.insufficientDice"));
        return;
      }
      delta = {
        playerPoolCount: state.playerPoolCount - amount,
        gmPoolCount: state.gmPoolCount + amount
      };
    } else {
      if (state.gmPoolCount < amount) {
        this._showError(game.i18n.localize("crucible.moveDice.error.insufficientDice"));
        return;
      }
      delta = {
        gmPoolCount: state.gmPoolCount - amount,
        playerPoolCount: state.playerPoolCount + amount
      };
    }

    try {
      await CrucibleState.updateState(delta);
      const newState = CrucibleState.getState();
      CrucibleSocket.broadcastStateUpdate(newState);
      this.close();
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
