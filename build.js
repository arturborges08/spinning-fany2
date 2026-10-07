// Gera server/core.js (servidor) e public/app.js (navegador) a partir de src/ e client/
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const common = R('src/common.js'), logic = R('src/logic.js'), seed = R('src/seed.js');

const core = `'use strict';
/* GERADO por build.js — não edite aqui; edite src/common.js, src/logic.js ou src/seed.js */
const hooks = { save() {} };
function save() { hooks.save(); }
${common}
${logic}
${seed}
module.exports = {
  hooks, get db() { return db; }, setDb(d) { db = d; },
  DEFAULT_TERMS, DEFAULT_REMINDER, OCC, HOLD_MIN, freshDb, defaultSpecial,
  esc, uid, num, clean, digits, isValidCpf, maskCpf, fmtCpf, activeOffers, offerOf, seatsLeft, fTime, brl, reaisToCents, centsToReais, D, cap1, fWhen, fDay, fTime, fDate, dayKey, addDays, atHour,
  normPhone, validPhone, fPhone, waLink, fill, shortName, S, cls, usr, pkg, occ, isFuture, isHeld, purName,
  changeSeat, resizeClass, applyStudioToClasses, audit, notify, ledgerAdd, addCredits, expireCredits, seatPlan, reserveSeat,
  promoteWaitlist, expireOffers, settleOfferNotes, declineOffer, OFFER_MAX_MIN, releaseSeat, newPurchase, fulfill, refundPurchase, cancelClass, adjustCredits, checkGift, giftCredits,
  adminBook, moveSeat, expireHolds, bookEvent, fulfillEvent, saveSpecial, scheduleSpecial
};
`;
fs.writeFileSync(path.join(__dirname, 'server/core.js'), core);

const client = ['client/ui.js', 'client/admin.js', 'client/main.js'].filter(f => fs.existsSync(path.join(__dirname, f))).map(R).join('\n');
fs.writeFileSync(path.join(__dirname, 'public/app.js'), `'use strict';\n/* GERADO por build.js */\n${common}\n${client}\n`);
if (fs.existsSync(path.join(__dirname, 'client/styles.css'))) fs.copyFileSync(path.join(__dirname, 'client/styles.css'), path.join(__dirname, 'public/styles.css'));
for (const f of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest']) if (fs.existsSync(path.join(__dirname, 'client', f))) fs.copyFileSync(path.join(__dirname, 'client', f), path.join(__dirname, 'public', f));
if (fs.existsSync(path.join(__dirname, 'client/index.html'))) fs.copyFileSync(path.join(__dirname, 'client/index.html'), path.join(__dirname, 'public/index.html'));
console.log('build ok');
