// --- враги (мульти) ---
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

  private enemies: EnemyArcher[] = []
  private swordsmen: EnemySwordsman[] = []

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

  // коллекция сгенерированных башен для очистки между экранами
  private towers: { images: Phaser.GameObjects.Image[]; sensor: MatterJS.BodyType; x: number; topY: number }[] = []

  // параллакс-дома
  private backHousesLayers: Phaser.GameObjects.Image[] = []
  private backParallaxFactor = 0.6

  // параллакс-кусты
  private bushesLayers: Phaser.GameObjects.Image[] = []
  private bushesParallaxFactor = 1

  constructor() { super("GameScene") }

  preload() {
    this.load.image("bow", "assets/player/bow.png")
    this.load.image("arrow", "assets/player/arrow.png")
    this.load.image("head", "assets/player/head.png")
    this.load.image("body", "assets/player/body.png")
    this.load.image("leg", "assets/player/leg.png")
    this.load.image("surface", "assets/surface.png")
    // башни
    this.load.image("towerTop", "assets/towerTop.png")
    this.load.image("towerBody", "assets/towerBody.png")
    this.load.image("towerBottom", "assets/towerBottom.png")
    // враг-лучник
    this.load.image("enemy_head", "assets/enemyBow/head.png")
    this.load.image("enemy_body", "assets/enemyBow/body.png")
    this.load.image("enemy_leg",  "assets/enemyBow/leg.png")
    // мечник
    this.load.image("sword", "assets/player/sword.png")
    // сердце для здоровья
    this.load.image("heart", "assets/heart.png")
    // параллакс-фоны
    this.load.image("backHouses", "assets/backHouses.png")
    this.load.image("bushes", "assets/green.png")
  }

  create() {
    this.createBackground();
    this.screenW = this.scale.width

    // камера: большие границы вправо
    const worldWidth = this.screenW * 100
    this.cameras.main.setBounds(0, 0, worldWidth, this.scale.height * 2)
    this.cameras.main.setScroll(0, 0)

    // UI
    this.addScoreUI()

    // поверхность и параллакс-фоны первого экрана
    this.createSurface(this.levelCenterX(this.currentLevel))
    this.createBackHouses(this.levelCenterX(this.currentLevel))
    this.createBushes(this.levelCenterX(this.currentLevel))

    // игрок
    this.player = this.createStickman(this.spawnX, this.spawnY)

    // две башни и два врага
    this.spawnTwoTowersAndEnemies(this.currentLevel)
    
    // мечники
    this.spawnSwordsmen(this.currentLevel)

    this.addInputHandlers()

    // Удаление стрел, вонзившихся в землю
    this.matter.world.on('collisionstart', (event: any) => {
      for (const pair of event.pairs) {
        
        const bodyA: any = pair.bodyA
        const bodyB: any = pair.bodyB
        const goA = bodyA?.gameObject
        const goB = bodyB?.gameObject
    
        console.log("Collision:", {
          goA: goA?.texture?.key,
          goB: goB?.texture?.key,
          ownerA: bodyA?.owner,
          ownerB: bodyB?.owner,
        })

        // --- 1. Стрелы врагов попадают в игрока ---
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
    
        // --- 2. Все остальные случаи требуют обоих gameObject ---
        if (!goA || !goB) continue
    
        const isArrowPlayerA = goA.texture?.key === 'arrow' && bodyA?.owner === 'player'
        const isArrowPlayerB = goB.texture?.key === 'arrow' && bodyB?.owner === 'player'
        const isGroundA = goA.texture?.key === 'surface' || goA.getData?.('isGround')
        const isGroundB = goB.texture?.key === 'surface' || goB.getData?.('isGround')
    
        // --- 3. Стрелы игрока в землю ---
        if (isArrowPlayerA && isGroundB) this.stickAndScheduleRemove(goA as Phaser.Physics.Matter.Image)
        if (isArrowPlayerB && isGroundA) this.stickAndScheduleRemove(goB as Phaser.Physics.Matter.Image)
    
        // --- 4. Стрелы игрока попадают во врагов (лучников) ---
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
    
  }

  // GameScene.ts
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
    if (!this.player) return

    // Синхронизируем физическое тело игрока с визуальным объектом
    if (this.player.bodyPhysics && this.playerRoot) {
      const MatterLib = (Phaser.Physics.Matter as any).Matter
      const Body = MatterLib.Body
      Body.setPosition(this.player.bodyPhysics, { 
        x: this.playerRoot.x, 
        y: this.playerRoot.y 
      })
    }

    // поворот стрел по скорости
    for (const arrow of this.arrows) {
      if (!arrow || !arrow.body || !arrow.scene) continue
      const body = arrow.body as MatterJS.BodyType
      if (body?.velocity) {
        const { x: vx, y: vy } = body.velocity
        if (vx || vy) arrow.rotation = Math.atan2(vy, vx)
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

    // враги — прицел и тайминг
    this.updateEnemiesAI()
    
    // мечники — движение
    this.updateSwordsmenAI()

    // подчистка стрел
    this.arrows = this.arrows.filter(a => {
      if (!a || !a.body || !a.scene) return false
      if (a.x < -100 || a.x > this.screenW * 110 || a.y < -200 || a.y > 2200) { a.destroy(); return false }
      return true
    })
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

    // Добавляем сердца здоровья
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
    this.currentHealth = Math.max(0, this.currentHealth - amount)
    this.updateHealthUI()
    
    if (this.currentHealth <= 0) {
      this.gameOver()
    }
  }

  private heal(amount: number = 1) {
    this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount)
    this.updateHealthUI()
  }

  private updateHealthUI() {
    for (let i = 0; i < this.hearts.length; i++) {
      if (i < this.currentHealth) {
        this.hearts[i].setVisible(true)
      } else {
        this.hearts[i].setVisible(false)
      }
    }
  }

  private gameOver() {
    // Останавливаем игру
    this.scene.pause()
    
    // Показываем сообщение о конце игры
    this.add.text(this.scale.width / 2, this.scale.height / 2, "GAME OVER", {
      fontFamily: "Arial",
      fontSize: "64px",
      color: "#ff0000",
      stroke: "#000000",
      strokeThickness: 8
    }).setOrigin(0.5).setDepth(1001).setScrollFactor(0)
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

    // пивот верха
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

    const bodyPhysics = this.matter.add.rectangle(x, y, 60, 160, { 
      isStatic: true
    })
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

  private shootArrow() {
    if (this.isPlayerMoving) return
    if (this.pullStrength === 0) return
    const now = Date.now()
    if (now - this.lastShotTime < this.shotCooldown) return
    this.lastShotTime = now

    const rightArm = this.player.rightArm as Phaser.GameObjects.Graphics
    const m = (rightArm as any).getWorldTransformMatrix()
    const localX = 80 // 30 + 50
    const localY = -60 + 13 / 2

    const spawnX = m.a * localX + m.c * localY + m.tx
    const spawnY = m.b * localX + m.d * localY + m.ty
    const armAngle = Math.atan2(m.b, m.a)

    const arrow = this.matter.add.image(spawnX, spawnY, "arrow")
    arrow.setScale(0.1).setRotation(armAngle)
    arrow.setBody({ 
      type: "rectangle", 
      width: 40, 
      height: 6
    })
    arrow.setMass(1)
    
    // Настраиваем категории коллизий через Matter.js API
    const MatterLib = (Phaser.Physics.Matter as any).Matter
    const Body = MatterLib.Body
    Body.set(arrow.body, 'collisionFilter', { category: 0x0002, mask: 0x0001 })

    const v = this.pullStrength * 15
    arrow.setVelocity(Math.cos(armAngle) * v, Math.sin(armAngle) * v)

    ;(arrow.body as any).isArrow = true
    ;(arrow.body as any).isFlying = true
    ;(arrow.body as any).owner = 'player'

    this.arrows.push(arrow)
  }

  private addInputHandlers() {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.isPlayerMoving) return
      this.isPulling = true
      this.pullStartX = p.x + this.cameras.main.scrollX
      this.pullStartY = p.y
      this.pullStrength = 0
    })

    this.input.on("pointerup", () => {
      if (this.isPlayerMoving) return
      this.shootArrow()
      this.isPulling = false
      this.player.leftArm.x = 0
      this.pullStrength = 0
      this.resetBowstring()
    })

    this.input.manager.canvas.addEventListener("mouseleave", () => {
      if (this.isPlayerMoving) return
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
    arrow.setBody({ 
      type: "rectangle", 
      width: 40, 
      height: 6
    })
    arrow.setMass(1)
  
    // ✅ Правильная настройка коллизий
    arrow.setCollisionCategory(0x0002) // враг
    arrow.setCollidesWith(0x0001)      // игрок
  
    // ✅ Метки
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
    // Меч (начальная поза не важна — приклеим в апдейте)
    const sword = this.add.image(-55, -65, "sword")
    sword.setScale(0.15)

    // ПРАВАЯ рука держит рукоять меча (горизонтально)
    const rightArm = this.add.graphics()
    rightArm.fillStyle(0x613e26, 1).fillRoundedRect(-60, -35, 50, 13, 5)
    rightArm.rotation = Math.PI / 2

    // ЛЕВАЯ рука поддерживает меч (вертикально у тела)
    const leftArm = this.add.graphics()
    leftArm.fillStyle(0x613e26, 1).fillRoundedRect(-50, -45, 50, 13, 5)
    leftArm.rotation = 0

    const head = this.add.image(0, -90, "enemy_head").setDisplaySize(100, 100)
    const body = this.add.image(5, -30, "enemy_body").setDisplaySize(60, 60)
    const leftLeg = this.add.image(-10, 5, "enemy_leg").setDisplaySize(20, 20)
    const rightLeg = this.add.image(20, 5, "enemy_leg").setDisplaySize(20, 20)

    const root = this.add.container(x, y, [head, leftLeg, rightLeg, body, leftArm, rightArm, sword])

    // статические физтела
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
  
    // точка хвата на руке (подгони под прямоугольник руки)
    const gripLX = -45
    const gripLY = -65
  
    // мировые координаты хвата
    const worldX = mArm.a * gripLX + mArm.c * gripLY + mArm.tx
    const worldY = mArm.b * gripLX + mArm.d * gripLY + mArm.ty
  
    // локальные координаты внутри root — для спрайта меча
    const root = s.root as any
    const mRoot = root.getWorldTransformMatrix()
    const local = new Phaser.Math.Vector2()
    mRoot.applyInverse(worldX, worldY, local)
  
    // угол руки в мире
    const armAngle = Math.atan2(mArm.b, mArm.a)
    const SWORD_ROT_OFFSET = 0
  
    // визуал
    s.sword.x = local.x
    s.sword.y = local.y
    s.sword.rotation = armAngle + SWORD_ROT_OFFSET
  
    // физика
    const MatterLib = (Phaser.Physics.Matter as any).Matter
    const Body = MatterLib.Body
    Body.setPosition(s.swordPhysics, { x: worldX, y: worldY })
    Body.setAngle(s.swordPhysics, s.sword.rotation)
  }
  
  private updateSwordsmenAI() {
    if (!this.playerRoot) return
  
    const delta = this.game.loop.delta
    const now = Date.now()
  
    for (let i = this.swordsmen.length - 1; i >= 0; i--) {
      const s = this.swordsmen[i]
      if (s.isDying) continue
  
      const distanceToPlayer = Math.abs(s.root.x - this.playerRoot.x)
  
            if (!s.isAttacking && distanceToPlayer <= s.attackRange && now - s.lastAttackTime > s.attackCooldown) {
        this.playSwordsmanAttack(s)
      } else if (!s.isAttacking && distanceToPlayer > s.attackRange) {
        // идём только если игрок далеко
        s.isWalking = true
        const moveSpeed = s.walkSpeed * delta * 0.1
        s.root.x -= moveSpeed

        // синк физтела
        const MatterLib = (Phaser.Physics.Matter as any).Matter
        const Body = MatterLib.Body
        Body.setPosition(s.bodyPhysics, { x: s.root.x, y: s.root.y - 50 })

        // походка
        this.animateSwordsmanWalking(s, delta)  
        // вышел за экран — удалить
        if (s.root.x < this.cameras.main.scrollX - 200) {
          s.root.destroy(true)
          this.matter.world.remove(s.bodyPhysics)
          this.matter.world.remove(s.swordPhysics)
          this.swordsmen.splice(i, 1)
          continue
        }
      } else if (s.isAttacking) {
        // в фазе атаки стоим
        s.isWalking = false
      } else if (distanceToPlayer <= s.attackRange) {
        // в диапазоне атаки, но не атакуем (кулдаун) - стоим на месте
        s.isWalking = false
      }
  
      // меч всегда приклеен к ЛЕВОЙ руке
      this.attachSwordToLeftHand(s)
    }
  }
  
  private playSwordsmanAttack(s: EnemySwordsman) {
    s.isAttacking = true
    s.isWalking = false
    s.lastAttackTime = Date.now()
  
    const ATTACK_WINDUP = 300   // замах
    const ATTACK_DURATION = 200 // активная фаза (урон)
    const ATTACK_RECOVER = 400  // восстановление
  
    // 1. Замах левой рукой (с мечом)
    this.tweens.add({
      targets: s.leftArm,
      rotation: -0.8, // назад
      duration: ATTACK_WINDUP,
      ease: 'Quad.Out',
      onComplete: () => {
        // 2. Активация удара
        s.isAttacking = true
  
        this.tweens.add({
          targets: s.leftArm,
          rotation: 0.5, // вперёд
          duration: ATTACK_DURATION,
          ease: 'Quad.In',
          onComplete: () => {
            this.takeDamage(1)
            // 3. Восстановление и возврат в исходную
            s.isAttacking = false
            this.tweens.add({
              targets: s.leftArm,
              rotation: 0, // нейтраль
              duration: ATTACK_RECOVER,
              ease: 'Quad.Out',
              onComplete: () => {
              // После атаки проверяем, нужно ли идти или остаться на месте
              const distanceToPlayer = Math.abs(s.root.x - this.playerRoot.x)
              if (distanceToPlayer > s.attackRange) {
                // Игрок далеко - можно идти
                s.isWalking = true
              } else {
                // Игрок всё ещё близко - остаёмся на месте
                s.isWalking = false
              }
            }
            })
          }
        })
      }
    })
  }
  
  private animateSwordsmanWalking(s: EnemySwordsman, _delta: number) {
    if (!s.isWalking) {
      // если не идём - возвращаем ноги в нейтральное положение
      s.leftLeg.rotation = 0
      s.rightLeg.rotation = 0
      return
    }
    
    const t = this.time.now * 0.005
    s.leftLeg.rotation = Math.sin(t) * 0.3
    s.rightLeg.rotation = Math.sin(t + Math.PI) * 0.3
    
    // ПРАВАЯ рука (держит меч) — почти фикс, лёгкое покачивание
    const rightArmT = t * 1.2
    s.rightArm.rotation = Math.PI / 2 + Math.sin(rightArmT) * 0.07
    
    // ЛЕВАЯ рука — свободнее качается
    const leftArmT = t * 1.6
    s.leftArm.rotation = 0 + Math.sin(leftArmT) * 0.12

    // меч не трогаем — он приклеен к правой руке в attachSwordToRightHand()
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

  // ---------- задний план (параллакс) ----------
  private createBackHouses(centerX: number) {
    const tex = this.textures.get("backHouses");
    if (!tex || !tex.getSourceImage()) {
      console.warn("[backHouses] texture missing or not loaded");
      return;
    }
    const img = tex.getSourceImage() as HTMLImageElement;

    const scale = (this.screenW * 1.8) / img.width; // шире экрана
    const y = this.groundY+100; // нижний край почти у земли

    const layer = this.add.image(centerX, y, "backHouses")
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setDepth(-5.9)                 // перед градиентом (-6), позади кустов/земли
      .setScrollFactor(this.backParallaxFactor, 0); // параллакс только по X

    this.backHousesLayers.push(layer);
  }

  private createBushes(centerX: number) {
    const tex = this.textures.get("bushes");
    if (!tex || !tex.getSourceImage()) {
      console.warn("[bushes] texture missing or not loaded");
      return;
    }
    const img = tex.getSourceImage() as HTMLImageElement;

    const scale = (this.screenW * 1.2) / img.width; // немного шире домов
    const y = this.groundY - 70;                      // чуть выше земли

    const layer = this.add.image(centerX, y, "bushes")
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setDepth(-5.6)                 // между домами (-5.9) и surface (-5)
      .setScrollFactor(this.bushesParallaxFactor, 0);

    this.bushesLayers.push(layer);
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

  // ---------- простая башня (процедурная) ----------
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

    const bottom = this.add.image(x, currentY - szBottom.h / 2, "towerBottom")
    bottom.setScale(scale)
    images.push(bottom)
    currentY -= szBottom.h

    for (let i = 0; i < bodyCount; i++) {
      const b = this.add.image(x, currentY - szBody.h / 2, "towerBody")
      b.setScale(scale)
      images.push(b)
      currentY -= szBody.h
    }

    const top = this.add.image(x, currentY - szTop.h / 2, "towerTop")
    top.setScale(scale)
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
        if (pair.bodyA === surfaceBody && (pair.bodyB as any).isArrow) {
          arrowBody = pair.bodyB
        } else if (pair.bodyB === surfaceBody && (pair.bodyA as any).isArrow) {
          arrowBody = pair.bodyA
        }
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
        if ((pair.bodyA as any).isArrow && pair.bodyB === enemy.bodyPhysics) {
          arrowBody = pair.bodyA; hitEnemy = true
        } else if ((pair.bodyB as any).isArrow && pair.bodyA === enemy.bodyPhysics) {
          arrowBody = pair.bodyB; hitEnemy = true
        }
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
        if ((pair.bodyA as any).isArrow && pair.bodyB === swordsman.bodyPhysics) {
          arrowBody = pair.bodyA; hitSwordsman = true
        } else if ((pair.bodyB as any).isArrow && pair.bodyA === swordsman.bodyPhysics) {
          arrowBody = pair.bodyB; hitSwordsman = true
        }
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
        if (this.enemies.length === 0 && this.swordsmen.length === 0) this.advanceToNextScreen()
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
        if (this.enemies.length === 0 && this.swordsmen.length === 0) this.advanceToNextScreen()
      }
    })
  }

  private advanceToNextScreen() {
    if (!this.playerRoot) return
    this.startRound()
    this.isPlayerMoving = true
    this.currentLevel += 1

    // Восстанавливаем здоровье при переходе на новый уровень
    this.heal(this.maxHealth)

    const targetPlayerX = this.levelLeftX(this.currentLevel) + 100

    this.panToLevel(this.currentLevel, 600)

    // пересоздаём основу уровня
    this.createSurface(this.levelCenterX(this.currentLevel))

    // пересоздаём параллакс-слои (очистка + создание)
    this.createBackHouses(this.levelCenterX(this.currentLevel))
    this.createBushes(this.levelCenterX(this.currentLevel))

    // очистить башни прошлого экрана
    this.destroyTowers()

    // СПАВН: две башни и два врага на новом экране
    this.spawnTwoTowersAndEnemies(this.currentLevel)
    
    // СПАВН: мечники справа
    this.spawnSwordsmen(this.currentLevel)

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
        // Синхронизируем физическое тело игрока с визуальным объектом
        if (this.player && this.player.bodyPhysics) {
          const MatterLib = (Phaser.Physics.Matter as any).Matter
          const Body = MatterLib.Body
          Body.setPosition(this.player.bodyPhysics, { 
            x: this.playerRoot.x, 
            y: this.playerRoot.y 
          })
        }
      },
      onComplete: () => { bob.stop(); this.isPlayerMoving = false }
    })
  }

  private startRound() {
    if (this.playerRoot) this.playerRoot.setPosition(this.playerRoot.x, this.spawnY)
    if (this.playerTopParts) this.playerTopParts.rotation = 0
    if (this.player && this.player.leftArm) this.player.leftArm.x = 0
    this.pullStrength = 0
    this.resetBowstring()
    
    // Синхронизируем физическое тело игрока
    if (this.player && this.player.bodyPhysics) {
      const MatterLib = (Phaser.Physics.Matter as any).Matter
      const Body = MatterLib.Body
      Body.setPosition(this.player.bodyPhysics, { 
        x: this.playerRoot.x, 
        y: this.playerRoot.y 
      })
    }
  }

  // очистка всех сгенерированных башен
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
    for (const e of this.enemies) {
      try { e.root.destroy(true); this.matter.world.remove(e.bodyPhysics) } catch {}
    }
    this.enemies = []

    // первая башня всегда создается (дальняя)
    const right = this.levelRightX(level)
    const towerYGround = 1200
    const tower1X = right - 120

    const t1 = this.createTowerAtPosition(tower1X, towerYGround)

    // ставим первого врага на крышу
    const e1 = this.createEnemyArcher(t1.x, t1.topY)
    this.enemies.push(e1)

    // Вторая башня и второй лучник появляются только после 10 уровня (ближняя)
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

    // спавним 1-3 мечников справа за экраном
    const numSwordsmen = Phaser.Math.Between(1, 3)
    const right = this.levelRightX(level)
    
    for (let i = 0; i < numSwordsmen; i++) {
      const spawnX = right + 100 + (i * Phaser.Math.Between(50, 150))
      const spawnY = this.spawnY
      
      // Задержка спавна для разнообразия
      this.time.delayedCall(i * Phaser.Math.Between(2000, 4000), () => {
        const swordsman = this.createEnemySwordsman(spawnX, spawnY)
        this.swordsmen.push(swordsman)
        // сразу уложим меч в ладонь правой руки
        this.attachSwordToLeftHand(swordsman)
      })
    }
  }

}
