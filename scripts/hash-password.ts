// Prints bcrypt hashes for seed data. Usage:
//   node scripts/hash-password.ts "Password@123"        -> one hash
//   node scripts/hash-password.ts "Password@123" 8      -> eight different hashes (bcrypt salts every hash)
// Paste the output into db/sql/90_seed_core.sql. The plain-text password is never stored anywhere in the repo.
import bcrypt from "bcrypt";

const password = process.argv[2];
const count = Number(process.argv[3] ?? 1);
if (!password) {
  console.error('Usage: node scripts/hash-password.ts "<password>" [count]');
  process.exit(1);
}

for (let i = 0; i < count; i++) {
  console.log(await bcrypt.hash(password, 10)); // 10 = cost factor: 2^10 rounds
}
