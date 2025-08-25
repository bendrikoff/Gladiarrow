type EnemyArcher = {
  root: Phaser.GameObjects.Container
  head: Phaser.GameObjects.Image
  body: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
  leftArm: Phaser.GameObjects.Graphics
  rightArm: Phaser.GameObjects.Graphics
  leftLeg: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
  rightLeg: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
  bowstring: Phaser.GameObjects.Graphics
  bodyPhysics: MatterJS.BodyType
  topParts: Phaser.GameObjects.Container
  // state
  baseRightArmX: number
  isPulling: boolean
  pullStrength: number
  lastShotTime: number
  shotCooldown: number
  aimOffsetRad: number
  pullTarget: number
  isDying: boolean
}

type EnemySwordsman = {
  root: Phaser.GameObjects.Container
  head: Phaser.GameObjects.Image
  body: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
  leftArm: Phaser.GameObjects.Graphics
  rightArm: Phaser.GameObjects.Graphics
  leftLeg: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
  rightLeg: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
  sword: Phaser.GameObjects.Image
  bodyPhysics: MatterJS.BodyType
  swordPhysics: MatterJS.BodyType
  // movement
  walkSpeed: number
  isWalking: boolean
  isDying: boolean
  // combat
  isAttacking: boolean
  attackCooldown: number
  lastAttackTime: number
  attackRange: number
}

export class GameScene extends Phaser.Scene {
  // --- игрок ---
  private isPulling = false
  private pullStartX = 0
  private pullStartY = 0
  private pullStrength = 0
  private lastShotTime = 0
  private shotCooldown = 500

  // уровни/камера
  private currentLevel = 0
  private screenW = 0
  private groundY = 1500

  private isPlayerMoving = false
  private isGameOver = false

  private playerRoot!: Phaser.GameObjects.Container
  private playerTopParts!: Phaser.GameObjects.Container
  private playerTopPivot!: Phaser.GameObjects.Container

  private player!: {
    root: Phaser.GameObjects.Container
    head: Phaser.GameObjects.Image
    body: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
    leftArm: Phaser.GameObjects.Graphics
    rightArm: Phaser.GameObjects.Graphics
    leftLeg: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
    rightLeg: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
    bowstring: Phaser.GameObjects.Graphics
    bodyPhysics: MatterJS.BodyType
  }

  private arrows: Phaser.Physics.Matter.Image[] = []
  private spawnX = 100
  private spawnY = 1175

  // визуальные эффекты
  private arrowTrailIntervalMs = 40
  private arrowTrailRadius = 5
  private arrowTrailColor = 0x333333

  private enemies: EnemyArcher[] = []
  private swordsmen: EnemySwordsman[] = []

  // таймеры спавна мечников
  private swordsmanTimers: Phaser.Time.TimerEvent[] = []

  // --- бонусы ---
  private tripleShots = 0
  private activeBonuses: Phaser.Physics.Matter.Image[] = []

  // AI диапазоны
  private enemyShotCooldownRange = { min: 2500, max: 2500 } // мс
  private enemyAimOffsetRangeDeg = { min: -80, max: 10 }   // градусы
  private enemyPullRange = { min: 0.1, max: 5.0 }          // сила (|dx|/20)

  // якоря тетивы врага (лук влево)
  private enemyStringTop    = new Phaser.Math.Vector2(-65, -75)
  private enemyStringBottom = new Phaser.Math.Vector2(-75,  20)

  // --- счёт ---
  private score = 0
  private scoreText!: Phaser.GameObjects.Text

  // --- здоровье ---
  private maxHealth = 3
  private currentHealth = 3
  private hearts: Phaser.GameObjects.Image[] = []

  // поверхность
  private surface!: Phaser.Physics.Matter.Image

  // коллекция сгенерированных башен
  private towers: { images: Phaser.GameObjects.Image[]; sensor: MatterJS.BodyType; x: number; topY: number }[] = []

  // параллакс-дома
  private backHousesLayers: Phaser.GameObjects.Image[] = []
  private backParallaxFactor = 0.6

  // параллакс-кусты
  private bushesLayers: Phaser.GameObjects.Image[] = []
  private bushesParallaxFactor = 1

  // облака
  private clouds: Phaser.GameObjects.Image[] = []
  private cloudParallaxFactor = 0.3
  private worldWidth = 0
  private cloudFieldLength = 100000
  private cloudSlots: { x: number; instantiated: boolean }[] = []

  // кости
  private bones: Phaser.GameObjects.Image[] = []

  // --- GAME OVER overlay ---
  private gameOverOverlay?: Phaser.GameObjects.Rectangle
  private gameOverText?: Phaser.GameObjects.Text
  private restartHint?: Phaser.GameObjects.Text

