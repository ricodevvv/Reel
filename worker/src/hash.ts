import { hashPassword } from "./auth.js";

/**
 * Turns a password into the scrypt hash REEL_PASSWORD_HASH expects.
 *
 * Read from argv rather than prompted for, because this is called from deploy.sh where there is no
 * terminal to prompt on.
 */
const password = process.argv[2];
if (!password) {
  process.stderr.write("usage: node dist/hash.js <password>\n");
  process.exit(2);
}
process.stdout.write(`${hashPassword(password)}\n`);
