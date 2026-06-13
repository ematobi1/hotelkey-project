import pg from 'pg'

const { Client } = pg

if (!process.env.RDS_PASSWORD) {
  console.error('RDS_PASSWORD not set. Run: $env:RDS_PASSWORD = "<password>"; node scripts/seed-demo.mjs')
  process.exit(1)
}

const CFG = {
  host: 'hotel-key-demo.c0zq8ks60dxz.us-east-1.rds.amazonaws.com',
  port: 5432,
  user: 'hotelkey',
  password: process.env.RDS_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
}

const TENANT_ID = '10000000-0000-0000-0000-000000000001'
// Password: HotelKeyDemo1!
const STAFF_HASH = '$argon2id$v=19$m=65536,t=3,p=4$5iP67invVVPRqhvhZzkQMQ$FMJUfByw3n71R4AYKgME+ORRtO5eULHAuN8uq+98Zek'

async function connect(database) {
  const c = new Client({ ...CFG, database })
  await c.connect()
  return c
}

// ─── Room types ───────────────────────────────────────────────────────────────

const ROOM_TYPES = [
  { key: 'std_king',     name: 'Standard King',      rate: 150, maxOcc: 2, desc: 'Spacious room with a king-size bed, city views, and modern amenities.', beds: [{ type: 'king', count: 1 }] },
  { key: 'dlx_queen',   name: 'Deluxe Queen',        rate: 195, maxOcc: 2, desc: 'Elegant room with premium queen-size bed, garden views, and marble bathroom.', beds: [{ type: 'queen', count: 1 }] },
  { key: 'dbl_queen',   name: 'Double Queen',        rate: 210, maxOcc: 4, desc: 'Ideal for families — two queen beds with generous seating area.', beds: [{ type: 'queen', count: 2 }] },
  { key: 'jr_suite',    name: 'Junior Suite',        rate: 280, maxOcc: 3, desc: 'Generous suite with king bed, separate sitting area, and espresso machine.', beds: [{ type: 'king', count: 1 }] },
  { key: 'exec_suite',  name: 'Executive Suite',     rate: 380, maxOcc: 3, desc: 'Panoramic-view suite with kitchenette, dining area, and executive lounge access.', beds: [{ type: 'king', count: 1 }] },
  { key: 'presidential',name: 'Presidential Suite',  rate: 450, maxOcc: 4, desc: 'Two-bedroom suite with private terrace, butler service, and bespoke amenities.', beds: [{ type: 'king', count: 2 }] },
]

// 32 rooms across floors 2–6
const ROOM_LAYOUT = [
  // Floor 2 — Standard King (10)
  ...['201','202','203','204','205','206','207','208'].map(n => ({ n, f: 2, t: 'std_king', a: false })),
  { n: '209', f: 2, t: 'std_king', a: true },
  { n: '210', f: 2, t: 'std_king', a: false },
  // Floor 3 — Deluxe Queen (8) + Double Queen (2)
  ...['301','302','303','304','306','307','308'].map(n => ({ n, f: 3, t: 'dlx_queen', a: false })),
  { n: '305', f: 3, t: 'dlx_queen', a: true },
  { n: '309', f: 3, t: 'dbl_queen', a: false },
  { n: '310', f: 3, t: 'dbl_queen', a: false },
  // Floor 4 — Double Queen (3) + Junior Suite (3)
  { n: '401', f: 4, t: 'dbl_queen', a: false },
  { n: '402', f: 4, t: 'dbl_queen', a: false },
  { n: '403', f: 4, t: 'dbl_queen', a: true },
  { n: '404', f: 4, t: 'jr_suite',  a: false },
  { n: '405', f: 4, t: 'jr_suite',  a: false },
  { n: '406', f: 4, t: 'jr_suite',  a: false },
  // Floor 5 — Executive Suite (4)
  { n: '501', f: 5, t: 'exec_suite', a: false },
  { n: '502', f: 5, t: 'exec_suite', a: false },
  { n: '503', f: 5, t: 'exec_suite', a: true  },
  { n: '504', f: 5, t: 'exec_suite', a: false },
  // Floor 6 — Presidential Suite (2)
  { n: '601', f: 6, t: 'presidential', a: false },
  { n: '602', f: 6, t: 'presidential', a: false },
]

const ROOM_RATES = {
  '201':150,'202':150,'203':150,'204':150,'205':150,
  '206':150,'207':150,'208':150,'209':150,'210':150,
  '301':195,'302':195,'303':195,'304':195,'305':195,'306':195,'307':195,'308':195,
  '309':210,'310':210,
  '401':210,'402':210,'403':210,
  '404':280,'405':280,'406':280,
  '501':380,'502':380,'503':380,'504':380,
  '601':450,'602':450,
}