  constructor() { super("GameScene") }
  preload() {
    this.load.image(
      "bow",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/bow-Wa2VEe9QFKydSfWkEBEnY5vLLDZs7j.png?NONj",
    ),
      this.load.image(
        "arrow",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/arrow-9TfrgH79lcsjIEQbyx1PTaydvM0IRw.png?Ibcs",
      ),
      this.load.image(
        "head",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/head-ekuxu6U25rzyMNGPDPnJVVTVJqsYCf.png?qOA8",
      ),
      this.load.image(
        "body",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/body-f4u6MwTOsMOClThnpr3JdqYZGIYYIL.png?Csru",
      ),
      this.load.image(
        "leg",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/leg-lqLtEp0YElktbbwUkWal48gBjYU69r.png?82zv",
      ),
      this.load.image(
        "surface",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/surface-zrSls70PSEdKHbZxxY9arjB5FpKRIL.png?5m72",
      ),
      this.load.image(
        "towerTop",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/towerTop-fSQ4uSsuQofkJF1g9XKyT9tERL5f1q.png?d3Bm",
      ),
      this.load.image(
        "towerBody",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/towerBody-nE21M0f3WPRuyVNoozVOw1JBEgLvm9.png?Vxfn",
      ),
      this.load.image(
        "towerBottom",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/towerBottom-6Xvf4EBpoYh3yITZwrcPNHmpiMpQ9w.png?GQnK",
      ),
      this.load.image(
        "enemy_head",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/head-TckCTxVPRWqED4zdBo5iK1h09AoFWe.png?Q1LI",
      ),
      this.load.image(
        "enemy_body",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/body-K2NMHMRSet2RpzM5s9HH7gWzF6fbbZ.png?9SSC",
      ),
      this.load.image(
        "enemy_leg",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/leg-oxeh84uGhNAArUPmE73bWEOWaCJte9.png?DaSX",
      ),
      this.load.image(
        "sword",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/sword-h5HX8UjGpQE4V9sGxzeI8jDC78chKW.png?hesE",
      ),
      this.load.image(
        "heart",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/heart-VJvnGWtfeZvsVoFAqAuO9UqTVvxaaV.png?EOEv",
      ),
      this.load.image(
        "backHouses",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/backHouses-D1RM8USaDjEl1AxOjNV7d2cSWuW5UI.png?G6AX",
      ),
      this.load.image(
        "bushes",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/green-g9PZ1bNaSMGTm3kAvdjowWAh1dm2Wo.png?YvBL",
      ),
      this.load.image(
        "cloud",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/cloud-oavxqwKKxjG0mBd7CoCwv3um3kbLtF.png?efd9",
      ),
      this.load.image(
        "bone1",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/bone1-d7vuBTRyRg7Vd40OJB7curjbsdn51s.png?sOGf",
      ),
      this.load.image(
        "bone2",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/bone2-Lvu6CiMi7ju0mKD08kOgRTvI4Tyldz.png?khnR",
      ),
      this.load.image(
        "bone3",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/bone3-W90kwRjqQfYH5sCFdlwNrpqk6493vX.png?BPU5",
      ),
      this.load.image(
        "bonus_triple",
        "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/00baee93-09be-4c3c-b026-2f4f88d03e34/triple-niJNWYCkIehOl4spuBcRFxzUNPaUB7.png?xxHc",
      );
  }
  create() {
    this.createBackground();
    this.screenW = this.scale.width

    // облака
    this.initializeCloudField()
    this.instantiateCloudsNearView()

    // камера и мир
    const desiredWorldW = Math.ceil(this.cloudFieldLength / this.cloudParallaxFactor) + this.screenW
    const worldWidth = Math.max(this.screenW * 100, desiredWorldW)
    this.worldWidth = worldWidth
    this.cameras.main.setBounds(0, 0, worldWidth, this.scale.height * 2)
    this.cameras.main.setScroll(0, 0)

    // UI
    this.addScoreUI()

    // первый экран
    this.createSurface(this.levelCenterX(this.currentLevel))
    this.spawnBonesOnSurface()
    this.createBackHouses(this.levelCenterX(this.currentLevel))
    this.createBushes(this.levelCenterX(this.currentLevel))

    // игрок
    this.player = this.createStickman(this.spawnX, this.spawnY)

    // башни и лучники
    this.spawnTwoTowersAndEnemies(this.currentLevel)
    
    // мечники
    this.spawnSwordsmen(this.currentLevel)

    // бонус
    if (this.shouldSpawnTriple(this.currentLevel)) this.spawnTripleBonus(this.currentLevel)

    this.addInputHandlers()

    // общий коллизия-хук
    this.matter.world.on('collisionstart', (event: any) => {
      for (const pair of event.pairs) {
        const bodyA: any = pair.bodyA
        const bodyB: any = pair.bodyB
        const goA = bodyA?.gameObject
        const goB = bodyB?.gameObject

        // стрелы врагов в игрока
        const isArrowA = goA?.texture?.key === 'arrow' && bodyA?.owner === 'enemy'
        const isArrowB = goB?.texture?.key === 'arrow' && bodyB?.owner === 'enemy'
    
        if ((isArrowA && bodyB === this.player.bodyPhysics) || (isArrowB && bodyA === this.player.bodyPhysics)) {
          this.takeDamage(1)
          const arrowBody = isArrowA ? bodyA : bodyB
          const arrowGO = (arrowBody as any).gameObject as Phaser.Physics.Matter.Image
          if ((arrowBody as any).isFlying) {
            const MatterLib = (Phaser.Physics.Matter as any).Matter
            const Body = MatterLib.Body
            Body.setVelocity(arrowBody, { x: 0, y: 0 })
            Body.set(arrowBody, 'angularVelocity', 0)
            Body.setStatic(arrowBody, true)
            ;(arrowBody as any).isFlying = false
          }
          arrowGO?.destroy()
          continue
        }
    
        if (!goA || !goB) continue
    
        const isArrowPlayerA = goA.texture?.key === 'arrow' && bodyA?.owner === 'player'
        const isArrowPlayerB = goB.texture?.key === 'arrow' && bodyB?.owner === 'player'
        const isGroundA = goA.texture?.key === 'surface' || goA.getData?.('isGround')
        const isGroundB = goB.texture?.key === 'surface' || goB.getData?.('isGround')
    
        if (isArrowPlayerA && isGroundB) this.stickAndScheduleRemove(goA as Phaser.Physics.Matter.Image)
        if (isArrowPlayerB && isGroundA) this.stickAndScheduleRemove(goB as Phaser.Physics.Matter.Image)
    
        if (isArrowPlayerA && goB.texture?.key === 'enemy_body') {
          const arrowBody = bodyA as any
          if (arrowBody.isFlying) {
            arrowBody.isFlying = false
            const MatterLib = (Phaser.Physics.Matter as any).Matter
            const Body = MatterLib.Body
            Body.setVelocity(arrowBody, { x: 0, y: 0 })
            Body.set(arrowBody, 'angularVelocity', 0)
            Body.setStatic(arrowBody, true)
          }
          goA.destroy()
        } else if (isArrowPlayerB && goA.texture?.key === 'enemy_body') {
          const arrowBody = bodyB as any
          if (arrowBody.isFlying) {
            arrowBody.isFlying = false
            const MatterLib = (Phaser.Physics.Matter as any).Matter
            const Body = MatterLib.Body
            Body.setVelocity(arrowBody, { x: 0, y: 0 })
            Body.set(arrowBody, 'angularVelocity', 0)
            Body.setStatic(arrowBody, true)
          }
          goB.destroy()
        }
      }
    })

    if (window.FarcadeSDK) {
      window.FarcadeSDK.on("play_again", () => {
        this.restartGame();
      });
    }
  }

  private emitArrowTrail(arrow: Phaser.Physics.Matter.Image, vx: number, vy: number) {
    // вычислить позицию немного позади наконечника
    const speed = Math.hypot(vx, vy) || 1
    const backOffset = 10
    const dx = (vx / speed) * backOffset
    const dy = (vy / speed) * backOffset
    const px = arrow.x - dx
    const py = arrow.y - dy

    const dot = this.add.circle(px, py, this.arrowTrailRadius, this.arrowTrailColor, 1)
    dot.setDepth(arrow.depth - 1)
    dot.setAlpha(0.6)
    // привязываем к той же камере/прокрутке
    dot.setScrollFactor(1)
    dot.fillColor = 0xffffff;

    // легкая рандомизация размера/прозрачности
    const scale = 0.9 + Math.random() * 0.3
    dot.setScale(scale)

    // анимация исчезновения
    this.tweens.add({
      targets: dot,
      alpha: 0,
      duration: 220,
      onComplete: () => { try { dot.destroy() } catch {} }
    })
  }

  // фон
  createBackground() {
    const { width, height } = this.scale;
    const key = 'bgGradient';

    const tex = this.textures.createCanvas(key, width, height);
    if (!tex) return;
    const canvas = tex.getSourceImage() as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;

    const grd = ctx.createLinearGradient(0, 0, 0, height);
    grd.addColorStop(0, '#75c5dc');
    grd.addColorStop(1, '#ffffff');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, width, height);
    tex.refresh();

