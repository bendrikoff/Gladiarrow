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

  private towerTopPoint = 0
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

  // --- враг ---
  private enemyRoot!: Phaser.GameObjects.Container
  private enemyTopPivot!: Phaser.GameObjects.Container
  private enemyBaseRightArmX = 0
  private enemyIsPulling = false
  private enemyPullStrength = 0
  private enemyLastShotTime = 0
  private enemyShotCooldown = 2000

  // AI диапазоны
  private enemyShotCooldownRange = { min: 900, max: 1600 } // мс
  private enemyAimOffsetRangeDeg = { min: -60, max: 10 }   // градусы
  private enemyPullRange = { min: 0.5, max: 3.5 }          // сила (|dx|/20)

  // выбранные на текущий выстрел параметры
  private enemyCurrentAimOffset = 0 // радианы
  private enemyCurrentPull = 1.0

  // якоря тетивы врага (лук влево)
  private enemyStringTop    = new Phaser.Math.Vector2(-65, -75)
  private enemyStringBottom = new Phaser.Math.Vector2(-75,  20)

  private enemy!: {
    root: Phaser.GameObjects.Container
    head: Phaser.GameObjects.Image
    body: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
    leftArm: Phaser.GameObjects.Graphics
    rightArm: Phaser.GameObjects.Graphics
    leftLeg: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
    rightLeg: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
    bowstring: Phaser.GameObjects.Graphics
    bodyPhysics: MatterJS.BodyType
    topParts?: Phaser.GameObjects.Container
  }

  private enemyIsDying = false
  private enemyCollisionHandler?: (e: MatterJS.ICollisionStartEvent) => void

  // --- счёт ---
  private score = 0
  private scoreText!: Phaser.GameObjects.Text

  // --- башня (для удаления) ---
  private towerData?: {
    bottom: Phaser.GameObjects.Image
    bodies: Phaser.GameObjects.Image[]
    top: Phaser.GameObjects.Image
    bodyCount: number
    x: number
    y: number
    width: number
    height: number
    topY: number
  }

  // поверхность — будем её «переставлять» на новый экран
  private surface!: Phaser.Physics.Matter.Image

  constructor() { super("GameScene") }

  preload() {
    // игрок
    this.load.image("bow", "assets/player/bow.png")
    this.load.image("arrow", "assets/player/arrow.png")
    this.load.image("head", "assets/player/head.png")
    this.load.image("body", "assets/player/body.png")
    this.load.image("leg", "assets/player/leg.png")
    this.load.image("surface", "assets/surface.png")
    // башня
    this.load.image("towerTop", "assets/towerTop.png")
    this.load.image("towerBody", "assets/towerBody.png")
    this.load.image("towerBottom", "assets/towerBottom.png")
    // враг-лучник
    this.load.image("enemy_head", "assets/enemyBow/head.png")
    this.load.image("enemy_body", "assets/enemyBow/body.png")
    this.load.image("enemy_leg",  "assets/enemyBow/leg.png")
  }

  create() {
    this.screenW = this.scale.width

    // камера: сразу большие границы вправо (на много экранов)
    const worldWidth = this.screenW * 100
    this.cameras.main.setBounds(0, 0, worldWidth, this.scale.height * 2)
    this.cameras.main.setScroll(0, 0) // стартовый экран
    // UI поверх камеры
    this.addScoreUI()

    // поверхность и первый «уровень»
    this.createSurface(this.levelCenterX(this.currentLevel))
    this.createTowerRightCorner(this.currentLevel)
    this.player = this.createStickman(this.spawnX, this.spawnY)
    this.createEnemy()
    this.addInputHandlers()

    // Удаление стрел, вонзившихся в землю, спустя время
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

        // arrow (A) hits ground (B)
        if (isArrowA && isGroundB) {
          this.stickAndScheduleRemove(goA as Phaser.Physics.Matter.Image)
        }
        // arrow (B) hits ground (A)
        if (isArrowB && isGroundA) {
          this.stickAndScheduleRemove(goB as Phaser.Physics.Matter.Image)
        }
      }
    })
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

    // враг — прицел и тайминг
    this.updateEnemyAI()

    // подчистка стрел
    this.arrows = this.arrows.filter(a => {
      if (!a || !a.body || a.destroyed) return false
      if (a.x < -100 || a.x > this.screenW * 110 || a.y < -200 || a.y > 2200) { a.destroy(); return false }
      return true
    })
  }

  // ---------- helpers для уровней/камеры ----------
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
    this.scoreText.setScrollFactor(0) // фиксируем к экрану
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
      // учитываем скролл камеры
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

  // ---------- враг ----------
  private createEnemy(): void {
    // x врага — у правой башни текущего экрана
    const ex = this.towerData ? this.towerData.x - 20 : this.levelRightX(this.currentLevel) - 120
    const ey = this.towerTopPoint || 1000
    this.enemy = this.createEnemyArcher(ex, ey)
    this.enemyRoot = this.enemy.root
    this.setupArrowEnemyCollision(this.enemy.bodyPhysics)
  }

  private createEnemyArcher(x: number, y: number) {
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

    this.enemyTopPivot = this.add.container(50, -30, [topParts])
    const root = this.add.container(x, y, [head, leftLeg, rightLeg, body, this.enemyTopPivot])
    this.enemyRoot = root

    const bodyPhysics = this.matter.add.rectangle(x, y - 50, 60, 160, { isStatic: true })

    this.enemyBaseRightArmX = rightArm.x

    const enemy = {
      root,
      head,
      body: body as any,
      leftArm,
      rightArm,
      leftLeg: leftLeg as any,
      rightLeg: rightLeg as any,
      bowstring,
      bodyPhysics,
      topParts
    }

    this.resetEnemyBowstring()
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

  private updateEnemyBowstring() {
    if (!this.enemy) return
    const r = this.enemy.rightArm
    const midX = r.x + 55 // 30 + 25
    const midY = r.y - 60 + 13 / 2
    const g = this.enemy.bowstring
    g.clear().lineStyle(4, 0xffffff).beginPath()
    g.moveTo(this.enemyStringTop.x, this.enemyStringTop.y)
    g.lineTo(midX, midY)
    g.lineTo(this.enemyStringBottom.x, this.enemyStringBottom.y)
    g.strokePath()
  }

  private resetEnemyBowstring() {
    if (!this.enemy) return
    const g = this.enemy.bowstring
    g.clear().lineStyle(4, 0xffffff).beginPath()
    g.moveTo(this.enemyStringTop.x, this.enemyStringTop.y)
    g.lineTo(this.enemyStringBottom.x, this.enemyStringBottom.y)
    g.strokePath()
  }

  // прицел + запуск натяжения по кулдауну (без дрожи)
  private updateEnemyAI() {
    if (!this.enemy || !this.enemyRoot || !this.playerRoot || this.enemyIsDying) return

    // базовый по вертикали на игрока
    const dy = this.playerRoot.y - this.enemyRoot.y
    const baseAimAngle = Phaser.Math.Clamp(dy * 0.0015, -0.8, 0.8)

    // не рандомим каждый кадр
    this.enemyTopPivot.rotation = -(baseAimAngle + this.enemyCurrentAimOffset)

    const now = Date.now()
    if (!this.enemyIsPulling && now - this.enemyLastShotTime >= this.enemyShotCooldown) {
      this.startEnemyPullSequence()
    }
  }

  private startEnemyPullSequence() {
    if (!this.enemy || this.enemyIsDying) return
    this.enemyIsPulling = true

    // случайные параметры на этот выстрел
    this.enemyCurrentAimOffset = Phaser.Math.DEG_TO_RAD *
      Phaser.Math.FloatBetween(this.enemyAimOffsetRangeDeg.min, this.enemyAimOffsetRangeDeg.max)
    this.enemyCurrentPull = Phaser.Math.FloatBetween(this.enemyPullRange.min, this.enemyPullRange.max)
    this.enemyShotCooldown = Phaser.Math.Between(this.enemyShotCooldownRange.min, this.enemyShotCooldownRange.max)

    // подготовка
    this.tweens.killTweensOf(this.enemy.rightArm)
    const base = this.enemyBaseRightArmX
    this.enemy.rightArm.x = base
    this.resetEnemyBowstring()

    const pullPixels = Phaser.Math.Clamp(this.enemyCurrentPull * 20, 4, 30)

    // 1) натягиваем руку строго назад (влево)
    this.tweens.add({
      targets: this.enemy.rightArm,
      x: base - pullPixels,
      duration: 240 + (pullPixels - 20) * 3,
      ease: "Quad.Out",
      onUpdate: () => {
        this.enemyPullStrength = Math.abs(this.enemy.rightArm.x - base) / 20
        this.updateEnemyBowstring()
      },
      onComplete: () => {
        // 2) выстрел + возврат
        this.enemyShootArrow()
        this.tweens.add({
          targets: this.enemy.rightArm,
          x: base,
          duration: 140,
          ease: "Quad.In",
          onUpdate: () => this.updateEnemyBowstring(),
          onComplete: () => {
            this.enemyIsPulling = false
            this.enemyPullStrength = 0
            this.enemyLastShotTime = Date.now()
            this.resetEnemyBowstring()
          }
        })
      }
    })
  }

  private enemyShootArrow() {
    if (!this.enemy || this.enemyIsDying) return

    const pull = Math.abs(this.enemy.rightArm.x - this.enemyBaseRightArmX) / 20
    if (pull <= 0) return

    const rightArm = this.enemy.rightArm as Phaser.GameObjects.Graphics
    const m = (rightArm as any).getWorldTransformMatrix()

    const localX = 30
    const localY = -60 + 13 / 2

    const spawnX = m.a * localX + m.c * localY + m.tx
    const spawnY = m.b * localX + m.d * localY + m.ty
    const armAngle = Math.atan2(m.b, m.a) + Math.PI // влево

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
    // если поверхность уже есть — просто переносим её (и тело переместится)

    // иначе создаём
    const tex = this.textures.get("surface").getSourceImage() as HTMLImageElement
    const scale = this.screenW / tex.width

    const surf = this.matter.add.image(centerX, this.groundY, "surface", undefined, { isStatic: true })
    surf.setScale(scale)
    surf.setBody({ type: "rectangle", width: tex.width * scale, height: tex.height * scale })
    surf.setStatic(true)
    surf.setDepth(-5)
    this.surface = surf

    // «встревание» стрел в землю
    this.setupArrowSurfaceCollision(surf)
  }

  private stickAndScheduleRemove(arrow: Phaser.Physics.Matter.Image) {
    if (!arrow || !arrow.body || arrow.getData?.('stuck')) return
    arrow.setData?.('stuck', true)
    // Останавливаем и фиксируем стрелу на месте
    arrow.setVelocity(0, 0)
    arrow.setAngularVelocity(0)
    arrow.setStatic(true)
    // Удаляем через 1500 мс
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
          // подчистим из массива
          this.arrows = this.arrows.filter(a => a !== arrow)
        }
      })
    })
  }

  // ---------- башня ----------
  private createTowerRightCorner(level: number) {
    this.destroyTower()

    const scale = 0.6
    const marginRight = 10
    const groundY = 1200

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

    // X башни — у правого края ТЕКУЩЕГО ЭКРАНА
    const x = this.levelRightX(level) - marginRight - maxW / 2
    const towerCenterY = groundY - totalH / 2

    let currentY = groundY

    const bottom = this.add.image(x, currentY - szBottom.h / 2, "towerBottom")
    bottom.setScale(scale)
    currentY -= szBottom.h

    const bodies: Phaser.GameObjects.Image[] = []
    for (let i = 0; i < bodyCount; i++) {
      const b = this.add.image(x, currentY - szBody.h / 2, "towerBody")
      b.setScale(scale)
      bodies.push(b)
      currentY -= szBody.h
    }

    const top = this.add.image(x, currentY - szTop.h / 2, "towerTop")
    top.setScale(scale)

    // сенсор (не мешает стрелам/врагам)
    this.matter.add.rectangle(x, towerCenterY, maxW, totalH, {
      isStatic: true,
      isSensor: true,
      collisionFilter: { category: 0x0002, mask: 0 }
    })

    this.towerTopPoint = top.y - (szTop.h / 2)
    this.towerData = {
      bottom, bodies, top, bodyCount,
      x, y: towerCenterY, width: maxW, height: totalH, topY: this.towerTopPoint
    }
  }

  private destroyTower() {
    if (!this.towerData) return
    this.towerData.bottom.destroy()
    this.towerData.bodies.forEach(b => b.destroy())
    this.towerData.top.destroy()
    this.towerData = undefined
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

  private setupArrowEnemyCollision(enemyBodyRef: MatterJS.BodyType) {
    if (this.enemyCollisionHandler) {
      this.matter.world.off("collisionstart", this.enemyCollisionHandler as any)
      this.enemyCollisionHandler = undefined
    }

    const handler = (event: MatterJS.ICollisionStartEvent) => {
      event.pairs.forEach(pair => {
        let arrowBody: MatterJS.BodyType | null = null
        let hitEnemy = false

        if ((pair.bodyA as any).isArrow && pair.bodyB === enemyBodyRef) {
          arrowBody = pair.bodyA; hitEnemy = true
        } else if ((pair.bodyB as any).isArrow && pair.bodyA === enemyBodyRef) {
          arrowBody = pair.bodyB; hitEnemy = true
        }
        if (!hitEnemy || !arrowBody || !this.enemy || this.enemyIsDying) return
        if ((arrowBody as any).owner !== 'player') return
        if (!(arrowBody as any).isFlying) return

        ;(arrowBody as any).isFlying = false

        // очки
        this.score += 1
        this.scoreText.setText(String(this.score))

        // удалить стрелу
        const arrowGO = (arrowBody as any).gameObject as Phaser.Physics.Matter.Image
        if (arrowGO) {
          this.arrows = this.arrows.filter(a => a !== arrowGO)
          arrowGO.destroy()
        }

        // смерть врага и переход
        this.killEnemyWithDelay(350)
      })
    }

    this.enemyCollisionHandler = handler
    this.matter.world.on("collisionstart", handler as any)
  }

  // ---------- смерть врага и переход на новый экран ----------
  private killEnemyWithDelay(fadeDelayMs: number) {
    if (!this.enemy || this.enemyIsDying) return
    this.enemyIsDying = true

    this.tweens.killTweensOf(this.enemy.rightArm)
    this.enemyIsPulling = false

    const root = this.enemy.root

    this.tweens.add({
      targets: root,
      scaleX: 1.08,
      scaleY: 0.92,
      duration: 120,
      yoyo: true,
      ease: "Quad.Out"
    })

    this.tweens.add({
      targets: root,
      alpha: 0,
      delay: fadeDelayMs,
      duration: 300,
      ease: "Quad.In",
      onComplete: () => {
        root.destroy(true)
        if (this.enemy?.bodyPhysics) this.matter.world.remove(this.enemy.bodyPhysics)
        this.enemy = undefined as any
        this.enemyRoot = undefined as any
        this.enemyIsDying = false

        // Переход на следующий экран
        this.advanceToNextScreen()
      }
    })
  }

  private advanceToNextScreen() {
    if (!this.playerRoot) return
    this.startRound();
    this.isPlayerMoving = true
    this.currentLevel += 1

    // целевая позиция игрока — левый край нового экрана (например, +200px)
    const targetPlayerX = this.levelLeftX(this.currentLevel) + 100

    // камера плавно панит на центр нового экрана
    this.panToLevel(this.currentLevel, 600)

    this.createSurface(this.levelCenterX(this.currentLevel))
    // спавним новую башню и врага под новый экран
    this.createTowerRightCorner(this.currentLevel)
    this.createEnemy()

    // легкая «анимация шага»
    const bob = this.tweens.add({
      targets: this.playerRoot,
      y: this.playerRoot.y - 6,
      duration: 180,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut"
    })

    // сам игрок едет вправо на новый экран
    this.tweens.add({
      targets: this.playerRoot,
      x: targetPlayerX,
      duration: Math.max(500, Math.abs(targetPlayerX - this.playerRoot.x) * 1.2),
      ease: "Quad.Out",
      onComplete: () => {
        bob.stop()
        // снова можно стрелять
        this.isPlayerMoving = false
      }
    })
  }

  private startRound() {
    // Сброс позиции игрока
    if (this.playerRoot) {
      this.playerRoot.setPosition(this.playerRoot.x, this.spawnY)
    }
    // Сброс ориентации верхней части
    if (this.playerTopParts) {
      this.playerTopParts.rotation = 0
    }
    // Рука и натяжение
    if (this.player && this.player.leftArm) {
      this.player.leftArm.x = 0
    }
    this.pullStrength = 0
    this.resetBowstring()
  }

  // ---------- генерация башен с врагами ----------
  private generateTowersWithEnemies(): void {
    const numTowers = Phaser.Math.Between(1, 3)
    const screenW = this.scale.width
    const towerSpacing = screenW / (numTowers + 1) // Равномерно распределяем башни
    
    for (let i = 0; i < numTowers; i++) {
      const towerX = towerSpacing * (i + 1)
      const towerY = 1000
      
      // Создаём башню
      this.createTowerAtPosition(towerX, towerY)
      
      // Создаём врага на башне
      const enemyX = towerX
      const enemyY = towerY - 200 // Враг выше башни
      this.createEnemyOnTower(enemyX, enemyY)
    }
  }

  private createEnemyOnTower(x: number, y: number): void {
    // Создаём врага-лучника на башне
    const enemy = this.createEnemyArcher(x, y)
    
    // Делаем врага статичным (стоит на башне)
    if (enemy.bodyPhysics) {
      enemy.bodyPhysics.isStatic = true
    }
    
    // Лук уже есть у врага (создаётся в createEnemyArcher)
    
    // Сохраняем врага для дальнейшего использования
    if (!this.towerEnemies) this.towerEnemies = []
    this.towerEnemies.push({
      stickman: enemy,
      bow: enemy.topParts, // У врага уже есть лук в topParts
      position: { x, y }
    })
  }

  private createTowerAtPosition(x: number, y: number): void {
    // Создаём башню в указанной позиции
    const towerTop = this.matter.add.image(x, y - 100, "towerTop", undefined, { isStatic: true })
    towerTop.setScale(0.8)
    
    const towerBody = this.matter.add.image(x, y, "towerBody", undefined, { isStatic: true })
    towerBody.setScale(0.8)
    
    const towerBottom = this.matter.add.image(x, y + 100, "towerBottom", undefined, { isStatic: true })
    towerBottom.setScale(0.8)
    
    // Добавляем в массив для отслеживания
    if (!this.towerParts) this.towerParts = []
    this.towerParts.push(towerTop, towerBody, towerBottom)
  }
}