// ─── Guests ───────────────────────────────────────────────────────────────────

const GUESTS = [
  { f:'Emma',      l:'Rodriguez',  e:'emma.rodriguez@gmail.com',      p:'+1-212-555-0101', nat:'US', vip:0 },
  { f:'James',     l:'Thompson',   e:'james.thompson@outlook.com',    p:'+1-617-555-0142', nat:'US', vip:1 },
  { f:'Aisha',     l:'Patel',      e:'aisha.patel@yahoo.com',         p:'+44-20-5555-0183',nat:'GB', vip:2 },
  { f:'Marcus',    l:'Chen',       e:'marcus.chen@gmail.com',         p:'+1-415-555-0124', nat:'US', vip:0 },
  { f:'Sophie',    l:'Williams',   e:'sophie.w@hotmail.com',          p:'+44-161-555-0165',nat:'GB', vip:1 },
  { f:'David',     l:'Okafor',     e:'david.okafor@gmail.com',        p:'+234-802-555-0106',nat:'NG',vip:0 },
  { f:'Natasha',   l:'Ivanova',    e:'n.ivanova@mail.ru',             p:'+7-495-555-0147', nat:'RU', vip:3 },
  { f:'Liam',      l:'Johnson',    e:'liam.j@gmail.com',              p:'+1-312-555-0188', nat:'US', vip:0 },
  { f:'Fatima',    l:'Al-Hassan',  e:'fatima.alhassan@gmail.com',     p:'+971-50-555-0129',nat:'AE', vip:2 },
  { f:'Oliver',    l:'Park',       e:'oliver.park@kakao.com',         p:'+82-10-5555-0160',nat:'KR', vip:0 },
  { f:'Isabella',  l:'Martinez',   e:'imartinez@gmail.com',           p:'+52-55-5555-0101',nat:'MX', vip:1 },
  { f:'Noah',      l:'Taylor',     e:'noah.taylor@icloud.com',        p:'+1-206-555-0142', nat:'US', vip:0 },
  { f:'Amara',     l:'Diallo',     e:'amara.diallo@gmail.com',        p:'+33-1-5555-0183', nat:'FR', vip:0 },
  { f:'Ethan',     l:'Brown',      e:'ethan.brown@gmail.com',         p:'+1-303-555-0124', nat:'US', vip:1 },
  { f:'Mei-Ling',  l:'Wu',         e:'meilingwu@163.com',             p:'+86-138-5555-0165',nat:'CN',vip:2 },
  { f:'Sebastian', l:'Kowalski',   e:'skowalski@wp.pl',               p:'+48-22-555-0106', nat:'PL', vip:0 },
  { f:'Priya',     l:'Sharma',     e:'priya.sharma@gmail.com',        p:'+91-98-5555-0147',nat:'IN', vip:1 },
  { f:'Jackson',   l:'Davis',      e:'jdavis@gmail.com',              p:'+1-404-555-0188', nat:'US', vip:0 },
  { f:'Valentina', l:'Rossi',      e:'v.rossi@libero.it',             p:'+39-06-5555-0129',nat:'IT', vip:2 },
  { f:'Aaron',     l:'Mitchell',   e:'aaron.m@gmail.com',             p:'+1-713-555-0160', nat:'US', vip:0 },
  { f:'Zara',      l:'Ahmed',      e:'zara.ahmed@gmail.com',          p:'+971-55-555-0101',nat:'AE', vip:3 },
  { f:'Connor',    l:'Walsh',      e:'c.walsh@gmail.com',             p:'+353-1-555-0142', nat:'IE', vip:0 },
  { f:'Yuki',      l:'Tanaka',     e:'yuki.tanaka@docomo.ne.jp',      p:'+81-3-5555-0183', nat:'JP', vip:1 },
  { f:'Alexandra', l:'Moore',      e:'a.moore@gmail.com',             p:'+1-305-555-0124', nat:'US', vip:0 },
  { f:'Kwame',     l:'Asante',     e:'kwame.asante@gmail.com',        p:'+233-20-555-0165',nat:'GH', vip:2 },
  { f:'Sofia',     l:'Andersen',   e:'sofia.andersen@gmail.com',      p:'+45-33-55-0106',  nat:'DK', vip:0 },
  { f:'Rafael',    l:'Morales',    e:'r.morales@gmail.com',           p:'+34-91-555-0147', nat:'ES', vip:1 },
  { f:'Claire',    l:'Dubois',     e:'claire.dubois@gmail.com',       p:'+33-1-5555-0188', nat:'FR', vip:0 },
  { f:'Thomas',    l:'Nakamura',   e:'t.nakamura@gmail.com',          p:'+1-408-555-0129', nat:'US', vip:0 },
  { f:'Leila',     l:'Fattahi',    e:'l.fattahi@gmail.com',           p:'+31-20-555-0160', nat:'NL', vip:1 },
]

