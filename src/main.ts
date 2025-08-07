import { GameScene } from "./scenes/GameScene"
import { initializeFarcadeSDK } from "./utils/RemixUtils"
import GameSettings from "./config/GameSettings"

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement

// Game configuration
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL, // Using WebGL for shader support
  width: GameSettings.canvas.width,
  height: GameSettings.canvas.height,
  scale: {
    mode: Phaser.Scale.FIT,
    parent: "gameContainer",
  },
  canvas: canvas,
  backgroundColor: "#f5c84c",
  scene: [GameScene],
  physics: {
    default: 'matter', 
    matter: {
      gravity: { y: 0.6 },
      debug: true
    }
  },
  // Target frame rate
  fps: {
    target: 60,
  },
  // Additional WebGL settings
  pixelArt: false,
  antialias: true,
}

// Create the game instance
const game = new Phaser.Game(config)

// Initialize Farcade SDK
game.events.once("ready", () => {
  initializeFarcadeSDK(game)
})
