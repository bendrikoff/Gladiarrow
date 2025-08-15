
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

  // AI диапазоны
  private enemyShotCooldownRange = { min: 900, max: 1600 } // мс
  private enemyAimOffsetRangeDeg = { min: -60, max: 10 }   // градусы
  private enemyPullRange = { min: 0.5, max: 3.5 }          // сила (|dx|/20)

  // якоря тетивы врага (лук влево)
  private enemyStringTop    = new Phaser.Math.Vector2(-65, -75)
  private enemyStringBottom = new Phaser.Math.Vector2(-75,  20)

  // --- счёт ---
  private score = 0
  private scoreText!: Phaser.GameObjects.Text

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

  // --- облака ---
  private clouds: Phaser.GameObjects.Image[] = []
  private cloudSpeedPxPerMs = 0.045 // единая скорость для всех

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
    // параллакс-фоны
    this.load.image("backHouses", "assets/backHouses.png")
    this.load.image("bushes", "assets/green.png")
    // облака
    this.load.image("cloud", "assets/cloud.png")
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

    this.addInputHandlers()

    // Удаление стрел, вонзившихся в землю
    this.matter.world.on('collisionstart', (event: any) => {
      for (const pair of event.pairs) {
        const bodyA: any = pair.bodyA
        const bodyB: any = pair.bodyB
        const goA = bodyA?.gameObject
        const goB = bodyB?.gameObject
        if (!goA || !goB) continue

        const isArrowA = goA.texture?.key === 'arrow'
        const isArrowB = goB.texture?.key === 'arrow'
        const isGroundA = goA.texture?.key === 'surface' || goA.getData?.('isGround')
        const isGroundB = goB.texture?.key === 'surface' || goB.getData?.('isGround')

        if (isArrowA && isGroundB) this.stickAndScheduleRemove(goA as Phaser.Physics.Matter.Image)
        if (isArrowB && isGroundA) this.stickAndScheduleRemove(goB as Phaser.Physics.Matter.Image)
      }
    })

    // --- ОБЛАКА при старте сцены: 1–3 слева и 1–3 справа (все за кадром)
    this.spawnCloudBatch("left", Phaser.Math.Between(1, 3))
    this.spawnCloudBatch("right", Phaser.Math.Between(1, 3))
  }

  // GameScene.ts
  createBackground() {
    const { width, height } = this.scale;
    const key = 'bgGradient';

    const tex = this.textures.createCanvas(key, width, height);
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

    // поворот стрел по скорости
    for (const arrow of this.arrows) {
      if (!arrow || !arrow.body || arrow.destroyed) continue
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

    // подчистка стрел
    this.arrows = this.arrows.filter(a => {
      if (!a || !a.body || a.destroyed) return false
      if (a.x < -100 || a.x > this.screenW * 110 || a.y < -200 || a.y > 2200) { a.destroy(); return false }
      return true
    })

    // --- облака: апдейт движения и очистка ---
    this.updateClouds()
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

    const bodyPhysics = this.matter.add.rectangle(x, y, 60, 160, { isStatic: true })
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
    arrow.setBody({ type: "rectangle", width: 40, height: 6 })
    arrow.setMass(1)

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
      // сначала кулдаун, потом выстрел
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

    const velocity = pull * 15
    arrow.setVelocity(Math.cos(armAngle) * velocity, Math.sin(armAngle) * velocity)

    ;(arrow.body as any).isArrow = true
    ;(arrow.body as any).isFlying = true
    ;(arrow.body as any).owner = 'enemy'

    this.arrows.push(arrow)
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
    const Body = Phaser.Physics.Matter.Matter.Body
    const surfaceBody = surface.body as MatterJS.BodyType

    this.matter.world.on("collisionstart", (event: MatterJS.ICollisionStartEvent) => {
      event.pairs.forEach(pair => {
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
    const handler = (event: MatterJS.ICollisionStartEvent) => {
      event.pairs.forEach(pair => {
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
        if (this.enemies.length === 0) this.advanceToNextScreen()
      }
    })
  }

  private advanceToNextScreen() {
    if (!this.playerRoot) return
    this.startRound()
    this.isPlayerMoving = true
    this.currentLevel += 1

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

    // добавляем ещё 1–3 облака (случайная сторона), сразу — даже во время движения
    this.spawnCloudBatch("random", Phaser.Math.Between(1, 3))

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
      onComplete: () => { bob.stop(); this.isPlayerMoving = false }
    })
  }

  private startRound() {
    if (this.playerRoot) this.playerRoot.setPosition(this.playerRoot.x, this.spawnY)
    if (this.playerTopParts) this.playerTopParts.rotation = 0
    if (this.player && this.player.leftArm) this.player.leftArm.x = 0
    this.pullStrength = 0
    this.resetBowstring()
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

    // две башни у правого края экрана, с зазором
    const right = this.levelRightX(level)
    const towerYGround = 1200
    const tower1X = right - 360
    const tower2X = right - 120

    const t1 = this.createTowerAtPosition(tower1X, towerYGround)
    const t2 = this.createTowerAtPosition(tower2X, towerYGround)

    // ставим врагов на крыши
    const e1 = this.createEnemyArcher(t1.x, t1.topY)
    const e2 = this.createEnemyArcher(t2.x, t2.topY)

    this.enemies.push(e1, e2)
  }

  // ===================== ОБЛАКА =====================

  // Пакетный спавн N облаков со стороной
  private spawnCloudBatch(side: "left" | "right" | "random", count: number) {
    for (let i = 0; i < count; i++) {
      const s = side === "random" ? (Math.random() < 0.5 ? "left" : "right") : side
      this.spawnCloud(s)
    }
  }

  // Создание одного облака строго за левым/правым краем
  private spawnCloud(side: "left" | "right") {
    const cam = this.cameras.main

    // случайный масштаб (для разнообразия визуала)
    const scale = Phaser.Math.FloatBetween(0.7, 1.25)

    // реальная ширина для корректного спавна "за кадром"
    const tex = this.textures.get("cloud").getSourceImage() as HTMLImageElement
    const nativeW = tex ? tex.width : 256
    const displayW = nativeW * scale
    const margin = 40
    const extra = Phaser.Math.Between(50, 400) // чуть дальше за краем

    // X строго за пределами видимой области
    const startX = side === "left"
      ? cam.scrollX - (displayW / 2) - margin - extra
      : cam.scrollX + this.scale.width + (displayW / 2) + margin + extra

    // Y случайный в «небе»
    const startY = Phaser.Math.Between(120, 460)

    const cloud = this.add.image(startX, startY, "cloud")
      .setOrigin(0.5, 0.5)
      .setScale(scale)         // ВАЖНО: один раз, без перезаписи 0.2
      .setAlpha(0.9)
      .setDepth(-5.95)         // между градиентом (-6) и домами (-5.9)
      .setScrollFactor(0.45, 0) // лёгкий параллакс

    // единая скорость для всех облаков
    cloud.setData("speed", this.cloudSpeedPxPerMs)

    // лёгкое «дыхание» по Y
    cloud.setData("vyAmp", Phaser.Math.FloatBetween(0, 8))
    cloud.setData("vyFreq", Phaser.Math.FloatBetween(0.001, 0.003))
    cloud.setData("t0", this.time.now)

    this.clouds.push(cloud)
  }

  private updateClouds() {
    if (this.clouds.length === 0) return
    const cam = this.cameras.main
    const rightKillX = cam.scrollX + this.scale.width + 260
    const leftKillX  = cam.scrollX - 260
    const delta = this.game.loop.delta // мс

    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i]
      if (!c.scene) { this.clouds.splice(i, 1); continue }

      // движение всех облаков вправо (единая скорость)
      const vx = (c.getData("speed") as number) || this.cloudSpeedPxPerMs
      c.x += vx * delta

      // лёгкое «дыхание»
      const amp = (c.getData("vyAmp") as number) || 0
      const freq = (c.getData("vyFreq") as number) || 0
      const t0 = (c.getData("t0") as number) || 0
      if (amp > 0 && freq > 0) {
        const t = this.time.now - t0
        c.y += Math.sin(t * freq) * 0.15 * (amp / 8)
      }

      // удаляем далеко за краями
      if (c.x > rightKillX || c.x < leftKillX - 400) {
        c.destroy()
        this.clouds.splice(i, 1)
      }
    }
  }
}