// ─── Reservation plan ─────────────────────────────────────────────────────────
// [roomNumber, guestIndex, checkIn, checkOut, status]

const RESERVATION_PLAN = [
  // 20 currently checked-in
  ['201',  0, '2026-06-11','2026-06-15','checked_in'],
  ['202',  1, '2026-06-10','2026-06-14','checked_in'],
  ['203',  2, '2026-06-12','2026-06-18','checked_in'],
  ['204',  3, '2026-06-08','2026-06-16','checked_in'],
  ['205',  4, '2026-06-13','2026-06-17','checked_in'],
  ['206',  5, '2026-06-11','2026-06-15','checked_in'],
  ['207',  6, '2026-06-09','2026-06-14','checked_in'],
  ['208',  7, '2026-06-12','2026-06-16','checked_in'],
  ['301',  8, '2026-06-10','2026-06-17','checked_in'],
  ['302',  9, '2026-06-11','2026-06-15','checked_in'],
  ['303', 10, '2026-06-13','2026-06-20','checked_in'],
  ['304', 11, '2026-06-12','2026-06-16','checked_in'],
  ['305', 12, '2026-06-10','2026-06-14','checked_in'],
  ['306', 13, '2026-06-09','2026-06-15','checked_in'],
  ['307', 14, '2026-06-11','2026-06-18','checked_in'],
  ['404', 15, '2026-06-12','2026-06-16','checked_in'],
  ['405', 16, '2026-06-10','2026-06-17','checked_in'],
  ['501', 17, '2026-06-11','2026-06-15','checked_in'],
  ['502', 18, '2026-06-13','2026-06-19','checked_in'],
  ['601', 20, '2026-06-11','2026-06-16','checked_in'],
  // 12 checked-out (past stays)
  ['209', 19, '2026-06-03','2026-06-10','checked_out'],
  ['210', 21, '2026-06-05','2026-06-12','checked_out'],
  ['308', 22, '2026-06-02','2026-06-08','checked_out'],
  ['309', 23, '2026-06-04','2026-06-11','checked_out'],
  ['310', 24, '2026-06-01','2026-06-08','checked_out'],
  ['401', 25, '2026-06-05','2026-06-12','checked_out'],
  ['402', 26, '2026-06-03','2026-06-09','checked_out'],
  ['403', 27, '2026-06-06','2026-06-12','checked_out'],
  ['406', 28, '2026-06-04','2026-06-11','checked_out'],
  ['503', 29, '2026-06-07','2026-06-12','checked_out'],
  ['504',  2, '2026-06-01','2026-06-07','checked_out'],
  ['602',  7, '2026-06-05','2026-06-12','checked_out'],
  // 8 upcoming (confirmed)
  ['209',  3, '2026-06-16','2026-06-20','confirmed'],
  ['210',  0, '2026-06-15','2026-06-19','confirmed'],
  ['308',  9, '2026-06-16','2026-06-22','confirmed'],
  ['309', 11, '2026-06-17','2026-06-21','confirmed'],
  ['401',  4, '2026-06-17','2026-06-22','confirmed'],
  ['402', 19, '2026-06-15','2026-06-18','confirmed'],
  ['503', 12, '2026-06-16','2026-06-20','confirmed'],
  ['602', 16, '2026-06-19','2026-06-24','confirmed'],
]

function nights(ci, co) {
  return (new Date(co) - new Date(ci)) / 86_400_000
}

function code(i) {
  return `HK26${String(i + 1).padStart(5, '0')}`
}

// ─── Seed functions ───────────────────────────────────────────────────────────

async function seedPms() {
  const c = await connect('hotel_key_pms')
  try {
    await c.query('DELETE FROM room_type WHERE tenant_id = $1', [TENANT_ID])
    await c.query(
      'DELETE FROM tenant WHERE id = $1',
      [TENANT_ID],
    )
    await c.query(`
      INSERT INTO tenant (id, name, slug, plan_type, settings, active)
      VALUES ($1, 'Hotel Key', 'hotel-key-demo', 'enterprise', '{"currency":"USD","timezone":"America/New_York","checkInTime":"15:00","checkOutTime":"11:00"}', true)
    `, [TENANT_ID])
    console.log('  pms: tenant created')
  } finally {
    await c.end()
  }
}

