import app, { warmDb } from './app.js'

const PORT = Number(process.env.PORT ?? 3001)

async function main() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Audioswipe API :${PORT}`)
  })
  await warmDb()
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
