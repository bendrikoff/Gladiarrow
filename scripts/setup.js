#!/usr/bin/env node

import { execSync } from 'child_process'
import { rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'

console.log('🚀 Setting up your Farcade game project...\n')

// Safety check: verify this is a fresh template
if (!existsSync('.is_fresh')) {
  console.error('❌ Error: This command can only be run on a fresh template project.')
  console.error('💡 The .is_fresh file is missing, indicating this project has already been set up.')
  console.error('🔧 If you need to reset, manually remove .git directory and reinstall dependencies.')
  process.exit(1)
}

// Detect package manager from npm_config_user_agent
const userAgent = process.env.npm_config_user_agent || ''
let packageManager = 'npm'

if (userAgent.includes('yarn')) {
  packageManager = 'yarn'
} else if (userAgent.includes('pnpm')) {
  packageManager = 'pnpm'
} else if (userAgent.includes('bun')) {
  packageManager = 'bun'
}

console.log(`📦 Detected package manager: ${packageManager}`)

// Remove existing .git directory
const gitDir = join(process.cwd(), '.git')
if (existsSync(gitDir)) {
  console.log('🗑️  Removing template git directory...')
  rmSync(gitDir, { recursive: true, force: true })
}

// Remove the fresh template marker
if (existsSync('.is_fresh')) {
  rmSync('.is_fresh')
  console.log('🧹 Removed template marker file')
}

// Install dependencies
console.log('📦 Installing dependencies...')
try {
  const installCommand = packageManager === 'yarn' ? 'yarn install' : 
                        packageManager === 'pnpm' ? 'pnpm install' :
                        packageManager === 'bun' ? 'bun install' : 'npm install'
  
  execSync(installCommand, { stdio: 'inherit' })
  console.log('✅ Dependencies installed successfully!')
} catch (error) {
  console.error('❌ Failed to install dependencies:', error.message)
  process.exit(1)
}

// Initialize new git repository
console.log('🔧 Initializing new git repository...')
try {
  execSync('git init', { stdio: 'inherit' })
  execSync('git add .', { stdio: 'inherit' })
  execSync('git commit -m "initial commit"', { stdio: 'inherit' })
  console.log('✅ Git repository initialized with initial commit!')
} catch (error) {
  console.error('❌ Failed to initialize git repository:', error.message)
  process.exit(1)
}

console.log('\n🎉 Setup complete! Your project is ready to go.')
console.log(`💡 Run '${packageManager} run dev' to start the development server.`)