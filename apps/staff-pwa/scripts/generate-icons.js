/**
 * Generates placeholder 1x1 transparent PNG icons for the PWA manifest.
 * Run via: pnpm generate-icons
 */
'use strict'

const fs = require('fs')
const path = require('path')

// Minimal 1x1 transparent PNG (RGBA, 8-bit)
const PNG_1X1_TRANSPARENT = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

const publicDir = path.join(__dirname, '..', 'public')

fs.writeFileSync(path.join(publicDir, 'icon-192.png'), PNG_1X1_TRANSPARENT)
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), PNG_1X1_TRANSPARENT)

console.error('Icons written to public/')
