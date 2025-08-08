export class GameScene extends Phaser.Scene {
  private isPulling = false
  private pullStartX = 0
  private pullStartY = 0
  private pullStrength = 0
  private lastShotTime = 0
  private shotCooldown = 500

  private playerRoot!: Phaser.GameObjects.Container
  private playerTopParts!: Phaser.GameObjects.Container
  private playerTopPivot!: Phaser.GameObjects.Container

  private player!: {
    root: Phaser.GameObjects.Container
    head: Phaser.GameObjects.Image
    body: Phaser.GameObjects.Graphics
    leftArm: Phaser.GameObjects.Graphics
    rightArm: Phaser.GameObjects.Graphics
    leftLeg: Phaser.GameObjects.Graphics
    rightLeg: Phaser.GameObjects.Graphics
    bowstring: Phaser.GameObjects.Graphics
    bodyPhysics: MatterJS.BodyType
  }

  private arrows: Phaser.Physics.Matter.Image[] = []

  private enemyRoot!: Phaser.GameObjects.Container
  private enemy!: {
    root: Phaser.GameObjects.Container
    head: Phaser.GameObjects.Arc
    body: Phaser.GameObjects.Graphics
    leftArm: Phaser.GameObjects.Graphics
    rightArm: Phaser.GameObjects.Graphics
    leftLeg: Phaser.GameObjects.Graphics
    rightLeg: Phaser.GameObjects.Graphics
    bowstring: Phaser.GameObjects.Graphics
    bodyPhysics: MatterJS.BodyType
  }

  constructor() {
    super("GameScene")
  }

  preload() {
    this.load.image("bow", "assets/bow.png")
    this.load.image("arrow", "assets/arrow.png")
    this.load.image("head", "assets/head.png")
    this.load.image("body", "assets/body.png")
    this.load.image("leg", "assets/leg.png")
  }

  create() {
    this.addPlatforms()
    this.createEnemy()
    this.player = this.createStickman(200, 1100);
    this.addInputHandlers()    
  }

  update() {
    if (!this.player) return

    for (const arrow of this.arrows) {
      const body = arrow.body as MatterJS.BodyType
      if (body && body.velocity) {
        const vx = body.velocity.x
        const vy = body.velocity.y
        if (vx !== 0 || vy !== 0) {
          arrow.rotation = Math.atan2(vy, vx)
        }
      }
    }

    if (this.isPulling && this.player.leftArm) {
      const pointer = this.input.activePointer
      const dx = pointer.x - this.pullStartX
      const armOffset = Phaser.Math.Clamp(dx * 0.1, -30, 0)
      this.player.leftArm.x = armOffset

      const dy = pointer.y - this.pullStartY
      const angle = Phaser.Math.Clamp(dy * 0.0015, -0.8, 0.8)
      this.playerTopPivot.rotation = -angle

      this.pullStrength = Math.abs(armOffset) / 20
    }

    if (this.isPulling) {
      this.updateBowstring();
    }
  }

  private addPlatforms(): void {
    this.matter.add.rectangle(150, 400, 100, 20, { isStatic: true })
    this.matter.add.rectangle(650, 400, 100, 20, { isStatic: true })
  }

  private createEnemy(): void {
    this.enemy = this.createStickman(800, 800)
    this.enemyRoot = this.enemy.root
  }

  private createStickman(x: number, y: number) {
    const head = this.add.image(0, -95, "head")
    head.setDisplaySize(100, 100)

    const leftArm = this.add.graphics()
    leftArm.fillStyle(0xffd49c, 1)
    leftArm.fillRoundedRect(-10, -60, 50, 13, 5)
    leftArm.rotation = -0.1

    const rightArm = this.add.graphics()
    rightArm.fillStyle(0xffd49c, 1)
    rightArm.fillRoundedRect(30, -60, 50, 13, 5)

    const bowImage = this.add.image(50, -50, "bow")
    bowImage.setScale(0.13)
    bowImage.rotation = -75

    const bowstring = this.createBowstring()

    const topParts = this.add.container(0, 0, [
      leftArm,
      rightArm,
      bowImage,
      bowstring,
    ])
    this.playerTopParts = topParts

    const body = this.add.image(0, -30, "body");
    body.setDisplaySize(60, 60);

    const leftLeg = this.add.image(-10, 5, "leg")
    leftLeg.setDisplaySize(20, 20)

    const rightLeg = this.add.image(20, 5, "leg")
    rightLeg.setDisplaySize(20, 20)

    // Wrap topParts with a pivot container so we can define a custom rotation center
    this.playerTopPivot = this.add.container(-50, 0, [topParts])

    // Create root first so bounds are in place
    const root = this.add.container(x, y, [
      head,
      leftLeg,
      rightLeg,
      body,
      this.playerTopPivot,
    ])
    this.playerRoot = root

    // Compute geometric center of topParts and re-center under pivot (0,0)
    const b = topParts.getBounds()
    const centerLocalX = b.centerX - root.x
    const centerLocalY = b.centerY - root.y
    this.playerTopPivot.setPosition(centerLocalX, centerLocalY)
    topParts.x = -centerLocalX
    topParts.y = -centerLocalY

    const bodyPhysics = this.matter.add.rectangle(x, y, 60, 160, {
      isStatic: true,
    })

    return {
      root,
      head,
      body,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      bowstring,
      bodyPhysics,
    }
  }


  private createBowstring(): Phaser.GameObjects.Graphics {
    const bowstring = this.add.graphics()
    bowstring.lineStyle(4, 0xffffff)
    bowstring.beginPath()
    bowstring.moveTo(40, -100)
    bowstring.lineTo(50, 0)
    bowstring.strokePath()
    return bowstring
  }

  private updateBowstring() {
    const bowstring = this.player.bowstring
    const leftArm = this.player.leftArm

    bowstring.clear()
    bowstring.lineStyle(4, 0xffffff)
    bowstring.beginPath()
    bowstring.moveTo(40, -100)
    bowstring.lineTo(leftArm.x + 40, leftArm.y - 60)
    bowstring.lineTo(50, 0)
    bowstring.strokePath()
  }

  private resetBowstring() {
    const bowstring = this.player.bowstring
    bowstring.clear()
    bowstring.lineStyle(4, 0xffffff)
    bowstring.beginPath()
    bowstring.moveTo(40, -100)
    bowstring.lineTo(50, 0)
    bowstring.strokePath()
  }

  private shootArrow() {
    if (this.pullStrength === 0) return
    const currentTime = Date.now()
    if (currentTime - this.lastShotTime < this.shotCooldown) return
    this.lastShotTime = currentTime

    const bowImage = this.playerTopParts.getAt(3) as Phaser.GameObjects.Image
    const bowWorld = bowImage.getWorldTransformMatrix()

    // Мировая позиция и угол лука
    const bowX = bowWorld.tx
    const bowY = bowWorld.ty - 50;
    const bowAngle = Math.atan2(bowWorld.b, bowWorld.a)

    // Смещение точки вылета вдоль направления лука (чуть вперёд от центра)
    const muzzleOffset = 10
    const arrowX = bowX + Math.cos(bowAngle) * muzzleOffset
    const arrowY = bowY + Math.sin(bowAngle) * muzzleOffset

    const arrow = this.matter.add.image(arrowX, arrowY, "arrow")
    arrow.setScale(0.1)
    arrow.setRotation(bowAngle)
    arrow.setBody({ type: 'rectangle', width: 40, height: 6 })
    arrow.setMass(1)

    const velocity = this.pullStrength * 15
    const vx = Math.cos(bowAngle) * velocity
    const vy = Math.sin(bowAngle) * velocity
    arrow.setVelocity(vx, vy)

    this.arrows.push(arrow)

    this.arrows = this.arrows.filter(arrow => {
      if (arrow.x < -100 || arrow.x > 2000 || arrow.y < -100 || arrow.y > 2000) {
        arrow.destroy()
        return false
      }
      return true
    })
  }

  private addInputHandlers() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.isPulling = true
      this.pullStartX = pointer.x
      this.pullStartY = pointer.y
      this.pullStrength = 0
    })

    this.input.on("pointerup", () => {
      this.shootArrow()
      this.isPulling = false
      this.player.leftArm.x = 0
      this.pullStrength = 0
      this.resetBowstring()
    })

    this.input.manager.canvas.addEventListener("mouseleave", () => {
      this.shootArrow()
      this.isPulling = false
      this.player.leftArm.x = 0
      this.pullStrength = 0
      this.resetBowstring()
    })
  }
}
