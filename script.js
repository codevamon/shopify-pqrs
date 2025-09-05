/** CONFIG **/
const SPREADSHEET_ID = '1cZij9SUqJSQF-DrR6yu24mFssutIjMVn7A5mCVG7YGE';
const SHEET_NAME = 'PQRS de Glucloud';

// Lee el token desde Propiedades del Script
const TOKEN = PropertiesService.getScriptProperties().getProperty('TOKEN');

function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(SHEET_NAME); // <-- usa la constante
  if (!sh) throw new Error(`SHEET_NOT_FOUND: "${SHEET_NAME}"`);
  ensureHeaders_(sh);
  return sh;
}

function ensureHeaders_(sh) {
  const headers = ['folio','fecha_iso','nombre','email','telefono','pedido','categoria','mensaje','estado','historial_json'];
  if (sh.getLastRow() === 0) { sh.appendRow(headers); return; }
  const first = sh.getRange(1,1,1,headers.length).getValues()[0];
  if (String(first[0]).toLowerCase() !== 'folio') {
    sh.insertRows(1);
    sh.getRange(1,1,1,headers.length).setValues([headers]);
  }
}

// function onEdit(e){
//   try{
//     const sheet = e.range.getSheet();
//     if (sheet.getName() !== SHEET_NAME) return;
//     const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
//     const colEstado = headers.indexOf('estado') + 1;
//     const colHist   = headers.indexOf('historial_json') + 1;
//     if (e.range.getColumn() !== colEstado || e.range.getRow() === 1) return;

//     const newVal = (e.value || '').trim();
//     const oldVal = (e.oldValue || '').trim();
//     if (!newVal || newVal === oldVal) return;

//     const ALLOWED = ['RADICADA','EN_TRAMITE','FINALIZADA'];
//     const estado = newVal.toUpperCase();
//     if (!ALLOWED.includes(estado)) return;

//     const row = e.range.getRow();
//     const cellHist = sheet.getRange(row, colHist);
//     let hist = [];
//     try { hist = JSON.parse(cellHist.getValue() || '[]'); } catch(_) {}
//     hist.push({ t: new Date().toISOString(), ev: 'STATUS_CHANGED', note: estado });
//     cellHist.setValue(JSON.stringify(hist));
//   } catch(_) {}
// }

function onEdit(e){
  try{
    const sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;

    // Ubicar columnas por encabezado
    const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    const colEstado = headers.indexOf('estado') + 1;
    const colHist   = headers.indexOf('historial_json') + 1;

    // Solo actuamos si editaron la columna 'estado' y no es la fila de encabezados
    if (e.range.getColumn() !== colEstado || e.range.getRow() === 1) return;

    // Evitar notificaciones en pegados masivos / cambios nulos
    const newVal = (e.value || '').trim();
    const oldVal = (e.oldValue || '').trim();
    if (!newVal || newVal === oldVal) return;

    // Estados permitidos
    const ALLOWED = ['RADICADA','EN_TRAMITE','FINALIZADA'];
    const estado = newVal.toUpperCase();
    if (!ALLOWED.includes(estado)) return;

    // Actualizar historial
    const row = e.range.getRow();
    const cellHist = sheet.getRange(row, colHist);
    let hist = [];
    try { hist = JSON.parse(cellHist.getValue() || '[]'); } catch(_) { hist = []; }
    hist.push({ t: new Date().toISOString(), ev: 'STATUS_CHANGED', note: estado });
    cellHist.setValue(JSON.stringify(hist));

    // ✉️ Enviar correo por cambio de estado
    const rowVals = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    const rowObj = {};
    headers.forEach((h, i) => rowObj[h] = rowVals[i]);
    sendEmailOnStatusChange_(rowObj);

  } catch(_){}
}


function doPost(e){
  try {
    authGuard(e);
    let data = {};
    const type = (e.postData && e.postData.type) || '';
    if (type.includes('application/json')) data = JSON.parse(e.postData.contents || '{}');
    else data = e.parameter || {};

    const required = ['nombre','email','categoria','mensaje'];
    for (const k of required) if (!data[k]) return json({ ok:false, error:`Falta ${k}` });

    const sh  = getSheet_();
    const now = new Date();
    const folio = nextFolio_();

    const base = {
      folio,
      fecha_iso: now.toISOString(),
      nombre: (data.nombre||'').trim(),
      email:  (data.email||'').trim(),
      telefono:(data.telefono||'').trim(),
      pedido: (data.pedido||'').trim(),
      categoria:(data.categoria||'').trim(),
      mensaje: (data.mensaje||'').trim(),
      estado: 'RADICADA',
      historial_json: JSON.stringify([{t:now.toISOString(), ev:'CREATED', note:'Radicada'}])
    };

    sh.appendRow(Object.values(base));
      // ✉️ Enviar confirmación
    sendEmailsOnCreate_(base);

    return json({ ok:true, folio, created_at: now.toISOString(), status:'RADICADA' });
  } catch (err) {
    return json({ ok:false, error:String(err) });
  }
}

