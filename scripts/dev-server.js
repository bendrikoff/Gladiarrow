import { spawn } from "child_process"
import { networkInterfaces } from "os"
import qrcode from "qrcode-terminal"

// Function to get local IP address
function getLocalIP() {
  const nets = networkInterfaces()
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if ((net.family === "IPv4" || net.family === 4) && !net.internal) {
        return net.address
      }
    }
  }
  return "localhost"
}

// Function to generate QR code for a given URL
function generateQR(url) {
  console.log(`\n🎮 Game Server Starting...`)
  console.log(`📱 Scan QR code to connect from mobile:\n`)
  qrcode.generate(url, { small: true })
  console.log(`🔗 Direct link: ${url}\n`)
}

// Start Vite dev server
const port = process.argv[2] || "3000"
const localIP = getLocalIP()

// Start Vite server and capture its output to detect the actual port
const viteProcess = spawn("npx", ["vite", "--host", "--port", port], {
  stdio: ["inherit", "pipe", "pipe"],
  shell: true
})

let qrGenerated = false

// Monitor Vite output to detect the actual server URL
viteProcess.stdout.on("data", (data) => {
  const output = data.toString()
  process.stdout.write(output)
  
  // Look for Vite's server ready message to extract the actual port
  if (!qrGenerated && output.includes("ready in") && output.includes("ms")) {
    // Extract port from Vite output or use the requested port
    const networkMatch = output.match(/Network:\s+http:\/\/[\d.]+:(\d+)/)
    const localMatch = output.match(/Local:\s+http:\/\/localhost:(\d+)/)
    const actualPort = networkMatch ? networkMatch[1] : (localMatch ? localMatch[1] : port)
    const url = `http://${localIP}:${actualPort}`
    
    // Generate QR code after server is ready
    setTimeout(() => {
      generateQR(url)
      qrGenerated = true
    }, 100)
  }
})

viteProcess.stderr.on("data", (data) => {
  process.stderr.write(data)
})

// Handle process termination
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down dev server...")
  viteProcess.kill("SIGINT")
  process.exit(0)
})

process.on("SIGTERM", () => {
  viteProcess.kill("SIGTERM")
  process.exit(0)
})

// Handle Vite process exit
viteProcess.on("exit", (code) => {
  if (code !== 0) {
    console.error(`\n❌ Vite process exited with code ${code}`)
  }
  process.exit(code)
})
