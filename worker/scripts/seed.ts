/**
 * Seed script — generates admin@turnospsi.com / admin123
 *
 * Usage (from the worker/ directory):
 *   npx tsx scripts/seed.ts
 *
 * Then apply with:
 *   npx wrangler d1 execute DB --config ../wrangler.toml --local --file=seed-data.sql
 *   # or for production:
 *   npx wrangler d1 execute DB --config ../wrangler.toml --file=seed-data.sql
 */

import { webcrypto } from 'crypto';
import { writeFileSync } from 'fs';

const subtle = webcrypto.subtle;

async function hashPassword(password: string): Promise<string> {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();

  const keyMaterial = await subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const hashBits = await subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );

  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hashHex = Array.from(new Uint8Array(hashBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${saltHex}:${hashHex}`;
}

void (async () => {
  const hash = await hashPassword('admin123');

  const sql = `-- Seed: test psychologist
INSERT INTO psychologists (name, email, password_hash)
VALUES ('Psicólogo Admin', 'admin@turnospsi.com', '${hash}')
ON CONFLICT(email) DO NOTHING;
`;

  writeFileSync('seed-data.sql', sql);

  console.log('seed-data.sql generado correctamente.');
  console.log('  Email:    admin@turnospsi.com');
  console.log('  Password: admin123');
  console.log('');
  console.log('Aplicar en D1 local:');
  console.log('  npx wrangler d1 execute DB --config ../wrangler.toml --local --file=seed-data.sql');
  console.log('');
  console.log('Aplicar en producción:');
  console.log('  npx wrangler d1 execute DB --config ../wrangler.toml --file=seed-data.sql');
})();
