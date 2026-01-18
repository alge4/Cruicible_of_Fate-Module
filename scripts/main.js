/**
 * Crucible of Fate - Main Module
 * Initialization and hook registration
 */

import { CrucibleState } from "./state.js";
import { CrucibleSocket } from "./socket.js";
import { RollAugmentation } from "./rollAugmentation.js";
import { CruciblePanel } from "./ui/cruciblePanel.js";
import { SeedRitualManager } from "./ui/seedModal.js";

let seedRitualManager = null;

Hooks.once("init", async () => {
  console.log("Crucible of Fate | Initializing module");

  // Initialize settings
  await CrucibleState.initializeSettings();

  // Register socket handlers
  CrucibleSocket.register();

  // Register hooks for GM-specific socket events
  Hooks.on("crucible.handleSeedResult", async (userId, result) => {
    await handleSeedResult(userId, result);
  });

  Hooks.on("crucible.handleAugmentRequest", async (userId, messageId) => {
    await handleAugmentRequest(userId, messageId);
  });
});

Hooks.once("ready", async () => {
  console.log("Crucible of Fate | Module ready");

  // Initialize seed ritual manager
  seedRitualManager = new SeedRitualManager();

  // Initialize and render Crucible Panel
  if (!CruciblePanel.instance) {
    const panel = new CruciblePanel();
    panel.render(true);
  }

  // Register context menu for chat messages
  Hooks.on("getChatLogEntryContext", addContextMenuEntry);

  // Register hooks for state updates
  Hooks.on("crucible.stateUpdated", () => {
    if (CruciblePanel.instance) {
      CruciblePanel.instance.refresh();
    }
  });

  // Register hooks for seed ritual
  Hooks.on("crucible.seedStarted", (payload) => {
    if (!game.user.isGM && seedRitualManager) {
      seedRitualManager.openForPlayer(game.user.id);
    }
  });

  Hooks.on("crucible.seedComplete", (payload) => {
    if (seedRitualManager) {
      seedRitualManager.complete();
    }
  });


  // Enforce invariant on ready
  if (game.user.isGM) {
    await CrucibleState.enforceInvariant();
  }
});

/**
 * Handle seed result from player
 */
async function handleSeedResult(userId, result) {
  if (!game.user.isGM) return;
  
  try {
    await CrucibleSocket.processSeedResult(userId, result);
  } catch (error) {
    console.error("Crucible of Fate | Error processing seed result:", error);
    ui.notifications.error(error.message);
  }
}

/**
 * Handle augmentation request from player
 */
async function handleAugmentRequest(userId, messageId) {
  if (!game.user.isGM) return;
  
  try {
    await RollAugmentation.handleAugmentRequest(userId, messageId);
  } catch (error) {
    console.error("Crucible of Fate | Error processing augment request:", error);
    ui.notifications.error(error.message);
  }
}

/**
 * Add context menu entry for roll augmentation
 */
function addContextMenuEntry(html, entryOptions) {
  entryOptions.push({
    name: game.i18n.localize("crucible.augment.contextMenu"),
    icon: '<i class="fas fa-dice-d6"></i>',
    condition: (li) => {
      const messageId = li.data("message-id");
      const message = game.messages.get(messageId);
      if (!message) return false;
      return RollAugmentation.canAugment(message);
    },
    callback: async (li) => {
      const messageId = li.data("message-id");
      try {
        await RollAugmentation.processAugment(messageId);
      } catch (error) {
        ui.notifications.error(error.message);
      }
    }
  });
}

/**
 * Register roll messages for tracking
 */
Hooks.on("createChatMessage", (message, options, userId) => {
  // Only track messages with rolls
  if (message.rolls && message.rolls.length > 0) {
    RollAugmentation.registerRoll(message);
  }
});

/**
 * Handle state updates from socket
 */
Hooks.on("crucible.stateUpdated", (state) => {
  // Refresh panel if it exists
  if (CruciblePanel.instance) {
    CruciblePanel.instance.refresh();
  }
});

/**
 * Register settings configuration
 */
Hooks.once("setup", () => {
  // Settings are registered in state.js initializeSettings()
});