    this.add.image(0, 0, key).setOrigin(0).setScrollFactor(0).setDepth(-6);
  }

  update() {
    if (!this.player || this.isGameOver) return

    // синхронизируем физическое тело игрока
    if (this.player.bodyPhysics && this.playerRoot) {
      const MatterLib = (Phaser.Physics.Matter as any).Matter
      const Body = MatterLib.Body
      Body.setPosition(this.player.bodyPhysics, { x: this.playerRoot.x, y: this.playerRoot.y })
    }

    // поворот стрел по скорости и эмит хвоста
    for (const arrow of this.arrows) {
      if (!arrow || !arrow.body || !arrow.scene) continue
      const body = arrow.body as MatterJS.BodyType
      if (body?.velocity) {
        const { x: vx, y: vy } = body.velocity
        if (vx || vy) arrow.rotation = Math.atan2(vy, vx)

        // хвост только для летящих стрел
        const isFlying = (arrow.body as any)?.isFlying
        if (isFlying) {
          const now = this.time.now
          const last = (arrow.getData && arrow.getData('trailLastTime')) || 0
          if (now - last >= this.arrowTrailIntervalMs) {
            this.emitArrowTrail(arrow, vx, vy)
            arrow.setData && arrow.setData('trailLastTime', now)
          }
        }
      }
    }

    // игрок — натягивание (если не бежит)
    if (!this.isPlayerMoving && this.isPulling && this.player.leftArm) {
      const p = this.input.activePointer
      const dx = p.x + this.cameras.main.scrollX - this.pullStartX
      const armOffset = Phaser.Math.Clamp(dx * 0.1, -30, 0)
      this.player.leftArm.x = armOffset

      const dy = p.y - this.pullStartY
      const angle = Phaser.Math.Clamp(dy * 0.0015, -0.8, 0.8)
      this.playerTopPivot.rotation = -angle

      this.pullStrength = Math.abs(armOffset) / 20
    }
    if (!this.isPlayerMoving && this.isPulling) this.updateBowstring()

    // враги/мечники
    this.updateEnemiesAI()
    this.updateSwordsmenAI()

    // подчистка стрел
    this.arrows = this.arrows.filter(a => {
      if (!a || !a.body || !a.scene) return false
      if (a.x < -100 || a.x > this.screenW * 110 || a.y < -200 || a.y > 2200) { a.destroy(); return false }
      return true
    })

    // облака
    const deltaSec = this.game.loop.delta / 1000
    const cam = this.cameras.main
    this.instantiateCloudsNearView()
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i]
      if (!c || !c.scene) { this.clouds.splice(i, 1); continue }
      const vx = (c.getData && c.getData('vx')) || 0
      c.x += vx * deltaSec

      const baseY = (c.getData && c.getData('baseY')) || c.y
      const amp = (c.getData && c.getData('vyAmp')) || 0
      const freq = (c.getData && c.getData('vyFreq')) || 0
      const phase = (c.getData && c.getData('vyPhase')) || 0
      if (amp && freq) {
        const t = this.time.now / 1000
        c.y = baseY + Math.sin(t * freq + phase) * amp
      }

      const renderX = c.x - cam.scrollX * this.cloudParallaxFactor
      const halfW = (c.displayWidth || c.width) / 2
      const offscreenRight = renderX - halfW > this.screenW
      const offscreenLeft  = renderX + halfW < -100
      if (offscreenRight || offscreenLeft) {
        try { c.destroy() } catch {}
        this.clouds.splice(i, 1)
      }
    }
  }

  // ---------- helpers уровней/камеры ----------
  private levelLeftX(level: number) { return level * this.screenW }
  private levelCenterX(level: number) { return level * this.screenW + this.screenW / 2 }
  private levelRightX(level: number) { return (level + 1) * this.screenW }

  private panToLevel(level: number, duration = 600) {
    const cam = this.cameras.main
    cam.pan(this.levelCenterX(level), cam.centerY, duration, 'Quad.easeInOut', true)
  }

  // ---------- UI ----------
  private addScoreUI() {
    this.scoreText = this.add.text(this.scale.width / 2, 20, "0", {
      fontFamily: "Arial",
      fontSize: "42px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 6
    }).setOrigin(0.5, 0).setDepth(1000)
    this.scoreText.setScrollFactor(0)

    this.addHealthUI()
  }

  private addHealthUI() {
    const heartSize = 100
    const startX = this.scale.width  - this.maxHealth * heartSize 
    const startY = 20

    for (let i = 0; i < this.maxHealth; i++) {
      const heart = this.add.image(startX + i * (heartSize * 0.8), startY, "heart")
        .setDisplaySize(heartSize, heartSize * 1.5)
        .setOrigin(0, 0)
        .setDepth(1000)
        .setScrollFactor(0)
      this.hearts.push(heart)
    }
  }

  private takeDamage(amount: number = 1) {
    if (this.isGameOver) return
    this.currentHealth = Math.max(0, this.currentHealth - amount)
    this.updateHealthUI()
    if (this.currentHealth <= 0) this.gameOver()
  }

  private heal(amount: number = 1) {
    this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount)
    this.updateHealthUI()
  }

  private updateHealthUI() {
    for (let i = 0; i < this.hearts.length; i++) {
      this.hearts[i].setVisible(i < this.currentHealth)
    }
  }

  // ---------- ЧЁРНЫЙ ЭКРАН + РЕСТАРТ ----------
  private gameOver() {
    if (this.isGameOver) return
    this.isGameOver = true

    // Остановить поведение противников/таймеров, но не всю сцену (чтобы анимация затемнения прошла)
    this.cancelSwordsmanTimers()
    this.tweens.killAll()

    // Чёрный оверлей
    const overlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 1)
      .setOrigin(0)
      .setScrollFactor(0)
      .setAlpha(0)
      .setDepth(2000)
    this.gameOverOverlay = overlay

    // Текст


    try {
      if (window.FarcadeSDK && window.FarcadeSDK.singlePlayer && window.FarcadeSDK.singlePlayer.actions) {
        if (window.FarcadeSDK.singlePlayer.actions.hapticFeedback) {
          window.FarcadeSDK.singlePlayer.actions.hapticFeedback();
        }
        window.FarcadeSDK.singlePlayer.actions.gameOver({ score: this.score });
      }
    } catch {}

    // Плавное затемнение
    this.tweens.add({
      targets: overlay,
      alpha: 0.9,
      duration: 400,
      ease: "Quad.InOut"
    })
  }

  // Публичный метод рестарта
  restartGame() {
    try {
      this.gameOverOverlay?.destroy();
    } catch {}
    try {
      this.gameOverText?.destroy();
    } catch {}
    try {
      this.restartHint?.destroy();
    } catch {}
    (this.gameOverOverlay = void 0),
      (this.gameOverText = void 0),
      (this.restartHint = void 0),
      (this.isGameOver = !1),
      (this.isPlayerMoving = !1),
      this.cancelSwordsmanTimers(),
      this.scene.restart();
  }

  // ---------- игрок ----------
  private createStickman(x: number, y: number) {
    const head = this.add.image(0, -95, "head").setDisplaySize(120, 120)

    const leftArm = this.add.graphics()
    leftArm.fillStyle(0xffd49c, 1).fillRoundedRect(-10, -60, 50, 13, 5)
    leftArm.rotation = -0.1

    const rightArm = this.add.graphics()
    rightArm.fillStyle(0xffd49c, 1).fillRoundedRect(30, -60, 50, 13, 5)

    const bowImage = this.add.image(50, -50, "bow")
    bowImage.setScale(0.13)
    bowImage.rotation = -75

    const bowstring = this.createBowstring()
    const topParts = this.add.container(0, 0, [leftArm, rightArm, bowImage, bowstring])
    this.playerTopParts = topParts

    const body = this.add.image(0, -30, "body").setDisplaySize(60, 60)
    const leftLeg  = this.add.image(-10, 5, "leg").setDisplaySize(20, 20)
    const rightLeg = this.add.image(20, 5, "leg").setDisplaySize(20, 20)

    this.playerTopPivot = this.add.container(-50, 0, [topParts])
    const root = this.add.container(x, y, [head, leftLeg, rightLeg, body, this.playerTopPivot])
    this.playerRoot = root

    // центрируем topParts под пивотом
    const b = topParts.getBounds()
    const cX = b.centerX - root.x
    const cY = b.centerY - root.y
    this.playerTopPivot.setPosition(cX, cY)
    topParts.x = -cX
    topParts.y = -cY

    const bodyPhysics = this.matter.add.rectangle(x, y, 60, 160, { isStatic: true })
    const MatterLib = (Phaser.Physics.Matter as any).Matter
    MatterLib.Body.set(bodyPhysics, 'collisionFilter', { category: 0x0001, mask: 0x0002 })

    return { root, head, body: body as any, leftArm, rightArm, leftLeg: leftLeg as any, rightLeg: rightLeg as any, bowstring, bodyPhysics }
  }

  private createBowstring(): Phaser.GameObjects.Graphics {
    const g = this.add.graphics()
    g.lineStyle(4, 0xffffff).beginPath()
    g.moveTo(40, -100)
    g.lineTo(50, 0)
    g.strokePath()
    return g
  }

  private updateBowstring() {
    const g = this.player.bowstring
    const leftArm = this.player.leftArm
    g.clear().lineStyle(4, 0xffffff).beginPath()
    g.moveTo(40, -100)
    g.lineTo(leftArm.x + 40, leftArm.y - 60)
    g.lineTo(50, 0)
    g.strokePath()
  }

  private resetBowstring() {
    const g = this.player.bowstring
    g.clear().lineStyle(4, 0xffffff).beginPath()
    g.moveTo(40, -100)
    g.lineTo(50, 0)
    g.strokePath()
  }

  private spawnPlayerArrow(spawnX: number, spawnY: number, angle: number, speed: number) {
    const arrow = this.matter.add.image(spawnX, spawnY, "arrow")
    arrow.setScale(0.1).setRotation(angle)
    arrow.setBody({ type: "rectangle", width: 40, height: 6 })
    arrow.setMass(1)
    
    const MatterLib = (Phaser.Physics.Matter as any).Matter
    const Body = MatterLib.Body
    Body.set(arrow.body, 'collisionFilter', { category: 0x0002, mask: 0x0001 })

    arrow.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed)

    ;(arrow.body as any).isArrow = true
    ;(arrow.body as any).isFlying = true
    ;(arrow.body as any).owner = 'player'

    this.arrows.push(arrow)
    return arrow
  }

  private shootArrow() {
    if (this.isPlayerMoving || this.isGameOver) return
    if (this.pullStrength === 0) return
    const now = Date.now()
    if (now - this.lastShotTime < this.shotCooldown) return
    this.lastShotTime = now

    const rightArm = this.player.rightArm as Phaser.GameObjects.Graphics
    const m = (rightArm as any).getWorldTransformMatrix()
    const localX = 80
    const localY = -60 + 13 / 2

    const spawnX = m.a * localX + m.c * localY + m.tx
    const spawnY = m.b * localX + m.d * localY + m.ty
    const armAngle = Math.atan2(m.b, m.a)
    const v = this.pullStrength * 15

    if (this.tripleShots > 0) {
      const spread = 0.12
      this.spawnPlayerArrow(spawnX, spawnY, armAngle - spread, v)
      this.spawnPlayerArrow(spawnX, spawnY, armAngle,          v)
      this.spawnPlayerArrow(spawnX, spawnY, armAngle + spread, v)
      this.tripleShots -= 1
    } else {
      this.spawnPlayerArrow(spawnX, spawnY, armAngle, v)
    }
  }

  private addInputHandlers() {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.isPlayerMoving || this.isGameOver) return
      this.isPulling = true
      this.pullStartX = p.x + this.cameras.main.scrollX
      this.pullStartY = p.y
      this.pullStrength = 0
    })

    this.input.on("pointerup", () => {
      if (this.isPlayerMoving || this.isGameOver) return
      this.shootArrow()
      this.isPulling = false
      this.player.leftArm.x = 0
      this.pullStrength = 0
      this.resetBowstring()
    })

    this.input.manager.canvas.addEventListener("mouseleave", () => {
      if (this.isPlayerMoving || this.isGameOver) return
      this.shootArrow()
      this.isPulling = false
      this.player.leftArm.x = 0
      this.pullStrength = 0
      this.resetBowstring()
    })
  }

  // ---------- враги (двое) ----------
  private createEnemyArcher(x: number, y: number): EnemyArcher {
    const leftArm = this.add.graphics()
    leftArm.fillStyle(0x613e26, 1).fillRoundedRect(-10, -60, 50, 13, 5)
    leftArm.rotation = -0.1
    leftArm.x -= 85
    leftArm.y += 25

    const rightArm = this.add.graphics()
    rightArm.fillStyle(0x613e26, 1).fillRoundedRect(30, -60, 50, 13, 5)
    rightArm.x -= 85
    rightArm.y += 25

    const bowImage = this.add.image(-75, -25, "bow")
    bowImage.setScale(-0.13, 0.13)
    bowImage.rotation = 75

    const bowstring = this.createBowstringLeft()
    const topParts = this.add.container(0, 0, [leftArm, rightArm, bowImage, bowstring])

    const head  = this.add.image(0, -90, "enemy_head").setDisplaySize(100, 100)
    const body  = this.add.image(5, -30, "enemy_body").setDisplaySize(60, 60)
    const leftLeg  = this.add.image(-10, 5, "enemy_leg").setDisplaySize(20, 20)
    const rightLeg = this.add.image(20, 5, "enemy_leg").setDisplaySize(20, 20)

    const enemyTopPivot = this.add.container(50, -30, [topParts])
    const root = this.add.container(x, y, [head, leftLeg, rightLeg, body, enemyTopPivot])

    const bodyPhysics = this.matter.add.rectangle(x, y - 50, 60, 160, { isStatic: true })

    const enemy: EnemyArcher = {
      root, head, body: body as any, leftArm, rightArm,
      leftLeg: leftLeg as any, rightLeg: rightLeg as any,
      bowstring, bodyPhysics, topParts,
      baseRightArmX: rightArm.x,
      isPulling: false,
      pullStrength: 0,
      lastShotTime: Date.now(),
      shotCooldown: Phaser.Math.Between(this.enemyShotCooldownRange.min, this.enemyShotCooldownRange.max),
      aimOffsetRad: 0,
      pullTarget: 1,
      isDying: false
    }

    ;(enemy as any).topPivot = enemyTopPivot

    this.resetEnemyBowstring(enemy)
    this.setupArrowEnemyCollision(enemy)
    return enemy
  }

  private createBowstringLeft(): Phaser.GameObjects.Graphics {
    const g = this.add.graphics()
    g.lineStyle(4, 0xffffff).beginPath()
    g.moveTo(this.enemyStringTop.x, this.enemyStringTop.y)
    g.lineTo(this.enemyStringBottom.x, this.enemyStringBottom.y)
    g.strokePath()
    return g
  }

  private updateEnemyBowstring(enemy: EnemyArcher) {
    const r = enemy.rightArm
    const midX = r.x + 55
    const midY = r.y - 60 + 13 / 2
    const g = enemy.bowstring
    g.clear().lineStyle(4, 0xffffff).beginPath()
    g.moveTo(this.enemyStringTop.x, this.enemyStringTop.y)
    g.lineTo(midX, midY)
    g.lineTo(this.enemyStringBottom.x, this.enemyStringBottom.y)
    g.strokePath()
  }

  private resetEnemyBowstring(enemy: EnemyArcher) {
    const g = enemy.bowstring
    g.clear().lineStyle(4, 0xffffff).beginPath()
    g.moveTo(this.enemyStringTop.x, this.enemyStringTop.y)
    g.lineTo(this.enemyStringBottom.x, this.enemyStringBottom.y)
    g.strokePath()
  }

  private updateEnemiesAI() {
    if (!this.playerRoot) return

    const now = Date.now()
    for (const enemy of this.enemies) {
      if (enemy.isDying) continue

      const dy = this.playerRoot.y - enemy.root.y
      const baseAimAngle = Phaser.Math.Clamp(dy * 0.0015, -0.8, 0.8)
      const topPivot = (enemy as any).topPivot as Phaser.GameObjects.Container
      topPivot.rotation = -(baseAimAngle + enemy.aimOffsetRad)

      if (!enemy.isPulling && now - enemy.lastShotTime >= enemy.shotCooldown) {
        this.startEnemyPullSequence(enemy)
      }
    }
  }

  private startEnemyPullSequence(enemy: EnemyArcher) {
    enemy.isPulling = true

    enemy.aimOffsetRad = Phaser.Math.DEG_TO_RAD *
      Phaser.Math.FloatBetween(this.enemyAimOffsetRangeDeg.min, this.enemyAimOffsetRangeDeg.max)
    enemy.pullTarget = Phaser.Math.FloatBetween(this.enemyPullRange.min, this.enemyPullRange.max)

    this.tweens.killTweensOf(enemy.rightArm)
    enemy.rightArm.x = enemy.baseRightArmX
    this.resetEnemyBowstring(enemy)

    const pullPixels = Phaser.Math.Clamp(enemy.pullTarget * 20, 4, 30)

    this.tweens.add({
      targets: enemy.rightArm,
      x: enemy.baseRightArmX - pullPixels,
      duration: 240 + (pullPixels - 20) * 3,
      ease: "Quad.Out",
      onUpdate: () => {
        enemy.pullStrength = Math.abs(enemy.rightArm.x - enemy.baseRightArmX) / 20
        this.updateEnemyBowstring(enemy)
      },
      onComplete: () => {
        this.enemyShootArrow(enemy)
        this.tweens.add({
          targets: enemy.rightArm,
          x: enemy.baseRightArmX,
          duration: 140,
          ease: "Quad.In",
          onUpdate: () => this.updateEnemyBowstring(enemy),
          onComplete: () => {
            enemy.isPulling = false
            enemy.pullStrength = 0
            enemy.lastShotTime = Date.now()
            enemy.shotCooldown = Phaser.Math.Between(this.enemyShotCooldownRange.min, this.enemyShotCooldownRange.max)
            this.resetEnemyBowstring(enemy)
          }
        })
      }
    })
  }

  private enemyShootArrow(enemy: EnemyArcher) {
    const pull = Math.abs(enemy.rightArm.x - enemy.baseRightArmX) / 20
    if (pull <= 0) return
  
    const rightArm = enemy.rightArm as Phaser.GameObjects.Graphics
    const m = (rightArm as any).getWorldTransformMatrix()
  
    const localX = 30
    const localY = -60 + 13 / 2
  
    const spawnX = m.a * localX + m.c * localY + m.tx
    const spawnY = m.b * localX + m.d * localY + m.ty
    const armAngle = Math.atan2(m.b, m.a) + Math.PI
  
    const arrow = this.matter.add.image(spawnX, spawnY, "arrow")
    arrow.setScale(0.1).setRotation(armAngle)
    arrow.setBody({ type: "rectangle", width: 40, height: 6 })
    arrow.setMass(1)
  
    arrow.setCollisionCategory(0x0002) // враг
    arrow.setCollidesWith(0x0001)      // игрок
  
    const arrowBody = arrow.body as any
    arrowBody.isArrow = true
    arrowBody.isFlying = true
    arrowBody.owner = 'enemy'
  
    this.arrows.push(arrow)
  
    const velocity = pull * 15
    arrow.setVelocity(Math.cos(armAngle) * velocity, Math.sin(armAngle) * velocity)
  }
  

  // ---------- мечники ----------
  private createEnemySwordsman(x: number, y: number): EnemySwordsman {
    const sword = this.add.image(-55, -65, "sword").setScale(0.15)

    const rightArm = this.add.graphics()
    rightArm.fillStyle(0x613e26, 1).fillRoundedRect(-60, -35, 50, 13, 5)
    rightArm.rotation = Math.PI / 2

    const leftArm = this.add.graphics()
    leftArm.fillStyle(0x613e26, 1).fillRoundedRect(-50, -45, 50, 13, 5)
    leftArm.rotation = 0

    const head = this.add.image(0, -90, "enemy_head").setDisplaySize(100, 100)
    const body = this.add.image(5, -30, "enemy_body").setDisplaySize(60, 60)
    const leftLeg = this.add.image(-10, 5, "enemy_leg").setDisplaySize(20, 20)
    const rightLeg = this.add.image(20, 5, "enemy_leg").setDisplaySize(20, 20)

    const root = this.add.container(x, y, [head, leftLeg, rightLeg, body, leftArm, rightArm, sword])

    const bodyPhysics = this.matter.add.rectangle(x, y - 50, 60, 160, { isStatic: true })
    const swordPhysics = this.matter.add.rectangle(x - 55, y - 65, 40, 80, { isStatic: true, isSensor: true })
    ;(bodyPhysics as any).ignoreGravity = true
    ;(swordPhysics as any).ignoreGravity = true

    const swordsman: EnemySwordsman = {
      root, head, body: body as any, leftArm, rightArm,
      leftLeg: leftLeg as any, rightLeg: rightLeg as any,
      sword, bodyPhysics, swordPhysics,
      walkSpeed: Phaser.Math.FloatBetween(0.8, 1.2),
      isWalking: true,
      isDying: false,
      isAttacking: false,
      attackCooldown: 2000,
      lastAttackTime: 0,
      attackRange: 120
    }

    this.setupArrowSwordsmanCollision(swordsman)
    return swordsman
  }

  private attachSwordToLeftHand(s: EnemySwordsman) {
    const arm = s.leftArm as any
    const mArm = arm.getWorldTransformMatrix()
  
    const gripLX = -45
    const gripLY = -65
  
    const worldX = mArm.a * gripLX + mArm.c * gripLY + mArm.tx
    const worldY = mArm.b * gripLX + mArm.d * gripLY + mArm.ty
  
    const root = s.root as any
    const mRoot = root.getWorldTransformMatrix()
    const local = new Phaser.Math.Vector2()
    mRoot.applyInverse(worldX, worldY, local)
  
    const armAngle = Math.atan2(mArm.b, mArm.a)
  
    s.sword.x = local.x
    s.sword.y = local.y
    s.sword.rotation = armAngle
  
    const MatterLib = (Phaser.Physics.Matter as any).Matter
    const Body = MatterLib.Body
    Body.setPosition(s.swordPhysics, { x: worldX, y: worldY })
    Body.setAngle(s.swordPhysics, s.sword.rotation)
  }
  
  private updateSwordsmenAI() {
    if (!this.playerRoot || this.isGameOver) return
  
    const delta = this.game.loop.delta
    const now = Date.now()
  
    for (let i = this.swordsmen.length - 1; i >= 0; i--) {
      const s = this.swordsmen[i]
      if (s.isDying) continue
  
      const distanceToPlayer = Math.abs(s.root.x - this.playerRoot.x)
  
      if (!s.isAttacking && distanceToPlayer <= s.attackRange && now - s.lastAttackTime > s.attackCooldown) {
        this.playSwordsmanAttack(s)
      } else if (!s.isAttacking && distanceToPlayer > s.attackRange) {
        s.isWalking = true
        const moveSpeed = s.walkSpeed * delta * 0.1
        s.root.x -= moveSpeed

        const MatterLib = (Phaser.Physics.Matter as any).Matter
        const Body = MatterLib.Body
        Body.setPosition(s.bodyPhysics, { x: s.root.x, y: s.root.y - 50 })

        this.animateSwordsmanWalking(s, delta)

        if (s.root.x < this.cameras.main.scrollX - 200) {
          s.root.destroy(true)
          this.matter.world.remove(s.bodyPhysics)
          this.matter.world.remove(s.swordPhysics)
          this.swordsmen.splice(i, 1)
          continue
        }
      } else if (s.isAttacking) {
        s.isWalking = false
      } else if (distanceToPlayer <= s.attackRange) {
        s.isWalking = false
      }
  
      this.attachSwordToLeftHand(s)
    }
  }
  
  private playSwordsmanAttack(s: EnemySwordsman) {
    s.isAttacking = true
    s.isWalking = false
    s.lastAttackTime = Date.now()
  
    const ATTACK_WINDUP = 300
    const ATTACK_DURATION = 200
    const ATTACK_RECOVER = 400
  
    this.tweens.add({
      targets: s.leftArm,
      rotation: -0.8,
      duration: ATTACK_WINDUP,
      ease: 'Quad.Out',
      onComplete: () => {
        this.tweens.add({
          targets: s.leftArm,
          rotation: 0.5,
          duration: ATTACK_DURATION,
          ease: 'Quad.In',
          onComplete: () => {
            this.takeDamage(1)
            s.isAttacking = false
            this.tweens.add({
              targets: s.leftArm,
              rotation: 0,
              duration: ATTACK_RECOVER,
              ease: 'Quad.Out',
              onComplete: () => {
                const distanceToPlayer = Math.abs(s.root.x - this.playerRoot.x)
                s.isWalking = distanceToPlayer > s.attackRange
              }
            })
          }
        })
      }
    })
  }
  
  private animateSwordsmanWalking(s: EnemySwordsman, _delta: number) {
    if (!s.isWalking) {
      s.leftLeg.rotation = 0
      s.rightLeg.rotation = 0
      return
    }
    
    const t = this.time.now * 0.005
    s.leftLeg.rotation = Math.sin(t) * 0.3
    s.rightLeg.rotation = Math.sin(t + Math.PI) * 0.3
    
    const rightArmT = t * 1.2
    s.rightArm.rotation = Math.PI / 2 + Math.sin(rightArmT) * 0.07
    
    const leftArmT = t * 1.6
    s.leftArm.rotation = Math.sin(leftArmT) * 0.12
  }

  // ---------- поверхность ----------
  private createSurface(centerX: number): void {
    const tex = this.textures.get("surface").getSourceImage() as HTMLImageElement
    const scale = this.screenW / tex.width

    const surf = this.matter.add.image(centerX, this.groundY, "surface", undefined, { isStatic: true })
    surf.setScale(scale)
    surf.setBody({ type: "rectangle", width: tex.width * scale, height: tex.height * scale })
    surf.setStatic(true)
    surf.setDepth(-5)
    this.surface = surf

    this.setupArrowSurfaceCollision(surf)
  }

  // ---------- кости ----------
  private destroyBones() {
    for (const b of this.bones) { try { b.destroy() } catch {} }
    this.bones = []
  }

  private spawnBonesOnSurface() {
    if (!this.surface) return
    this.destroyBones()

    const count = Phaser.Math.Between(1, 5)
    const keys = ["bone1", "bone2", "bone3"]

    const surf = this.surface
    const width = surf.displayWidth || (this.textures.get("surface").getSourceImage() as HTMLImageElement).width
    const leftX = surf.x - width / 2
    const rightX = surf.x + width / 2
    const displayH = surf.displayHeight || 0
    const topY = surf.y - displayH / 2
    const bottomY = surf.y + displayH / 2
    const topInset = 100
    const bottomInset = 100
    const yMin = topY + topInset;
    const yMax = bottomY - bottomInset

    const placed: { x: number; y: number }[] = []
    const minDist = 160
    const maxTriesPerBone = 20

    for (let i = 0; i < count; i++) {
      const key = Phaser.Utils.Array.GetRandom(keys)

      let attempt = 0, x = 0, y = 0, ok = false
      while (attempt < maxTriesPerBone) {
        x = Phaser.Math.Between(Math.floor(leftX + 60), Math.floor(rightX - 60))
        y = Phaser.Math.Between(Math.floor(yMin), Math.floor(yMax))
        const conflict = placed.some(p => Phaser.Math.Distance.Between(p.x, p.y, x, y) < minDist)
        if (!conflict) { ok = true; break }
        attempt++
      }
      if (!ok) continue

      const scale = Phaser.Math.FloatBetween(0.18, 0.28)
      const rot = Phaser.Math.FloatBetween(-0.3, 0.3)

      const img = this.add.image(x, y, key).setScale(scale).setRotation(rot).setDepth(-4.9)
      this.bones.push(img)
      placed.push({ x, y })
    }
  }

  // ---------- задний план (параллакс) ----------
  private createBackHouses(centerX: number) {
    const tex = this.textures.get("backHouses");
    if (!tex || !tex.getSourceImage()) { console.warn("[backHouses] texture missing"); return }
    const img = tex.getSourceImage() as HTMLImageElement;

    const scale = (this.screenW * 1.8) / img.width
    const y = this.groundY + 100

    const layer = this.add.image(centerX, y, "backHouses")
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setDepth(-5.9)
      .setScrollFactor(this.backParallaxFactor, 0)

    this.backHousesLayers.push(layer);
  }

  private createBushes(centerX: number) {
    const tex = this.textures.get("bushes");
    if (!tex || !tex.getSourceImage()) { console.warn("[bushes] texture missing"); return }
    const img = tex.getSourceImage() as HTMLImageElement;

    const scale = (this.screenW * 1.2) / img.width
    const y = this.groundY - 70

    const layer = this.add.image(centerX, y, "bushes")
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setDepth(-5.6)
      .setScrollFactor(this.bushesParallaxFactor, 0)

    this.bushesLayers.push(layer);
  }

  // ---------- облака ----------
  private initializeCloudField() {
    const count = Math.max(50, Math.floor(this.cloudFieldLength / 1200))
    const spacing = this.cloudFieldLength / count
    this.cloudSlots = []
    for (let i = 0; i < count; i++) {
      const x = i * spacing + Phaser.Math.Between(-80, 80)
      this.cloudSlots.push({ x, instantiated: false })
    }
  }

  private instantiateCloudsNearView() {
    const cam = this.cameras.main
    const viewLeft = cam.scrollX * this.cloudParallaxFactor - 100
    const viewRight = viewLeft + this.screenW + 200

    for (const slot of this.cloudSlots) {
      if (slot.instantiated) continue
      if (slot.x >= viewLeft && slot.x <= viewRight) {
        const y = Phaser.Math.Between(70, 340)
        const scale = Phaser.Math.FloatBetween(0.6, 1.3)
        const alpha = Phaser.Math.FloatBetween(0.5, 0.9)
        const baseSpeed = Phaser.Math.FloatBetween(12, 28)
        const speedByScale = baseSpeed * (1.6 - Math.min(1.4, Math.max(0.6, scale)))
        const vx = Phaser.Math.FloatBetween(speedByScale * 0.8, speedByScale * 1.2)

        const cloud = this.add.image(slot.x, y, "cloud")
          .setOrigin(0.5, 0.5)
          .setScale(scale)
          .setAlpha(alpha)
          .setDepth(-5.95)
          .setScrollFactor(this.cloudParallaxFactor, 0)

        const vyAmp  = Phaser.Math.FloatBetween(4, 12)
        const vyFreq = Phaser.Math.FloatBetween(0.2, 0.5)
        const vyPhase = Phaser.Math.FloatBetween(0, Math.PI * 2)

        ;(cloud as any).setData && cloud.setData('vx', vx)
        ;(cloud as any).setData && cloud.setData('baseY', y)
        ;(cloud as any).setData && cloud.setData('vyAmp', vyAmp)
        ;(cloud as any).setData && cloud.setData('vyFreq', vyFreq)
        ;(cloud as any).setData && cloud.setData('vyPhase', vyPhase)

        this.clouds.push(cloud)
        slot.instantiated = true
      }
    }
  }

  private spawnCloud(opts?: { xOffset?: number; y?: number; vx?: number }) {
    const cam = this.cameras.main
    let y = opts?.y ?? Phaser.Math.Between(70, 340)
    const scale = Phaser.Math.FloatBetween(0.6, 1.3)
    const alpha = Phaser.Math.FloatBetween(0.5, 0.9)
    const baseSpeed = Phaser.Math.FloatBetween(12, 28)
    const speedByScale = baseSpeed * (1.6 - Math.min(1.4, Math.max(0.6, scale)))
    const vx = opts?.vx ?? Phaser.Math.FloatBetween(speedByScale * 0.8, speedByScale * 1.2)

    const cloud = this.add.image(0, y, "cloud")
      .setOrigin(0.5, 0.5)
      .setScale(scale)
      .setAlpha(alpha)
      .setDepth(-5.95)
      .setScrollFactor(this.cloudParallaxFactor, 0)

    const offscreenMargin = 24
    const spawnX = cam.scrollX * this.cloudParallaxFactor + this.screenW + offscreenMargin + (opts?.xOffset ?? 0)
    cloud.x = spawnX

    const vyAmp  = Phaser.Math.FloatBetween(4, 12)
    const vyFreq = Phaser.Math.FloatBetween(0.2, 0.5)
    const vyPhase = Phaser.Math.FloatBetween(0, Math.PI * 2)

    ;(cloud as any).setData && cloud.setData('vx', vx)
    ;(cloud as any).setData && cloud.setData('baseY', y)
    ;(cloud as any).setData && cloud.setData('vyAmp', vyAmp)
    ;(cloud as any).setData && cloud.setData('vyFreq', vyFreq)
    ;(cloud as any).setData && cloud.setData('vyPhase', vyPhase)
    ;(cloud as any).setData && cloud.setData('level', this.currentLevel)

    const minYGap = 50
    const renderSpawnX = this.screenW
    let tries = 0
    while (tries < 8) {
      const conflict = this.clouds.some(c => {
        const rx = c.x - cam.scrollX * this.cloudParallaxFactor
        return Math.abs(rx - renderSpawnX) < 220 && Math.abs(c.y - cloud.y) < minYGap
      })
      if (!conflict) break
      cloud.y = Phaser.Math.Between(70, 340)
      ;(cloud as any).setData && cloud.setData('baseY', cloud.y)
      tries++
    }

    this.clouds.push(cloud)
  }

  private destroyBackHouses() {
    for (const l of this.backHousesLayers) { try { l.destroy() } catch {} }
    this.backHousesLayers = []
  }
  private destroyBushes() {
    for (const l of this.bushesLayers) { try { l.destroy() } catch {} }
    this.bushesLayers = []
  }

  private stickAndScheduleRemove(arrow: Phaser.Physics.Matter.Image) {
    if (!arrow || !arrow.body || arrow.getData?.('stuck')) return
    arrow.setData?.('stuck', true)
    arrow.setVelocity(0, 0)
    arrow.setAngularVelocity(0)
    arrow.setStatic(true)
    this.time.delayedCall(1500, () => {
      this.tweens.add({
        targets: arrow,
        alpha: 0,
        delay: 300,
        duration: 300,
        ease: "Quad.In",
        onComplete: () => {
          if (!arrow.scene) return
          arrow.destroy()
          this.arrows = this.arrows.filter(a => a !== arrow)
        }
      })
    })
  }

  // ---------- башня ----------
  private createTowerAtPosition(x: number, groundY: number) {
    const scale = 0.6

    const getSize = (key: string) => {
      const img = this.textures.get(key).getSourceImage() as HTMLImageElement
      return { w: img.width * scale, h: img.height * scale }
    }

    const szBottom = getSize("towerBottom")
    const szBody   = getSize("towerBody")
    const szTop    = getSize("towerTop")

    const bodyCount = Phaser.Math.Between(1, 7)
    const totalH = szBottom.h + bodyCount * szBody.h + szTop.h
    const maxW   = Math.max(szBottom.w, szBody.w, szTop.w)

    const centerY = groundY - totalH / 2

    let currentY = groundY

    const images: Phaser.GameObjects.Image[] = []

    const bottom = this.add.image(x, currentY - szBottom.h / 2, "towerBottom").setScale(scale)
    images.push(bottom)
    currentY -= szBottom.h

    for (let i = 0; i < bodyCount; i++) {
      const b = this.add.image(x, currentY - szBody.h / 2, "towerBody").setScale(scale)
      images.push(b)
      currentY -= szBody.h
    }

    const top = this.add.image(x, currentY - szTop.h / 2, "towerTop").setScale(scale)
    images.push(top)

    const sensor = this.matter.add.rectangle(x, centerY, maxW, totalH, {
      isStatic: true,
      isSensor: true,
      collisionFilter: { category: 0x0002, mask: 0 }
    })

    const topY = top.y - (szTop.h / 2)

    this.towers.push({ images, sensor, x, topY })
    return { x, topY }
  }

  // ---------- коллизии ----------
  private setupArrowSurfaceCollision(surface: Phaser.Physics.Matter.Image) {
    const MatterLib = (Phaser.Physics.Matter as any).Matter
    const Body = MatterLib.Body
    const surfaceBody = surface.body as MatterJS.BodyType

    this.matter.world.on("collisionstart", (event: any) => {
      event.pairs.forEach((pair: any) => {
        let arrowBody: MatterJS.BodyType | null = null
        if (pair.bodyA === surfaceBody && (pair.bodyB as any).isArrow) arrowBody = pair.bodyB
        else if (pair.bodyB === surfaceBody && (pair.bodyA as any).isArrow) arrowBody = pair.bodyA
        if (!arrowBody) return
        if ((arrowBody as any).isFlying) {
          const angle = (arrowBody as any).angle || 0
          Body.setVelocity(arrowBody, { x: 0, y: 0 })
          Body.set(arrowBody, { angularVelocity: 0 })
          Body.setAngle(arrowBody, angle)
          Body.setStatic(arrowBody, true)
          Body.translate(arrowBody, { x: Math.cos(angle) * 2, y: Math.sin(angle) * 2 })
          ;(arrowBody as any).isFlying = false
        }
      })
    })
  }

  private setupArrowEnemyCollision(enemy: EnemyArcher) {
    const handler = (event: any) => {
      event.pairs.forEach((pair: any) => {
        let arrowBody: MatterJS.BodyType | null = null
        let hitEnemy = false
        if ((pair.bodyA as any).isArrow && pair.bodyB === enemy.bodyPhysics) { arrowBody = pair.bodyA; hitEnemy = true }
        else if ((pair.bodyB as any).isArrow && pair.bodyA === enemy.bodyPhysics) { arrowBody = pair.bodyB; hitEnemy = true }
        if (!hitEnemy || !arrowBody || enemy.isDying) return
        if ((arrowBody as any).owner !== 'player') return
        if (!(arrowBody as any).isFlying) return

        ;(arrowBody as any).isFlying = false

        this.score += 1
        this.scoreText.setText(String(this.score))

        const arrowGO = (arrowBody as any).gameObject as Phaser.Physics.Matter.Image
        if (arrowGO) {
          this.arrows = this.arrows.filter(a => a !== arrowGO)
          arrowGO.destroy()
        }

        this.killEnemyWithDelay(enemy, 350);
      })
    }
    this.matter.world.on("collisionstart", handler as any)
  }

  private setupArrowSwordsmanCollision(swordsman: EnemySwordsman) {
    const handler = (event: any) => {
      event.pairs.forEach((pair: any) => {
        let arrowBody: MatterJS.BodyType | null = null
        let hitSwordsman = false
        if ((pair.bodyA as any).isArrow && pair.bodyB === swordsman.bodyPhysics) { arrowBody = pair.bodyA; hitSwordsman = true }
        else if ((pair.bodyB as any).isArrow && pair.bodyA === swordsman.bodyPhysics) { arrowBody = pair.bodyB; hitSwordsman = true }
        if (!hitSwordsman || !arrowBody || swordsman.isDying) return
        if ((arrowBody as any).owner !== 'player') return
        if (!(arrowBody as any).isFlying) return

        ;(arrowBody as any).isFlying = false

        this.score += 1
        this.scoreText.setText(String(this.score))

        const arrowGO = (arrowBody as any).gameObject as Phaser.Physics.Matter.Image
        if (arrowGO) {
          this.arrows = this.arrows.filter(a => a !== arrowGO)
          arrowGO.destroy()
        }

        this.killSwordsmanWithDelay(swordsman, 350);
      })
    }
    this.matter.world.on("collisionstart", handler as any)
  }

  // ---------- бонус: тройная стрела ----------
  private shouldSpawnTriple(level: number) {
    return level === 0 || ((level + 1) % 5 === 0)
  }

  private spawnTripleBonus(level: number) {
    const centerX = this.levelCenterX(level)
    const x = centerX + Phaser.Math.Between(-120, 160)
    const y = this.groundY - 420
    const bonus = this.matter.add.image(x, y, "bonus_triple", undefined, { isStatic: true, isSensor: true })
    bonus.setScale(0.08).setDepth(-4.7)
    ;(bonus.body as any).isBonusTriple = true

    const amp = 1000
    this.tweens.add({
      targets: [bonus],
      y: y - amp,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
      onUpdate: () => {
        const MatterLib = (Phaser.Physics.Matter as any).Matter
        const Body = MatterLib.Body
        Body.setPosition(bonus.body as any, { x: bonus.x, y: bonus.y })
      }
    })

    this.activeBonuses.push(bonus)
    this.setupArrowTripleBonusCollision(bonus)
  }

  private setupArrowTripleBonusCollision(bonus: Phaser.Physics.Matter.Image) {
    const handler = (event: any) => {
      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair
        let arrowBody: any = null
        let hitBonus = false

        if ((bodyA as any).isArrow && bodyB === bonus.body) { arrowBody = bodyA; hitBonus = true }
        else if ((bodyB as any).isArrow && bodyA === bonus.body) { arrowBody = bodyB; hitBonus = true }

        if (!hitBonus || !arrowBody) continue
        if ((arrowBody as any).owner !== 'player') continue
        if (!(arrowBody as any).isFlying) continue

        ;(arrowBody as any).isFlying = false
        this.tripleShots += 1

        const go = (arrowBody as any).gameObject as Phaser.Physics.Matter.Image
        try { go?.destroy() } catch {}

        this.tweens.add({
          targets: [bonus, (bonus as any).getData && (bonus as any).getData('decor')],
          scaleX: 0.3,
          scaleY: 0.3,
          alpha: 0,
          duration: 200,
          ease: 'Quad.In',
          onComplete: () => {
            try {
              const decor = (bonus as any).getData && (bonus as any).getData('decor')
              this.tweens.killTweensOf([bonus, decor])
              if (decor && decor.destroy) decor.destroy()
              bonus.destroy()
            } catch {}
            this.activeBonuses = this.activeBonuses.filter(b => b !== bonus)
          }
        })
      }
    }
    this.matter.world.on('collisionstart', handler as any)
  }

  private destroyBonuses() {
    for (const b of this.activeBonuses) {
      try {
        const decor = (b as any).getData && (b as any).getData('decor')
        this.tweens.killTweensOf([b, decor])
        if (decor && decor.destroy) decor.destroy()
        b.destroy()
      } catch {}
    }
    this.activeBonuses = []
  }

  // ---------- смерть врага и переход на новый экран ----------
  private killEnemyWithDelay(enemy: EnemyArcher, fadeDelayMs: number) {
    if (enemy.isDying) return
    enemy.isDying = true

    this.tweens.killTweensOf(enemy.rightArm)
    enemy.isPulling = false

    this.tweens.add({ targets: enemy.root, scaleX: 1.08, scaleY: 0.92, duration: 120, yoyo: true, ease: "Quad.Out" })

    this.tweens.add({
      targets: enemy.root,
      alpha: 0,
      delay: fadeDelayMs,
      duration: 300,
      ease: "Quad.In",
      onComplete: () => {
        enemy.root.destroy(true)
        this.matter.world.remove(enemy.bodyPhysics)
        this.enemies = this.enemies.filter(e => e !== enemy)
        if (!this.isGameOver && this.enemies.length === 0 && this.swordsmen.length === 0) this.advanceToNextScreen()
      }
    })
  }

  private killSwordsmanWithDelay(swordsman: EnemySwordsman, fadeDelayMs: number) {
    if (swordsman.isDying) return
    swordsman.isDying = true

    swordsman.isWalking = false

    this.tweens.add({ targets: swordsman.root, scaleX: 1.08, scaleY: 0.92, duration: 120, yoyo: true, ease: "Quad.Out" })

    this.tweens.add({
      targets: swordsman.root,
      alpha: 0,
      delay: fadeDelayMs,
      duration: 300,
      ease: "Quad.In",
      onComplete: () => {
        swordsman.root.destroy(true)
        this.matter.world.remove(swordsman.bodyPhysics)
        this.matter.world.remove(swordsman.swordPhysics)
        this.swordsmen = this.swordsmen.filter(s => s !== swordsman)
        if (!this.isGameOver && this.enemies.length === 0 && this.swordsmen.length === 0) this.advanceToNextScreen()
      }
    })
  }

  // --- багфикс утилиты ---
  private cancelSwordsmanTimers() {
    for (const t of this.swordsmanTimers) { try { t.remove(false) } catch {} }
    this.swordsmanTimers = []
  }

  // безопасный X для спавна мечника
  private getSafeSwordsmanSpawnX(i: number = 0) {
    const cam = this.cameras.main
    const rightOfCamera = cam.scrollX + this.screenW + 120
    const rightOfPlayer = (this.playerRoot?.x ?? 0) + 260 + i * 40
    return Math.max(rightOfCamera, rightOfPlayer)
  }

  private advanceToNextScreen() {
    if (!this.playerRoot) return

    this.cancelSwordsmanTimers()

    this.startRound()
    this.isPlayerMoving = true
    this.currentLevel += 1

    const targetPlayerX = this.levelLeftX(this.currentLevel) + 100

    this.panToLevel(this.currentLevel, 600)

    // очистки прошлого экрана
    this.destroyTowers()
    this.destroyBonuses()

    // новый экран
    this.createSurface(this.levelCenterX(this.currentLevel))
    this.spawnBonesOnSurface()
    this.createBackHouses(this.levelCenterX(this.currentLevel))
    this.createBushes(this.levelCenterX(this.currentLevel))

    // башни и лучники
    this.spawnTwoTowersAndEnemies(this.currentLevel)
    
    // бонус (если подходит)
    if (this.shouldSpawnTriple(this.currentLevel)) this.spawnTripleBonus(this.currentLevel)

    const bob = this.tweens.add({
      targets: this.playerRoot,
      y: this.playerRoot.y - 6,
      duration: 180,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut"
    })

    this.tweens.add({
      targets: this.playerRoot,
      x: targetPlayerX,
      duration: Math.max(500, Math.abs(targetPlayerX - this.playerRoot.x) * 1.2),
      ease: "Quad.Out",
      onUpdate: () => {
        if (this.player && this.player.bodyPhysics) {
          const MatterLib = (Phaser.Physics.Matter as any).Matter
          const Body = MatterLib.Body
          Body.setPosition(this.player.bodyPhysics, { x: this.playerRoot.x, y: this.playerRoot.y })
        }
      },
      onComplete: () => {
        bob.stop();
        this.isPlayerMoving = false
        this.spawnCloudsRightPack()

        // спавним мечников после перемещения
        this.spawnSwordsmen(this.currentLevel)
      }
    })
  }

  private startRound() {
    if (this.playerRoot) this.playerRoot.setPosition(this.playerRoot.x, this.spawnY)
    if (this.playerTopParts) this.playerTopParts.rotation = 0
    if (this.player && this.player.leftArm) this.player.leftArm.x = 0
    this.pullStrength = 0
    this.resetBowstring()
    
    if (this.player && this.player.bodyPhysics) {
      const MatterLib = (Phaser.Physics.Matter as any).Matter
      const Body = MatterLib.Body
      Body.setPosition(this.player.bodyPhysics, { x: this.playerRoot.x, y: this.playerRoot.y })
    }
  }

  private destroyTowers() {
    for (const t of this.towers) {
      try {
        t.images.forEach(img => img.destroy())
        if (t.sensor) this.matter.world.remove(t.sensor)
      } catch {}
    }
    this.towers = []
  }

  // ---------- ДВЕ башни + ДВА врага ----------
  private spawnTwoTowersAndEnemies(level: number) {
    // очистка старых башен и врагов
    this.destroyTowers()
    this.destroyBonuses()
    for (const e of this.enemies) {
      try { e.root.destroy(true); this.matter.world.remove(e.bodyPhysics) } catch {}
    }
    this.enemies = []

    // дальняя башня
    const right = this.levelRightX(level)
    const towerYGround = 1200
    const tower1X = right - 120

    const t1 = this.createTowerAtPosition(tower1X, towerYGround)
    const e1 = this.createEnemyArcher(t1.x, t1.topY)
    this.enemies.push(e1)

    // ближняя башня после 10 уровня
    if (level >= 10) {
      const tower2X = right - 360
      const t2 = this.createTowerAtPosition(tower2X, towerYGround)
      const e2 = this.createEnemyArcher(t2.x, t2.topY)
      this.enemies.push(e2)
    }
  }

  // ---------- мечники ----------
  private spawnSwordsmen(level: number) {
    // очистка старых мечников
    for (const s of this.swordsmen) {
      try { 
        s.root.destroy(true)
        this.matter.world.remove(s.bodyPhysics)
        this.matter.world.remove(s.swordPhysics)
      } catch {}
    }
    this.swordsmen = []

    // отменяем «хвостовые» таймеры
    this.cancelSwordsmanTimers()

    if (this.isPlayerMoving || this.isGameOver) return

    const numSwordsmen = Phaser.Math.Between(1, 3)
    
    for (let i = 0; i < numSwordsmen; i++) {
      const delay = i * Phaser.Math.Between(2000, 4000)
      const timer = this.time.delayedCall(delay, () => {
        if (this.isPlayerMoving || this.isGameOver) return

        const spawnX = this.getSafeSwordsmanSpawnX(i)
        const spawnY = this.spawnY
        
        const swordsman = this.createEnemySwordsman(spawnX, spawnY)
        this.swordsmen.push(swordsman)
        this.attachSwordToLeftHand(swordsman)

        const safeLeft = (this.playerRoot?.x ?? 0) + 240
        if (swordsman.root.x <= safeLeft) {
          const newX = Math.max(this.getSafeSwordsmanSpawnX(i), safeLeft + 40)
          swordsman.root.x = newX

          const MatterLib = (Phaser.Physics.Matter as any).Matter
          const Body = MatterLib.Body
          Body.setPosition(swordsman.bodyPhysics, { x: swordsman.root.x, y: swordsman.root.y - 50 })
          Body.setPosition(swordsman.swordPhysics, { x: swordsman.root.x - 55, y: swordsman.root.y - 65 })
        }
      })
      this.swordsmanTimers.push(timer)
    }
  }

  // ---------- облака пакетом (для совместимости) ----------
  private spawnInitialClouds(_count: number) {}
  private spawnCloudsRightPack() {}

}