async function seedAuth() {
  const c = await connect('hotel_key_auth')
  try {
    await c.query('DELETE FROM staff WHERE tenant_id = $1', [TENANT_ID])
    await c.query(`
      INSERT INTO staff (tenant_id, email, password_hash, first_name, last_name, role, is_active)
      VALUES
        ($1, 'admin@hotelkey.demo',     $2, 'Victoria', 'Zhang',  'admin',      true),
        ($1, 'frontdesk@hotelkey.demo', $2, 'James',    'Okafor', 'front_desk', true)
    `, [TENANT_ID, STAFF_HASH])
    console.log('  auth: 2 staff accounts created')
  } finally {
    await c.end()
  }
}

async function seedRooms() {
  const c = await connect('hotel_key_room')
  try {
    await c.query('DELETE FROM room WHERE tenant_id = $1', [TENANT_ID])
    await c.query('DELETE FROM room_type WHERE tenant_id = $1', [TENANT_ID])

    const typeIds = {}
    for (const rt of ROOM_TYPES) {
      const { rows } = await c.query(`
        INSERT INTO room_type (tenant_id, name, description, base_rate, currency_code, max_occupancy, bed_config, images)
        VALUES ($1, $2, $3, $4, 'USD', $5, $6::jsonb, '[]'::jsonb)
        RETURNING id
      `, [TENANT_ID, rt.name, rt.desc, rt.rate, rt.maxOcc, JSON.stringify(rt.beds)])
      typeIds[rt.key] = rows[0].id
    }
    console.log(`  room: ${ROOM_TYPES.length} room types created`)

    const roomIds = {}
    const amenityMap = {
      std_king:     ['wifi', 'tv', 'minibar', 'safe'],
      dlx_queen:    ['wifi', 'tv', 'minibar', 'safe', 'bathrobes'],
      dbl_queen:    ['wifi', 'tv', 'minibar', 'safe'],
      jr_suite:     ['wifi', 'tv', 'minibar', 'safe', 'bathrobes', 'espresso_machine', 'sofa'],
      exec_suite:   ['wifi', 'tv', 'minibar', 'safe', 'bathrobes', 'espresso_machine', 'sofa', 'kitchenette', 'lounge_access'],
      presidential: ['wifi', 'tv', 'minibar', 'safe', 'bathrobes', 'espresso_machine', 'sofa', 'kitchenette', 'butler_service', 'private_terrace'],
    }

    for (const room of ROOM_LAYOUT) {
      const { rows } = await c.query(`
        INSERT INTO room (tenant_id, room_number, floor, room_type_id, status, amenities, max_occupancy, is_accessible)
        VALUES ($1, $2, $3, $4, 'clean', $5::jsonb, $6, $7)
        RETURNING id
      `, [
        TENANT_ID, room.n, room.f, typeIds[room.t],
        JSON.stringify(amenityMap[room.t]),
        ROOM_TYPES.find(r => r.key === room.t).maxOcc,
        room.a,
      ])
      roomIds[room.n] = rows[0].id
    }
    console.log(`  room: ${ROOM_LAYOUT.length} rooms created`)
    return { roomIds, typeIds }
  } finally {
    await c.end()
  }
}