// function doGet(e) {
//   try {
//     if (e && e.parameter && e.parameter.ping) return jsonOrJsonp(e, { ok:true, pong:true });

//     authGuard(e);
//     const folio = (e.parameter.folio||'').trim();
//     const email = (e.parameter.email||'').trim().toLowerCase();
//     if (!folio || !email) return jsonOrJsonp(e, { ok:false, error:'folio y email son requeridos' });

//     const sh = getSheet_();
//     const values  = sh.getDataRange().getValues();
//     const headers = values[0];
//     const rows    = values.slice(1);

//     const idx = (h)=> headers.indexOf(h);
//     const F = idx('folio'), E = idx('email'), S = idx('estado'),
//           H = idx('historial_json'), FI = idx('fecha_iso'), C = idx('categoria');

//     const row = rows.find(r => String(r[F]).trim()===folio && String(r[E]).trim().toLowerCase()===email);
//     if (!row) return jsonOrJsonp(e, { ok:false, error:'No encontrado' });

//     let timeline = [];
//     try { timeline = JSON.parse(row[H]||'[]'); } catch(_){}
//     return jsonOrJsonp(e, {
//       ok:true,
//       folio,
//       created_at: row[FI],
//       status: row[S],
//       category: row[C],
//       timeline
//     });
//   } catch (err) {
//     return jsonOrJsonp(e, { ok:false, error:String(err) });
//   }
// }

function doGet(e) {
  try {
    // ping & debug
    if (e && e.parameter && e.parameter.ping) {
      return jsonOrJsonp(e, { ok:true, pong:true });
    }

    authGuard(e);

    // --- Normalizadores ---
    const norm = s => String(s||'').normalize('NFKC').trim();
    const normEmail = s => norm(s).toLowerCase();
    const normFolio = (s) => {
      s = norm(s).toUpperCase();
      // quita espacios / guiones repetidos
      s = s.replace(/\s+/g,'-').replace(/-+/g,'-');
      // si viene sin prefijo, agrégalo
      if (!s.startsWith('PQR-')) s = 'PQR-' + s.replace(/^PQR[-\s]?/,'');
      // intenta extraer YYYYMMDD y número
      const m = s.match(/PQR[-\s]?(\d{8})[-\s]?(\d+)/i);
      if (m) {
        const day = m[1];
        const n   = String(m[2]).padStart(6,'0');
        return `PQR-${day}-${n}`;
      }
      return s;
    };

    let folio = normFolio(e.parameter.folio);
    let email = normEmail(e.parameter.email);

    if (!folio || !email) {
      return jsonOrJsonp(e, { ok:false, error:'folio y email son requeridos' });
    }

    const sh = getSheet_();
    const values  = sh.getDataRange().getValues();
    const headers = values[0];
    const rows    = values.slice(1);

    const idx = (h)=> headers.indexOf(h);

    const F  = idx('folio');
    const E  = idx('email');
    const S  = idx('estado');
    const H  = idx('historial_json');
    const FI = idx('fecha_iso');

    // tolera 'categoria' o 'categoría'
    let C = idx('categoria'); if (C === -1) C = idx('categoría');

    // Si algo clave no existe, devuélvelo claro
    if ([F,E,S,FI].some(i => i < 0)) {
      return jsonOrJsonp(e, {
        ok:false,
        error:'HEADERS_INVALID',
        details:{F,E,S,FI,C,headers}
      });
    }

    // Busca por folio y email (normalizados)
    const row = rows.find(r =>
      normFolio(r[F]) === folio &&
      normEmail(r[E]) === email
    );

    if (!row) {
      // modo debug opcional: ?debug=1
      if (e.parameter.debug == '1') {
        const onlyFolio = rows.filter(r => normFolio(r[F]) === folio)
                              .map(r => ({ email: r[E], emailNorm: normEmail(r[E]) }));
        return jsonOrJsonp(e, {
          ok:false,
          error:'No encontrado',
          debug:{
            lookingFor:{folio,email},
            matchedByFolio: onlyFolio, // para ver qué email espera
            headers
          }
        });
      }
      return jsonOrJsonp(e, { ok:false, error:'No encontrado' });
    }

    let timeline = [];
    try { timeline = JSON.parse(row[H] || '[]'); } catch(_){}

    return jsonOrJsonp(e, {
      ok: true,
      folio,
      created_at: row[FI],
      status: row[S],
      category: (C >= 0 ? row[C] : ''),
      timeline
    });

  } catch (err) {
    return jsonOrJsonp(e, { ok:false, error:String(err) });
  }
}

/* Helpers */

function normalizeFolio_(s) {
  // Quita todo lo que no sea A-Z/0-9 y obliga prefijo PQR
  const flat = String(s).toUpperCase().replace(/[^A-Z0-9]/g,'');
  // Acepta "PQR-20250821-000006", "pqr 20250821 000006", etc.
  return flat.startsWith('PQR') ? flat : ('PQR' + flat.replace(/^PQR/, ''));
}

