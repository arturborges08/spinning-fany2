'use strict';
const fs = require('fs'), path = require('path');
const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DIR, 'db.json'), BK = path.join(DIR, 'backups');
let lastBackupDay = '';

function ensure() { fs.mkdirSync(BK, { recursive: true }); }
function backups() { try { return fs.readdirSync(BK).filter(f => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch (e) { return []; } }

/** Lê o banco. Se o arquivo principal estiver corrompido, usa a cópia mais recente — e NUNCA sobrescreve por engano. */
function load() {
  ensure();
  const last = backups().at(-1); if (last) lastBackupDay = last.slice(3, 13);
  if (!fs.existsSync(FILE)) return null;
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) {
    console.error('[ERRO] db.json corrompido:', e.message);
    const b = backups().at(-1);
    if (!b) throw new Error('db.json corrompido e sem cópia de segurança. Corrija ou apague o arquivo manualmente.');
    console.error('[AVISO] usando a cópia de segurança', b);
    fs.copyFileSync(FILE, FILE + '.corrompido-' + Date.now());
    return JSON.parse(fs.readFileSync(path.join(BK, b), 'utf8'));
  }
}
/** Grava de forma atômica (arquivo temporário + rename): uma queda no meio nunca deixa o banco pela metade. */
function save(obj) {
  ensure();
  const tmp = FILE + '.tmp', fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, JSON.stringify(obj)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, FILE);
  const day = new Date().toISOString().slice(0, 10);
  if (day !== lastBackupDay) {                                   // 1 cópia por dia, guarda as últimas 30
    fs.copyFileSync(FILE, path.join(BK, `db-${day}.json`)); lastBackupDay = day;
    for (const f of backups().slice(0, -30)) { try { fs.unlinkSync(path.join(BK, f)); } catch (e) { /* ok */ } }
  }
}
module.exports = { load, save, FILE, DIR };