async function seedGuests() {
  const c = await connect('hotel_key_guest')
  try {
    await c.query('DELETE FROM guest WHERE tenant_id = $1', [TENANT_ID])
    const guestIds = []
    for (const g of GUESTS) {
      const { rows } = await c.query(`
        INSERT INTO guest (tenant_id, first_name, last_name, email, phone, nationality, vip_level)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [TENANT_ID, g.f, g.l, g.e, g.p, g.nat, g.vip])
      guestIds.push(rows[0].id)
    }
    console.log(`  guest: ${guestIds.length} guests created`)
    return guestIds
  } finally {
    await c.end()
  }
}

async function seedReservations(roomIds, guestIds) {
  const c = await connect('hotel_key_reservation')
  try {
    await c.query('DELETE FROM reservation WHERE tenant_id = $1', [TENANT_ID])

    const reservations = []
    for (let i = 0; i < RESERVATION_PLAN.length; i++) {
      const [roomNum, guestIdx, ci, co, status] = RESERVATION_PLAN[i]
      const rate = ROOM_RATES[roomNum]
      const n = nights(ci, co)
      const total = rate * n

      let actualCheckIn = null
      let actualCheckOut = null
      if (status === 'checked_in') {
        actualCheckIn = `${ci}T15:00:00Z`
      } else if (status === 'checked_out') {
        actualCheckIn = `${ci}T15:00:00Z`
        actualCheckOut = `${co}T11:00:00Z`
      }

      const source = (i % 7 === 0) ? 'booking_engine' : 'direct'

      const { rows } = await c.query(`
        INSERT INTO reservation (
          tenant_id, confirmation_code, guest_id, room_id,
          check_in_date, check_out_date, actual_check_in, actual_check_out,
          status, source, adults, children, rate_per_night, total_amount, currency_code
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'USD')
        RETURNING id
      `, [
        TENANT_ID, code(i), guestIds[guestIdx], roomIds[roomNum],
        ci, co, actualCheckIn, actualCheckOut,
        status, source,
        2, 0,
        rate, total,
      ])
      reservations.push({ id: rows[0].id, status, guestId: guestIds[guestIdx], rate, n, total, ci, co, roomNum })
    }
    console.log(`  reservation: ${reservations.length} reservations created (20 checked_in, 12 checked_out, 8 confirmed)`)
    return reservations
  } finally {
    await c.end()
  }
}

async function updateRoomStatuses(roomIds) {
  const c = await connect('hotel_key_room')
  try {
    const occupied = ['201','202','203','204','205','206','207','208','301','302','303','304','305','306','307','404','405','501','502','601']
    const dirty    = ['310','403','406','504']
    // 209, 210, 308, 309, 401, 402, 503, 602 → clean (have upcoming bookings)

    for (const n of occupied) {
      await c.query('UPDATE room SET status = $1 WHERE id = $2', ['occupied', roomIds[n]])
    }
    for (const n of dirty) {
      await c.query('UPDATE room SET status = $1 WHERE id = $2', ['dirty', roomIds[n]])
    }
    console.log(`  room: ${occupied.length} set occupied, ${dirty.length} set dirty`)
  } finally {
    await c.end()
  }
}

async function seedBilling(reservations) {
  const c = await connect('hotel_key_billing')
  try {
    await c.query('DELETE FROM folio_line_item WHERE tenant_id = $1', [TENANT_ID])
    await c.query('DELETE FROM payment WHERE tenant_id = $1', [TENANT_ID])
    await c.query('DELETE FROM folio WHERE tenant_id = $1', [TENANT_ID])

    const billable = reservations.filter(r => r.status === 'checked_in' || r.status === 'checked_out')
    let folioCount = 0
    let lineCount = 0

    for (const res of billable) {
      const isClosed = res.status === 'checked_out'
      const closedAt = isClosed ? `${res.co}T11:30:00Z` : null

      const { rows: folioRows } = await c.query(`
        INSERT INTO folio (tenant_id, reservation_id, guest_id, status, closed_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [TENANT_ID, res.id, res.guestId, isClosed ? 'closed' : 'open', closedAt])

      const folioId = folioRows[0].id
      folioCount++

      // Accommodation charge
      await c.query(`
        INSERT INTO folio_line_item (folio_id, tenant_id, description, charge_type, quantity, unit_amount, total_amount, tax_amount, idempotency_key)
        VALUES ($1, $2, $3, 'accommodation', $4, $5, $6, 0, $7)
      `, [folioId, TENANT_ID, `Accommodation — ${res.n} night${res.n > 1 ? 's' : ''}`, res.n, res.rate, res.total, `accom-${res.id}`])
      lineCount++

      if (isClosed) {
        // Tax charge (14%)
        const tax = Math.round(res.total * 0.14 * 100) / 100
        await c.query(`
          INSERT INTO folio_line_item (folio_id, tenant_id, description, charge_type, quantity, unit_amount, total_amount, tax_amount, idempotency_key)
          VALUES ($1, $2, 'Occupancy Tax (14%)', 'tax', 1, $3, $3, $3, $4)
        `, [folioId, TENANT_ID, tax, `tax-${res.id}`])
        lineCount++
      }
    }
    console.log(`  billing: ${folioCount} folios, ${lineCount} line items created`)
  } finally {
    await c.end()
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(`Seeding Hotel Key demo data (tenant: ${TENANT_ID})\n`)

await seedPms()
await seedAuth()
const { roomIds, typeIds } = await seedRooms()
const guestIds = await seedGuests()
const reservations = await seedReservations(roomIds, guestIds)
await updateRoomStatuses(roomIds)
await seedBilling(reservations)

console.log('\nSeed complete.')
console.log('\nDemo login credentials:')
console.log(`  Tenant ID:  ${TENANT_ID}`)
console.log('  Email:      admin@hotelkey.demo')
console.log('  Password:   HotelKeyDemo1!')