function nextFolio_() {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  const PS = PropertiesService.getScriptProperties();
  const key = 'seq_' + today;
  let n = Number(PS.getProperty(key) || '0') + 1;
  PS.setProperty(key, String(n));
  return `PQR-${today}-${String(n).padStart(6,'0')}`;
}
function json(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function jsonOrJsonp(e, obj) {
  const cb = e && e.parameter && e.parameter.callback;
  const body = JSON.stringify(obj);
  if (cb) return ContentService.createTextOutput(`${cb}(${body});`)
              .setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(body)
           .setMimeType(ContentService.MimeType.JSON);
}
function readTokenFrom(e){
  let token = '';
  const pd = e && e.postData;
  const type = (pd && pd.type || '').toLowerCase();
  if (pd) {
    if (type.includes('application/json')) { try { token = JSON.parse(pd.contents || '{}').token || ''; } catch(_){} }
    else if (type.includes('multipart/form-data') || type.includes('application/x-www-form-urlencoded')) {
      token = (e.parameter && e.parameter.token) || '';
    }
  }
  if (!token) token = (e.parameter && e.parameter.token) || '';
  if (!token && e && e.parameter && e.parameter['x-token']) token = e.parameter['x-token'];
  return token;
}
function authGuard(e){
  const token = readTokenFrom(e);
  if (!token) throw new Error('UNAUTHORIZED:NO_TOKEN');
  if (token !== TOKEN) throw new Error('UNAUTHORIZED:BAD_TOKEN');
}


/** ================== Email helpers ================== **/
function sendEmailsOnCreate_(ticket) {
  try {
    const PS   = PropertiesService.getScriptProperties();
    const BRAND = PS.getProperty('BRAND_NAME') || 'Soporte';
    const REPLY = PS.getProperty('REPLY_TO') || Session.getActiveUser().getEmail();
    const ADMIN = (PS.getProperty('NOTIFY_TO') || '').trim();

    // Construye cuerpo HTML (puedes editar estilos/texto libremente)
    const trackUrl = 'https://glucloud.com/pages/tracking';
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.45;color:#222">
        <h2 style="margin:0 0 8px">${BRAND} — Confirmación de PQR</h2>
        <p>Hola ${escapeHtml_(ticket.nombre || '')},</p>
        <p>Hemos recibido tu PQR y la hemos <b>radicado</b> con la siguiente información:</p>
        <ul>
          <li><b>Folio:</b> ${ticket.folio}</li>
          <li><b>Categoría:</b> ${ticket.categoria || '-'}</li>
          <li><b>Fecha:</b> ${new Date(ticket.fecha_iso).toLocaleString()}</li>
          <li><b>Estado:</b> RADICADA</li>
        </ul>
        <p>Puedes hacer seguimiento desde: <a href="${trackUrl}" target="_blank">${trackUrl}</a></p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
        <p style="font-size:12px;color:#666">Si no solicitaste este caso, puedes ignorar este mensaje.</p>
      </div>`;

    // Enviar al cliente
    MailApp.sendEmail({
      to: String(ticket.email || '').trim(),
      subject: `[${BRAND}] PQR ${ticket.folio} radicada`,
      htmlBody: html,
      replyTo: REPLY
    });

    // Copia al admin (opcional)
    if (ADMIN) {
      const adminHtml = html + `
        <div style="margin-top:12px;padding:8px;background:#f7f7f7;border:1px solid #eee">
          <div><b>Teléfono:</b> ${ticket.telefono || '-'}</div>
          <div><b>Pedido:</b> ${ticket.pedido || '-'}</div>
          <div><b>Mensaje:</b> ${escapeHtml_(ticket.mensaje || '')}</div>
        </div>`;
      MailApp.sendEmail({
        to: ADMIN,
        subject: `[${BRAND}] Nueva PQR ${ticket.folio}`,
        htmlBody: adminHtml,
        replyTo: REPLY
      });
    }
  } catch (err) {
    console.error('EMAIL_ERROR:', err);
    // No relanzamos: la radicación ya quedó guardada
  }
}
// Útil para sanear texto en htmlBody
function escapeHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function sendEmailOnStatusChange_(rowObj) {
  try {
    const PS   = PropertiesService.getScriptProperties();
    const BRAND = PS.getProperty('BRAND_NAME') || 'Soporte';
    const REPLY = PS.getProperty('REPLY_TO') || Session.getActiveUser().getEmail();

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.45;color:#222">
        <h2 style="margin:0 0 8px">${BRAND} — Actualización de PQR</h2>
        <p>Tu PQR <b>${rowObj.folio}</b> cambió de estado a: <b>${rowObj.estado}</b>.</p>
        <p>Fecha: ${new Date().toLocaleString()}</p>
      </div>`;

    MailApp.sendEmail({
      to: String(rowObj.email || '').trim(),
      subject: `[${BRAND}] PQR ${rowObj.folio} — Estado: ${rowObj.estado}`,
      htmlBody: html,
      replyTo: REPLY
    });
  } catch(e) {
    console.error('EMAIL_STATUS_ERROR:', e);
  }
}


