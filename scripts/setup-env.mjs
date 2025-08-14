#!/usr/bin/env node
import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import readline from "node:readline/promises"

const ROOT = process.cwd()
const envPath = path.join(ROOT, ".env.local")

async function writeEnvFile(url, anonKey) {
  const lines = [
    `NEXT_PUBLIC_SUPABASE_URL=${url ?? ""}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey ?? ""}`,
    "",
  ]
  await fs.writeFile(envPath, lines.join("\n"), { encoding: "utf8" })
}

async function main() {
  const nonInteractive =
    process.argv.includes("--non-interactive") ||
    process.env.CI === "true" ||
    process.env.INTERACTIVE === "0" ||
    !process.stdin.isTTY

  if (existsSync(envPath)) {
    console.log(".env.local already exists. Skipping creation.")
    return
  }

  if (nonInteractive) {
    console.log("Creating .env.local with placeholder values (non-interactive mode)...")
    await writeEnvFile("YOUR_SUPABASE_URL", "YOUR_SUPABASE_ANON_KEY")
    console.log("Created .env.local. Update it with your actual keys.")
    return
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    console.log("Let's set up your Supabase environment. Values are stored in .env.local (gitignored).\n")
    const url = (await rl.question("Supabase URL (NEXT_PUBLIC_SUPABASE_URL): ")).trim()
    const anon = (await rl.question("Supabase Anon Key (NEXT_PUBLIC_SUPABASE_ANON_KEY): ")).trim()
    await writeEnvFile(url, anon)
    console.log("\n.env.local created successfully. You can edit it anytime.")
  } finally {
    rl.close()
  }
}

main().catch((err) => {
  console.error("Failed to set up environment:", err)
  process.exitCode = 1
})

