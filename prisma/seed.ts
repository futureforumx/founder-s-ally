import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient, type Prisma } from '@prisma/client'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Prisma CLI only auto-loads `.env`; mirror DATABASE_URL from `.env.local` when present. */
function ensureDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return
  const root = process.cwd()
  for (const name of ['.env', '.env.local']) {
    const p = join(root, name)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const m = t.match(/^DATABASE_URL=(.*)$/)
      if (!m) continue
      let v = m[1].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      process.env.DATABASE_URL = v
      return
    }
  }
}

ensureDatabaseUrl()

const prisma = new PrismaClient()

type SeedFile = {
  firms: Record<string, unknown>[]
  funds: Record<string, unknown>[]
  people: Record<string, unknown>[]
  investments: Record<string, unknown>[]
  source_links?: Record<string, unknown>[]
  signals?: Record<string, unknown>[]
  score_snapshots?: Record<string, unknown>[]
}

function optDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'string') return new Date(value)
  return undefined
}

function mapFund(row: Record<string, unknown>) {
  return {
    ...row,
    open_date: optDate(row.open_date),
    close_date: optDate(row.close_date),
    last_investment_date: optDate(row.last_investment_date),
  }
}

function mapPerson(row: Record<string, unknown>) {
  return {
    ...row,
    last_active_date: optDate(row.last_active_date),
  }
}

function mapInvestment(row: Record<string, unknown>) {
  return {
    ...row,
    investment_date: optDate(row.investment_date),
    exit_date: optDate(row.exit_date),
  }
}

function mapSourceLink(row: Record<string, unknown>) {
  return {
    ...row,
    last_verified_at: optDate(row.last_verified_at),
  }
}

function mapSignal(row: Record<string, unknown>) {
  return {
    ...row,
    signal_date: optDate(row.signal_date),
  }
}

function mapScoreSnapshot(row: Record<string, unknown>) {
  return {
    ...row,
    computed_at: optDate(row.computed_at),
  }
}

async function main() {
  const raw = readFileSync(join(__dirname, 'seed.example.json'), 'utf8')
  const data = JSON.parse(raw) as SeedFile

  const slugs = data.firms.map((f) => f.slug as string)

  await prisma.vCFirm.deleteMany({ where: { slug: { in: slugs } } })

  for (const row of data.firms) {
    await prisma.vCFirm.create({ data: row as Prisma.VCFirmCreateInput })
  }

  for (const row of data.funds) {
    await prisma.vCFund.create({ data: mapFund(row) as Prisma.VCFundCreateInput })
  }

  for (const row of data.people) {
    await prisma.vCPerson.create({ data: mapPerson(row) as Prisma.VCPersonCreateInput })
  }

  for (const row of data.investments) {
    await prisma.vCInvestment.create({ data: mapInvestment(row) as Prisma.VCInvestmentCreateInput })
  }

  for (const row of data.source_links ?? []) {
    await prisma.vCSourceLink.create({ data: mapSourceLink(row) as Prisma.VCSourceLinkCreateInput })
  }

  for (const row of data.signals ?? []) {
    await prisma.vCSignal.create({ data: mapSignal(row) as Prisma.VCSignalCreateInput })
  }

  for (const row of data.score_snapshots ?? []) {
    await prisma.vCScoreSnapshot.create({ data: mapScoreSnapshot(row) as Prisma.VCScoreSnapshotCreateInput })
  }

  const sl = data.source_links?.length ?? 0
  const sg = data.signals?.length ?? 0
  const sn = data.score_snapshots?.length ?? 0
  console.log(
    `Seeded ${data.firms.length} firms, ${data.funds.length} funds, ${data.people.length} people, ${data.investments.length} investments, ${sl} source links, ${sg} signals, ${sn} score snapshots.`,
  )
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
