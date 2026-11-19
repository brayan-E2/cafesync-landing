/* CaféSync · lógica de la landing page.
   Cada bloque indica las Historias de Usuario (HU) que implementa. */
(function () {
  'use strict';

  var D = window.CafeSyncData;
  var DX = window.CafeSyncDiagnostico;
  var U = D.UMBRALES;
  var CLAVE = 'cafesync-demo-v1';
  var ORDEN_RIESGO = { alto: 3, medio: 2, bajo: 1 };

  /* ------------------------------------------------------------------
     Utilidades
     ------------------------------------------------------------------ */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var fmt = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  var fmtDia = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  function fecha(iso) { return fmt.format(new Date(iso)); }
  function dia(iso) { return fmtDia.format(new Date(iso)); }
  function hoyISO() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function capital(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function uid(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1000); }
  function numeroES(n) { return String(n).replace('.', ','); }

  var ICONOS = {
    alto: '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false"><path d="M10 2 1 18h18L10 2Zm-1 6h2v5H9V8Zm0 6h2v2H9v-2Z" fill="currentColor"/></svg>',
    medio: '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 5h2v6H9zM9 13h2v2H9z" fill="currentColor"/></svg>',
    bajo: '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="m6 10 3 3 5-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
  };
  function badgeRiesgo(r) {
    if (!r) return '<span class="risk risk-na">Sin determinar</span>';
    return '<span class="risk risk-' + r + '" data-riesgo="' + r + '">' + ICONOS[r] + 'Riesgo ' + r + '</span>';
  }
  var ESTADOS = { normal: 'Normal', observacion: 'En observación', alerta: 'Con alerta' };
  function badgeEstado(e) { return '<span class="state state-' + e + '" data-estado="' + e + '">' + ESTADOS[e] + '</span>'; }

  /* ------------------------------------------------------------------
     Estado y persistencia (solo en este navegador)
     ------------------------------------------------------------------ */
  var datos;
  var ui = { ordenTecnico: 'nombre', filtroRiesgo: 'todos', busquedaTecnico: '', fichaId: null, fichaRol: null, ultimaFoto: null, ultimoDiagnostico: null };

  function cargar() {
    try {
      var guardado = localStorage.getItem(CLAVE);
      if (guardado) { datos = JSON.parse(guardado); return; }
    } catch (e) { /* almacenamiento no disponible */ }
    datos = D.crearDatos();
  }
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch (e) { /* sin persistencia */ }
  }
  try { ui.ordenTecnico = sessionStorage.getItem('cafesync-orden') || 'nombre'; } catch (e) { /* noop */ }

  function productor(id) { return datos.productores.filter(function (p) { return p.id === id; })[0]; }
  function parcela(id) { return datos.parcelas.filter(function (p) { return p.id === id; })[0]; }

  /* Reglas de negocio compartidas */
  function riesgoAmbiental(l) {
    if (!l) return null;
    var tempOk = l.temp >= U.tempMin && l.temp <= U.tempMax;
    if (l.hum >= U.altoHumedad && tempOk) return 'alto';
    if (l.hum >= U.medioHumedad) return 'medio';
    return 'bajo';
  }
  function lecturaVencida(p) { return !p.lectura || (Date.now() - new Date(p.lectura.fecha).getTime()) > U.horasSinMedicion * D.HORA; }
  function desactualizada(p) { return (Date.now() - new Date(p.actualizada).getTime()) > U.diasDesactualizada * D.DIA; }
  function maxRiesgo(lista) {
    return lista.reduce(function (m, r) { return r && ORDEN_RIESGO[r] > ORDEN_RIESGO[m] ? r : m; }, 'bajo');
  }
  function riesgoParcela(p) {
    var rs = p.alertas.map(function (a) { return a.riesgo; });
    if (!lecturaVencida(p)) rs.push(riesgoAmbiental(p.lectura));
    if (p.estadoManual === 'observacion') rs.push('medio');
    return maxRiesgo(rs);
  }
  function estadoParcela(p) {
    if (p.alertas.length) return 'alerta';
    if (riesgoParcela(p) !== 'bajo' || p.estadoManual === 'observacion') return 'observacion';
    return 'normal';
  }
  function alertaPrincipal(p) {
    return p.alertas.slice().sort(function (a, b) {
      return (ORDEN_RIESGO[b.riesgo] - ORDEN_RIESGO[a.riesgo]) || (new Date(b.fecha) - new Date(a.fecha));
    })[0];
  }
  function ultimaAlerta(p) {
    return p.alertas.reduce(function (m, a) { return Math.max(m, new Date(a.fecha).getTime()); }, 0);
  }
  function motivo(p) {
    var a = alertaPrincipal(p);
    if (a) return a.tipo + ' (' + a.origen.toLowerCase() + ')';
    if (!lecturaVencida(p) && riesgoAmbiental(p.lectura) !== 'bajo') return 'Humedad de ' + p.lectura.hum + ' % favorable para roya';
    if (p.estadoManual === 'observacion') return 'En observación tras la última inspección';
    return 'Sin riesgo detectado';
  }
  function horasDesde(iso) { return Math.round((Date.now() - new Date(iso).getTime()) / D.HORA); }
  function hace(iso) {
    var h = horasDesde(iso);
    if (h < 1) return 'hace menos de 1 hora';
    if (h < 48) return 'hace ' + h + ' h';
    return 'hace ' + Math.round(h / 24) + ' días';
  }

  /* Notificaciones (HU-003, HU-015, HU-041) */
  function notificar(rol, parcelaId, titulo, texto) {
    datos.notificaciones.unshift({ id: uid('n'), rol: rol, parcelaId: parcelaId, fecha: new Date().toISOString(), titulo: titulo, texto: texto });
  }
  /* Ejecuta un cambio y avisa a la cooperativa si la parcela pasó a riesgo alto (HU-041) */
  function mutar(p, fn) {
    var antes = riesgoParcela(p);
    fn();
    p.actualizada = new Date().toISOString();
    var despues = riesgoParcela(p);
    if (despues === 'alto' && antes !== 'alto') {
      var pr = productor(p.productorId);
      notificar('cooperativa', p.id, 'Riesgo alto en ' + p.nombre, 'Productor: ' + pr.nombre + '. Motivo: ' + motivo(p) + '.');
      toast('Aviso enviado a la cooperativa: ' + p.nombre + ' pasó a riesgo alto.');
    }
    guardar();
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 4500);
  }

  /* ------------------------------------------------------------------
     Navegación y pestañas
     ------------------------------------------------------------------ */
  function initNav() {
    var btn = $('.nav-toggle');
    var menu = $('#menu-principal');
    btn.addEventListener('click', function () {
      var abierto = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!abierto));
      btn.querySelector('.sr-only').textContent = abierto ? 'Abrir menú' : 'Cerrar menú';
      menu.classList.toggle('open', !abierto);
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) { btn.setAttribute('aria-expanded', 'false'); menu.classList.remove('open'); btn.querySelector('.sr-only').textContent = 'Abrir menú'; }
    });
    $all('[data-goto-tab]').forEach(function (a) {
      a.addEventListener('click', function () { seleccionarTab(a.getAttribute('data-goto-tab'), false); });
    });
  }

  function seleccionarTab(id, foco) {
    $all('[role="tab"]').forEach(function (t) {
      var activo = t.id === id;
      t.setAttribute('aria-selected', String(activo));
      t.tabIndex = activo ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !activo;
      if (activo && foco) t.focus();
    });
  }
  function initTabs() {
    var tabs = $all('[role="tab"]');
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { seleccionarTab(t.id, true); });
      t.addEventListener('keydown', function (e) {
        var n = null;
        if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
        if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
        if (e.key === 'Home') n = tabs[0];
        if (e.key === 'End') n = tabs[tabs.length - 1];
        if (n) { e.preventDefault(); seleccionarTab(n.id, true); }
      });
    });
  }

  /* ------------------------------------------------------------------
     AGRICULTOR · Diagnóstico por foto (HU-001, HU-002, HU-004, HU-011, HU-016)
     ------------------------------------------------------------------ */
  function mostrarPreview(src) {
    ui.ultimaFoto = src;
    $('#preview-img').src = src;
    $('#preview').hidden = false;
    $('#diag-resultado').hidden = true;
    $('#diag-status').textContent = 'Foto lista. Revisa la vista previa y presiona "Analizar".';
  }

  function initDiagnostico() {
    var input = $('#foto-input');
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) {
        $('#diag-status').textContent = 'El archivo elegido no es una imagen. Elige una foto JPG o PNG.';
        return;
      }
      var lector = new FileReader();
      lector.onload = function () { mostrarPreview(lector.result); };
      lector.readAsDataURL(f);
    });
    $all('[data-sample]').forEach(function (b) {
      b.addEventListener('click', function () { mostrarPreview(DX.crearMuestra(b.getAttribute('data-sample'))); });
    });
    $('#btn-cambiar-foto').addEventListener('click', function () { input.value = ''; input.click(); });
    $('#btn-analizar').addEventListener('click', analizarFoto);
  }

  function analizarFoto() {
    if (!ui.ultimaFoto) return;
    var btn = $('#btn-analizar');
    btn.disabled = true;
    $('#diag-status').textContent = 'Analizando la foto…';
    DX.analizar(ui.ultimaFoto).then(function (res) {
      btn.disabled = false;
      ui.ultimoDiagnostico = res;
      var box = $('#diag-resultado');
      if (!res.valida) {
        box.className = 'result result-error';
        box.innerHTML = '<p class="result-title" data-resultado="rechazada">No pudimos analizar esta foto</p><p>' + esc(res.mensaje) + '</p>' +
          '<button type="button" class="btn btn-primary" data-accion="nueva-foto">Tomar una nueva foto</button>';
        $('#diag-status').textContent = 'La foto no se procesó.';
      } else {
        box.className = 'result';
        box.innerHTML = htmlResultado(res);
        $('#diag-status').textContent = 'Análisis terminado.';
      }
      box.hidden = false;
      box.focus();
    }).catch(function () {
      btn.disabled = false;
      $('#diag-status').textContent = 'No se pudo leer la imagen. Intenta con otra foto.';
    });
  }

  function htmlResultado(res) {
    var cat = D.CATALOGO;
    var titulo, sub;
    if (res.tipo === 'roya') { titulo = 'Posible roya amarilla'; sub = cat.roya.cientifico; }
    else if (res.tipo === 'mancha_hierro') { titulo = cat.mancha_hierro.nombre; sub = cat.mancha_hierro.cientifico; }
    else if (res.tipo === 'sana') { titulo = 'No se observan manchas de roya'; sub = 'La hoja se ve sana en esta foto'; }
    else { titulo = 'No pudimos identificar el problema con seguridad'; sub = 'La foto no muestra una hoja reconocible'; }
    var h = '<p class="result-title" data-resultado="' + res.tipo + '">' + esc(titulo) + '</p>';
    h += '<p class="muted"><em>' + esc(sub) + '</em>' + (res.confianza ? ' · Confianza estimada: ' + res.confianza + ' %' : '') + '</p>';
    if (res.riesgo) {
      h += '<div class="result-risk">' + badgeRiesgo(res.riesgo) + '<span class="urgency">Urgencia: <strong data-urgencia>' + esc(D.RECOMENDACIONES[res.riesgo].urgencia) + '</strong></span></div>';
      h += '<p>' + esc(accionSugerida(res)) + '</p>';
    }
    h += '<div class="result-actions">' +
      '<button type="button" class="btn btn-primary" data-accion="recomendaciones" aria-expanded="false" aria-controls="diag-reco">Ver recomendaciones</button>' +
      '<button type="button" class="btn btn-secondary" data-accion="mas-info" aria-expanded="false" aria-controls="diag-info">Más información</button></div>';
    h += '<div id="diag-reco" class="subpanel" hidden></div><div id="diag-info" class="subpanel" hidden></div>';
    h += '<p class="small muted">Resultado orientativo de la demostración. Confírmalo con tu técnico antes de aplicar productos.</p>';
    return h;
  }
  function accionSugerida(res) {
    if (res.tipo === 'sana') return 'Acción sugerida: mantén la planta en observación durante tus recorridos.';
    if (res.riesgo === 'alto') return 'Acción sugerida: intervén hoy. Separa las hojas dañadas y avisa a tu técnico.';
    if (res.riesgo === 'medio') return 'Acción sugerida: revisa las plantas cercanas y vuelve a tomar una foto en 3 días.';
    return 'Acción sugerida: mantén la planta en observación y vuelve a revisarla en tu próximo recorrido.';
  }
  function htmlRecomendaciones(res) {
    var clave = res.tipo === 'incierto' ? 'incierto' : res.riesgo;
    var r = D.RECOMENDACIONES[clave];
    var h = '<h4>Qué hacer ahora</h4>';
    if (res.riesgo) h += '<p>' + badgeRiesgo(res.riesgo) + ' Urgencia: <strong>' + esc(r.urgencia) + '</strong></p>';
    h += '<ol class="steps-list">' + r.pasos.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol>';
    if (res.tipo === 'incierto' || res.riesgo === 'alto' || res.tipo === 'mancha_hierro') {
      h += '<p class="callout" data-consultar-tecnico>Te recomendamos <strong>consultar a un técnico</strong> antes de aplicar cualquier producto.</p>';
    }
    return h;
  }
  function htmlInfo(res) {
    var info = res.tipo === 'roya' ? D.CATALOGO.roya : (res.tipo === 'mancha_hierro' ? D.CATALOGO.mancha_hierro : null);
    if (res.tipo === 'sana') {
      return '<p>La hoja no muestra manchas naranjas ni marrones. Sigue revisando por debajo de las hojas, sobre todo en temporada de lluvias.</p>';
    }
    if (!info || !info.descripcion) {
      return '<p class="callout" data-info-no-disponible>La información sobre este problema aún no está disponible. Consulta a un técnico de tu cooperativa para confirmar qué es y cómo tratarlo.</p>';
    }
    return '<h4>' + esc(info.nombre) + ' <span class="muted">(' + esc(info.cientifico) + ')</span></h4>' +
      '<p>' + esc(info.descripcion) + '</p>' +
      '<div class="info-grid"><div><h5>Síntomas</h5><ul>' + info.sintomas.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' +
      '<h5>Causas probables</h5><ul>' + info.causas.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' +
      '<h5>Daño que puede causar</h5><p>' + esc(info.danio) + '</p></div>' +
      '<figure><img src="' + esc(info.referencia) + '" alt="' + esc(info.referenciaAlt) + '" width="240" height="180"><figcaption class="small muted">Imagen de referencia</figcaption></figure></div>';
  }
  function initResultado() {
    $('#diag-resultado').addEventListener('click', function (e) {
      var b = e.target.closest('[data-accion]');
      if (!b) return;
      var acc = b.getAttribute('data-accion');
      if (acc === 'nueva-foto') { $('#foto-input').value = ''; $('#foto-input').click(); return; }
      var panel = acc === 'recomendaciones' ? $('#diag-reco') : $('#diag-info');
      var abrir = panel.hidden;
      if (abrir) panel.innerHTML = acc === 'recomendaciones' ? htmlRecomendaciones(ui.ultimoDiagnostico) : htmlInfo(ui.ultimoDiagnostico);
      panel.hidden = !abrir;
      b.setAttribute('aria-expanded', String(abrir));
    });
  }

  /* ------------------------------------------------------------------
     AGRICULTOR · Sensores y notificaciones (HU-003, HU-015)
     ------------------------------------------------------------------ */
  function parcelasAgricultor() { return datos.parcelas.filter(function (p) { return p.productorId === 'pr1'; }); }

  function initSensores() {
    var sel = $('#lectura-parcela');
    sel.innerHTML = parcelasAgricultor().map(function (p) { return '<option value="' + p.id + '">' + esc(p.nombre) + '</option>'; }).join('');
    $('#form-lectura').addEventListener('submit', function (e) {
      e.preventDefault();
      var t = parseFloat($('#lectura-temp').value);
      var h = parseFloat($('#lectura-hum').value);
      var err = $('#lectura-error');
      $('#lectura-temp').removeAttribute('aria-invalid'); $('#lectura-hum').removeAttribute('aria-invalid');
      if (isNaN(t) || t < 0 || t > 45) { err.textContent = 'Ingresa una temperatura entre 0 y 45 °C.'; $('#lectura-temp').setAttribute('aria-invalid', 'true'); $('#lectura-temp').focus(); return; }
      if (isNaN(h) || h < 0 || h > 100) { err.textContent = 'Ingresa una humedad entre 0 y 100 %.'; $('#lectura-hum').setAttribute('aria-invalid', 'true'); $('#lectura-hum').focus(); return; }
      err.textContent = '';
      registrarLectura(parcela(sel.value), t, h);
    });
  }

  function registrarLectura(p, t, h) {
    var nueva = { temp: t, hum: h, fecha: new Date().toISOString() };
    var anterior = p.lectura;
    var riesgo = riesgoAmbiental(nueva);
    var mensajes = [];
    mutar(p, function () {
      p.lecturaAnterior = anterior;
      p.lectura = nueva;
      // HU-015: cambio importante respecto a la medición anterior
      if (anterior && (Math.abs(h - anterior.hum) >= U.cambioHumedad || Math.abs(t - anterior.temp) >= U.cambioTemp)) {
        var partes = [];
        if (Math.abs(h - anterior.hum) >= U.cambioHumedad) partes.push('la humedad pasó de ' + anterior.hum + ' % a ' + h + ' %');
        if (Math.abs(t - anterior.temp) >= U.cambioTemp) partes.push('la temperatura pasó de ' + numeroES(anterior.temp) + ' °C a ' + numeroES(t) + ' °C');
        notificar('agricultor', p.id, 'Cambio importante en ' + p.nombre, capital(partes.join(' y ')) + '.');
        mensajes.push('Se detectó un cambio importante.');
      }
      // HU-003: condiciones de riesgo
      if (riesgo !== 'bajo') {
        var a = p.alertas.filter(function (x) { return x.origen === 'Sensores'; })[0];
        var nota = 'Humedad de ' + h + ' % con ' + numeroES(t) + ' °C';
        if (a) { a.riesgo = riesgo; a.fecha = nueva.fecha; a.registros.push({ fecha: nueva.fecha, riesgo: riesgo, nota: nota }); }
        else {
          p.alertas.push({ id: uid('al'), tipo: 'Clima favorable para roya', origen: 'Sensores', riesgo: riesgo, fecha: nueva.fecha, atendida: false, zona: null, registros: [{ fecha: nueva.fecha, riesgo: riesgo, nota: nota }], acciones: [] });
        }
        notificar('agricultor', p.id, 'Clima favorable para roya en ' + p.nombre,
          'Condición: humedad de ' + h + ' % y temperatura de ' + numeroES(t) + ' °C (riesgo ' + riesgo + '). Estas condiciones favorecen la roya amarilla.');
        mensajes.push('Condiciones de riesgo ' + riesgo + ': se envió una alerta.');
      } else {
        mensajes.push('Condiciones dentro del rango seguro. No se generó ninguna alerta; el clima de la parcela está normal.');
      }
    });
    $('#lectura-error').textContent = '';
    renderTodo();
    toast(p.nombre + ': ' + mensajes.join(' '));
  }

  function renderNotificaciones(rol, sel) {
    var lista = datos.notificaciones.filter(function (n) { return n.rol === rol; });
    var ul = $(sel);
    if (!lista.length) { ul.innerHTML = '<li class="empty">No tienes notificaciones.</li>'; }
    else {
      ul.innerHTML = lista.slice(0, 6).map(function (n) {
        var p = parcela(n.parcelaId);
        return '<li class="notif" data-notif="' + n.id + '"><div><p class="notif-title">' + esc(n.titulo) + '</p><p>' + esc(n.texto) + '</p><p class="small muted"><time datetime="' + n.fecha + '">' + fecha(n.fecha) + '</time></p></div>' +
          '<button type="button" class="btn btn-secondary btn-sm" data-abrir-ficha="' + n.parcelaId + '" data-rol="' + rol + '">Ver ' + esc(p ? p.nombre : 'parcela') + '</button></li>';
      }).join('');
    }
    if (rol === 'agricultor') {
      var c = $('#notif-count'); c.textContent = lista.length; c.setAttribute('aria-label', lista.length + ' notificaciones');
    }
  }

  /* ------------------------------------------------------------------
     AGRICULTOR · Mis parcelas (HU-006, HU-005, HU-014)
     ------------------------------------------------------------------ */
  function renderParcelasAgricultor() {
    $('#parcelas-agricultor').innerHTML = parcelasAgricultor().map(function (p) {
      var r = riesgoParcela(p);
      return '<li><button type="button" class="parcel-card parcel-' + r + '" data-abrir-ficha="' + p.id + '" data-rol="agricultor">' +
        '<span class="parcel-name">' + esc(p.nombre) + '</span>' +
        '<span class="parcel-meta">' + numeroES(p.hectareas) + ' ha · ' + esc(p.variedad) + '</span>' +
        badgeRiesgo(r) + badgeEstado(estadoParcela(p)) +
        '<span class="parcel-clima">' + numeroES(p.lectura.temp) + ' °C · ' + p.lectura.hum + ' % humedad</span>' +
        '<span class="parcel-link">Ver detalle <span aria-hidden="true">→</span></span></button></li>';
    }).join('');
  }

  /* ------------------------------------------------------------------
     TÉCNICO (HU-017, HU-018, HU-027, HU-030)
     ------------------------------------------------------------------ */
  function parcelasTecnico() { return datos.parcelas.filter(function (p) { return p.tecnico; }); }

  function ordenar(lista, criterio) {
    var l = lista.slice();
    if (criterio === 'riesgo') {
      l.sort(function (a, b) { return (ORDEN_RIESGO[riesgoParcela(b)] - ORDEN_RIESGO[riesgoParcela(a)]) || (ultimaAlerta(b) - ultimaAlerta(a)); });
    } else if (criterio === 'actualizacion') {
      l.sort(function (a, b) { return new Date(b.actualizada) - new Date(a.actualizada); });
    } else {
      l.sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
    }
    return l;
  }
  function coincide(p, q) {
    if (!q) return true;
    var t = (p.nombre + ' ' + productor(p.productorId).nombre).toLowerCase();
    return t.indexOf(q.toLowerCase()) !== -1;
  }
  function filaFecha(p) {
    return '<time datetime="' + p.actualizada + '">' + fecha(p.actualizada) + '</time>' + (desactualizada(p) ? ' <span class="tag tag-warn" data-desactualizada>Desactualizada</span>' : '');
  }

  function renderTecnico() {
    var todas = parcelasTecnico();
    $('#tecnico-vacio').hidden = todas.length > 0;
    $('#tabla-tecnico').closest('.table-wrap').hidden = todas.length === 0;
    var lista = ordenar(todas.filter(function (p) { return coincide(p, ui.busquedaTecnico); }), ui.ordenTecnico);
    $('#orden-tecnico').value = ui.ordenTecnico;
    $('#tabla-tecnico tbody').innerHTML = lista.map(function (p) {
      var r = riesgoParcela(p);
      return '<tr class="row-' + r + '" data-parcela="' + p.id + '">' +
        '<th scope="row" data-label="Parcela">' + esc(p.nombre) + '</th>' +
        '<td data-label="Productor">' + esc(productor(p.productorId).nombre) + '</td>' +
        '<td data-label="Estado">' + badgeEstado(estadoParcela(p)) + '</td>' +
        '<td data-label="Riesgo">' + badgeRiesgo(r) + '</td>' +
        '<td data-label="Actualización">' + filaFecha(p) + '</td>' +
        '<td><button type="button" class="btn btn-secondary btn-sm" data-abrir-ficha="' + p.id + '" data-rol="tecnico">Ver ficha<span class="sr-only"> de ' + esc(p.nombre) + '</span></button></td></tr>';
    }).join('');
    renderVisitas(todas);
  }

  function renderVisitas(todas) {
    var urgentes = [], observacion = [];
    todas.forEach(function (p) {
      var pendientes = p.alertas.filter(function (a) { return a.riesgo === 'alto' && !a.atendida; });
      if (pendientes.length) urgentes.push({ p: p, a: pendientes[0] });
      else if (riesgoParcela(p) === 'medio') observacion.push(p);
    });
    var box = $('#visitas-pendientes');
    if (!urgentes.length) {
      box.innerHTML = '<p class="empty" data-sin-visitas>No hay visitas urgentes por realizar.</p>';
    } else {
      box.innerHTML = '<ul class="visit-list" role="list">' + urgentes.map(function (u) {
        var pr = productor(u.p.productorId);
        return '<li class="visit" data-visita="' + u.p.id + '">' + badgeRiesgo('alto') +
          '<div><p class="visit-title">' + esc(u.p.nombre) + ' · ' + esc(pr.nombre) + '</p>' +
          '<p><strong>Motivo:</strong> ' + esc(u.a.tipo) + ' de riesgo alto sin atender (' + hace(u.a.fecha) + ').' + (u.a.zona ? ' Zona: ' + esc(u.a.zona.nombre) + '.' : '') + '</p></div>' +
          '<button type="button" class="btn btn-primary btn-sm" data-abrir-ficha="' + u.p.id + '" data-rol="tecnico">Ver ficha</button></li>';
      }).join('') + '</ul>';
    }
    if (observacion.length) {
      box.innerHTML += '<p class="small muted" data-en-observacion>Pueden seguir en observación: ' + observacion.map(function (p) { return esc(p.nombre) + ' (' + esc(motivo(p)) + ')'; }).join('; ') + '.</p>';
    }
  }

  function initTecnico() {
    $('#orden-tecnico').addEventListener('change', function (e) {
      ui.ordenTecnico = e.target.value;
      try { sessionStorage.setItem('cafesync-orden', ui.ordenTecnico); } catch (er) { /* noop */ }
      renderTecnico();
    });
    $('#buscar-tecnico').addEventListener('submit', function (e) {
      e.preventDefault();
      ui.busquedaTecnico = $('#buscar-tecnico-input').value.trim();
      var n = parcelasTecnico().filter(function (p) { return coincide(p, ui.busquedaTecnico); }).length;
      $('#buscar-tecnico-msg').textContent = !ui.busquedaTecnico ? '' : (n ? n + ' resultado(s) para "' + ui.busquedaTecnico + '".' : 'No se encontraron resultados para "' + ui.busquedaTecnico + '".');
      renderTecnico();
    });
    $('#buscar-tecnico-input').addEventListener('search', function () {
      if (!this.value) { ui.busquedaTecnico = ''; $('#buscar-tecnico-msg').textContent = ''; renderTecnico(); }
    });
  }

  /* ------------------------------------------------------------------
     COOPERATIVA (HU-033, HU-034, HU-035, HU-036, HU-037, HU-041, HU-044)
     ------------------------------------------------------------------ */
  function renderKpis() {
    var ps = datos.parcelas;
    var altos = ps.filter(function (p) { return riesgoParcela(p) === 'alto'; }).length;
    var alertas = ps.reduce(function (s, p) { return s + p.alertas.length; }, 0);
    var desact = ps.filter(desactualizada).length;
    var items = [
      ['Parcelas afiliadas', ps.length, ''], ['En riesgo alto', altos, 'kpi-alto'],
      ['Alertas activas', alertas, ''], ['Sin actualizar (+7 días)', desact, 'kpi-warn']
    ];
    $('#kpis').innerHTML = items.map(function (k) { return '<li class="kpi ' + k[2] + '"><span class="kpi-value">' + k[1] + '</span><span class="kpi-label">' + k[0] + '</span></li>'; }).join('');
  }

  function renderCooperativa() {
    renderKpis();
    renderNotificaciones('cooperativa', '#notif-cooperativa');
    var todas = datos.parcelas;
    $('#cooperativa-vacio').hidden = todas.length > 0;
    var lista = ordenar(todas, 'riesgo').filter(function (p) { return ui.filtroRiesgo === 'todos' || riesgoParcela(p) === ui.filtroRiesgo; });
    $all('[data-filtro-riesgo]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-filtro-riesgo') === ui.filtroRiesgo)); });
    var msg = $('#afiliadas-filtro-msg');
    if (todas.length && !lista.length) msg.innerHTML = '<span data-sin-resultados>No hay parcelas con riesgo ' + ui.filtroRiesgo + '.</span>';
    else msg.textContent = ui.filtroRiesgo === 'todos' ? '' : 'Mostrando ' + lista.length + ' parcela(s) con riesgo ' + ui.filtroRiesgo + '.';
    $('#tabla-cooperativa tbody').innerHTML = lista.map(function (p) {
      var r = riesgoParcela(p);
      return '<tr class="row-' + r + '" data-parcela="' + p.id + '">' +
        '<th scope="row" data-label="Parcela">' + esc(p.nombre) + '</th>' +
        '<td data-label="Productor">' + esc(productor(p.productorId).nombre) + '</td>' +
        '<td data-label="Estado">' + badgeEstado(estadoParcela(p)) + '</td>' +
        '<td data-label="Riesgo">' + badgeRiesgo(r) + '</td>' +
        '<td data-label="Motivo">' + esc(motivo(p)) + '</td>' +
        '<td data-label="Actualización">' + filaFecha(p) + '</td>' +
        '<td><button type="button" class="btn btn-secondary btn-sm" data-abrir-ficha="' + p.id + '" data-rol="cooperativa">Ver detalle<span class="sr-only"> de ' + esc(p.nombre) + '</span></button></td></tr>';
    }).join('');
    $('#tabla-cooperativa').closest('.table-wrap').hidden = lista.length === 0;
    renderAlertasCoop();
    renderProductoresRiesgo();
  }

  function renderAlertasCoop() {
    var fp = $('#f-alerta-productor'), fpa = $('#f-alerta-parcela'), fr = $('#f-alerta-riesgo');
    var vp = fp.value, vpa = fpa.value;
    fp.innerHTML = '<option value="">Todos</option>' + datos.productores.map(function (p) { return '<option value="' + p.id + '">' + esc(p.nombre) + '</option>'; }).join('');
    fpa.innerHTML = '<option value="">Todas</option>' + datos.parcelas.map(function (p) { return '<option value="' + p.id + '">' + esc(p.nombre) + '</option>'; }).join('');
    fp.value = vp; fpa.value = vpa;
    var items = [];
    datos.parcelas.forEach(function (p) {
      p.alertas.forEach(function (a) { items.push({ p: p, a: a }); });
    });
    items = items.filter(function (it) {
      return (!fp.value || it.p.productorId === fp.value) && (!fpa.value || it.p.id === fpa.value) && (!fr.value || it.a.riesgo === fr.value);
    }).sort(function (x, y) { return new Date(y.a.fecha) - new Date(x.a.fecha); });
    $('#alertas-cooperativa').innerHTML = items.length ? items.map(function (it) {
      return '<li class="alert-item" data-alerta="' + it.a.id + '">' + badgeRiesgo(it.a.riesgo) +
        '<div><p class="alert-title">' + esc(it.a.tipo) + '</p><p class="small">' + esc(productor(it.p.productorId).nombre) + ' · ' + esc(it.p.nombre) + ' · <time datetime="' + it.a.fecha + '">' + fecha(it.a.fecha) + '</time></p></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-abrir-ficha="' + it.p.id + '" data-rol="cooperativa">Ver<span class="sr-only"> parcela ' + esc(it.p.nombre) + '</span></button></li>';
    }).join('') : '<li class="empty" data-sin-alertas>No hay alertas que coincidan con el filtro.</li>';
  }

  function productoresEnRiesgo() {
    return datos.productores.map(function (pr) {
      var ps = datos.parcelas.filter(function (p) { return p.productorId === pr.id && riesgoParcela(p) !== 'bajo'; });
      return { pr: pr, ps: ps, max: maxRiesgo(ps.map(riesgoParcela)) };
    }).filter(function (x) { return x.ps.length; })
      .sort(function (a, b) { return ORDEN_RIESGO[b.max] - ORDEN_RIESGO[a.max] || b.ps.length - a.ps.length; });
  }
  function renderProductoresRiesgo() {
    var l = productoresEnRiesgo();
    $('#productores-riesgo').innerHTML = l.length ? l.map(function (x) {
      return '<li class="producer" data-productor="' + x.pr.id + '"><div><p class="alert-title">' + esc(x.pr.nombre) + '</p><p class="small">' + x.ps.length + ' parcela(s) en riesgo · nivel más alto: ' + x.max + '</p></div>' +
        badgeRiesgo(x.max) + '<button type="button" class="btn btn-secondary btn-sm" data-ver-productor="' + x.pr.id + '" data-solo-riesgo="1">Ver parcelas en riesgo<span class="sr-only"> de ' + esc(x.pr.nombre) + '</span></button></li>';
    }).join('') : '<li class="empty" data-sin-productores>No hay productores con parcelas en riesgo.</li>';
  }

  function renderProductor(id, soloRiesgo) {
    var pr = productor(id);
    var ps = datos.parcelas.filter(function (p) { return p.productorId === id && (!soloRiesgo || riesgoParcela(p) !== 'bajo'); });
    var alertas = [], hist = [];
    ps.forEach(function (p) {
      p.alertas.forEach(function (a) { alertas.push(a.tipo + ' · ' + p.nombre + ' · riesgo ' + a.riesgo); });
      p.historial.forEach(function (h) { hist.push({ t: h.tipo + ' · ' + p.nombre, f: h.fecha, e: h.estado }); });
    });
    hist.sort(function (a, b) { return new Date(b.f) - new Date(a.f); });
    var box = $('#productor-detalle');
    box.innerHTML = '<article class="producer-detail" data-detalle-productor="' + id + '"><h4>' + esc(pr.nombre) + '</h4>' +
      '<p class="small muted">' + esc(pr.ubicacion) + ' · Tel. ' + esc(pr.telefono) + ' · Afiliado desde ' + esc(pr.afiliadoDesde) + '</p>' +
      '<h5>' + (soloRiesgo ? 'Parcelas en riesgo' : 'Parcelas') + '</h5><ul class="mini-list">' + ps.map(function (p) {
        return '<li>' + esc(p.nombre) + ' ' + badgeRiesgo(riesgoParcela(p)) + ' ' + badgeEstado(estadoParcela(p)) + ' <button type="button" class="btn btn-ghost btn-sm" data-abrir-ficha="' + p.id + '" data-rol="cooperativa">Ver detalle<span class="sr-only"> de ' + esc(p.nombre) + '</span></button></li>';
      }).join('') + '</ul>' +
      '<h5>Alertas activas</h5>' + (alertas.length ? '<ul class="mini-list">' + alertas.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '<p class="small muted">Sin alertas activas.</p>') +
      '<h5>Historial</h5>' + (hist.length ? '<ul class="mini-list">' + hist.map(function (h) { return '<li>' + esc(h.t) + ' · ' + dia(h.f) + ' · ' + esc(h.e) + '</li>'; }).join('') + '</ul>' : '<p class="small muted">Sin registros.</p>') +
      '</article>';
    box.focus();
  }

  function initCooperativa() {
    $all('[data-filtro-riesgo]').forEach(function (b) {
      b.addEventListener('click', function () { ui.filtroRiesgo = b.getAttribute('data-filtro-riesgo'); renderCooperativa(); });
    });
    ['#f-alerta-productor', '#f-alerta-parcela', '#f-alerta-riesgo'].forEach(function (s) { $(s).addEventListener('change', renderAlertasCoop); });
    $('#buscar-coop').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = $('#buscar-coop-input').value.trim().toLowerCase();
      var msg = $('#buscar-coop-msg');
      if (!q) { msg.textContent = 'Escribe el nombre de un productor o de una parcela.'; return; }
      var pr = datos.productores.filter(function (p) { return p.nombre.toLowerCase().indexOf(q) !== -1; })[0];
      if (!pr) {
        var pa = datos.parcelas.filter(function (p) { return p.nombre.toLowerCase().indexOf(q) !== -1; })[0];
        if (pa) pr = productor(pa.productorId);
      }
      if (!pr) { msg.textContent = 'No se encontraron resultados para "' + $('#buscar-coop-input').value.trim() + '".'; $('#productor-detalle').innerHTML = ''; return; }
      msg.textContent = 'Resultado: ' + pr.nombre + '.';
      renderProductor(pr.id, false);
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ver-productor]');
      if (b) renderProductor(b.getAttribute('data-ver-productor'), b.getAttribute('data-solo-riesgo') === '1');
    });
  }

  /* ------------------------------------------------------------------
     FICHA DE PARCELA (diálogo)
     HU-005, HU-007, HU-009, HU-010, HU-012, HU-014 (agricultor)
     HU-019, HU-020, HU-023, HU-024, HU-025, HU-030 (técnico) · HU-037 (cooperativa)
     ------------------------------------------------------------------ */
  var ultimoFoco = null;
  function abrirFicha(id, rol) {
    ui.fichaId = id; ui.fichaRol = rol;
    var dlg = $('#ficha');
    renderFicha();
    if (!dlg.open) { ultimoFoco = document.activeElement; dlg.showModal(); }
    $('#ficha-titulo').focus();
  }
  function cerrarFicha() {
    var dlg = $('#ficha');
    if (dlg.open) dlg.close();
  }

  function htmlClima(p, rol) {
    if (lecturaVencida(p)) {
      return '<div class="clima clima-sin-datos" data-clima="sin-datos"><p><strong>No hay datos actualizados</strong> de los sensores.</p><p class="small">Última medición registrada: <time datetime="' + p.lectura.fecha + '">' + fecha(p.lectura.fecha) + '</time>.</p></div>';
    }
    var r = riesgoAmbiental(p.lectura);
    var favorable = r !== 'bajo';
    return '<div class="clima' + (favorable ? ' clima-riesgo' : '') + '" data-clima="' + (favorable ? 'riesgo' : 'normal') + '">' +
      '<div class="clima-vals"><p><span class="clima-num">' + numeroES(p.lectura.temp) + ' °C</span><span class="small">Temperatura</span></p>' +
      '<p><span class="clima-num">' + p.lectura.hum + ' %</span><span class="small">Humedad</span></p></div>' +
      '<p class="small">Última medición: <time datetime="' + p.lectura.fecha + '">' + fecha(p.lectura.fecha) + '</time></p>' +
      (favorable ? '<p class="clima-msg">' + ICONOS.alto + ' Rango de riesgo: ' + (rol === 'agricultor' ? 'estas condiciones favorecen la roya.' : 'condiciones favorables para la aparición de plagas (roya).') + '</p>'
        : '<p class="clima-msg ok">' + ICONOS.bajo + ' Rango normal para el cultivo.</p>') + '</div>';
  }

  function svgParcela(zona) {
    return '<svg class="mapa-parcela" viewBox="0 0 100 100" role="img" aria-label="Esquema de la parcela con la zona afectada resaltada: ' + esc(zona.nombre) + '">' +
      '<rect x="2" y="2" width="96" height="96" rx="6" fill="#E3F2E4" stroke="#2E7D32" stroke-width="1.5"/>' +
      '<path d="M2 40 Q50 30 98 45" stroke="#A5D6A7" stroke-width="1" fill="none"/><path d="M2 70 Q50 60 98 75" stroke="#A5D6A7" stroke-width="1" fill="none"/>' +
      '<circle cx="' + zona.x + '" cy="' + zona.y + '" r="' + zona.r + '" fill="rgba(229,57,53,.35)" stroke="#B71C1C" stroke-width="1.5" stroke-dasharray="3 2"/>' +
      '<circle cx="' + zona.x + '" cy="' + zona.y + '" r="2.5" fill="#B71C1C"/></svg>';
  }

  function tendencia(regs) {
    if (regs.length < 2) return null;
    var a = ORDEN_RIESGO[regs[regs.length - 2].riesgo], b = ORDEN_RIESGO[regs[regs.length - 1].riesgo];
    return b > a ? 'aumentando' : (b < a ? 'disminuyendo' : 'se mantiene');
  }

  function htmlAlertaAgricultor(a) {
    var h = '<li class="alert-card" data-alerta="' + a.id + '"><div class="alert-card-head">' + badgeRiesgo(a.riesgo) +
      '<p class="alert-title">' + esc(a.tipo) + '</p><p class="small muted">' + esc(a.origen) + ' · <time datetime="' + a.fecha + '">' + fecha(a.fecha) + '</time></p></div>' +
      '<div class="btn-row">' +
      '<button type="button" class="btn btn-secondary btn-sm" data-alerta-accion="ubicacion" aria-expanded="false">Ver ubicación</button>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-alerta-accion="evolucion" aria-expanded="false">Ver evolución</button>' +
      '<button type="button" class="btn btn-primary btn-sm" data-alerta-accion="accion" aria-expanded="false">Registrar acción</button></div>' +
      '<div class="subpanel" data-sub="ubicacion" hidden></div><div class="subpanel" data-sub="evolucion" hidden></div><div class="subpanel" data-sub="accion" hidden></div>';
    if (a.acciones.length) {
      h += '<div class="acciones-alerta"><p class="small"><strong>Acciones registradas</strong></p><ul class="mini-list">' + a.acciones.map(function (x) {
        return '<li>' + esc(x.tipo) + ' · ' + dia(x.fecha) + (x.detalle ? ' · ' + esc(x.detalle) : '') + '</li>';
      }).join('') + '</ul></div>';
    }
    return h + '</li>';
  }

  function htmlEvolucion(a) {
    var regs = a.registros.slice().sort(function (x, y) { return new Date(x.fecha) - new Date(y.fecha); });
    var h = '<ol class="timeline">' + regs.map(function (r) {
      return '<li><time datetime="' + r.fecha + '">' + dia(r.fecha) + '</time> ' + badgeRiesgo(r.riesgo) + ' <span>' + esc(r.nota) + '</span></li>';
    }).join('') + '</ol>';
    var t = tendencia(regs);
    if (!t) {
      h += '<p class="callout" data-tendencia="sin-datos">Solo hay un registro. Se necesitan más datos para saber si el problema aumenta o disminuye.</p>';
    } else {
      var primero = regs[0], ultimo = regs[regs.length - 1];
      h += '<p class="callout" data-tendencia="' + t + '">Tendencia: el problema está <strong>' + (t === 'se mantiene' ? 'estable (se mantiene)' : t) + '</strong>.</p>';
      h += '<table class="compare"><caption class="small">Comparación entre registros</caption><thead><tr><th scope="col"></th><th scope="col">Primer registro</th><th scope="col">Último registro</th></tr></thead><tbody>' +
        '<tr><th scope="row">Fecha</th><td>' + dia(primero.fecha) + '</td><td>' + dia(ultimo.fecha) + '</td></tr>' +
        '<tr><th scope="row">Riesgo</th><td>' + badgeRiesgo(primero.riesgo) + '</td><td>' + badgeRiesgo(ultimo.riesgo) + '</td></tr>' +
        '<tr><th scope="row">Observación</th><td>' + esc(primero.nota) + '</td><td>' + esc(ultimo.nota) + '</td></tr></tbody></table>';
    }
    return h;
  }

  function htmlFormAccion(a) {
    return '<form class="form" data-form-accion="' + a.id + '" novalidate>' +
      '<div class="field"><label for="acc-tipo-' + a.id + '">Tipo de acción *</label><select id="acc-tipo-' + a.id + '" name="tipo" aria-describedby="acc-err-' + a.id + '">' +
      '<option value="">Elige una opción</option><option>Poda sanitaria</option><option>Retiro de hojas afectadas</option><option>Aplicación de fungicida</option><option>Consulta al técnico</option><option>Otra</option></select></div>' +
      '<div class="field"><label for="acc-fecha-' + a.id + '">Fecha *</label><input type="date" id="acc-fecha-' + a.id + '" name="fecha" value="' + hoyISO() + '" max="' + hoyISO() + '"></div>' +
      '<div class="field"><label for="acc-det-' + a.id + '">Detalle (opcional)</label><input type="text" id="acc-det-' + a.id + '" name="detalle" maxlength="120"></div>' +
      '<p class="field-error" id="acc-err-' + a.id + '" role="alert"></p>' +
      '<button type="submit" class="btn btn-primary btn-sm">Guardar acción</button></form>';
  }

  function htmlHistorial(p) {
    var hs = p.historial.slice().sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });
    if (!hs.length) return '<p class="empty" data-sin-historial>Aún no hay registros de problemas en esta parcela.</p>';
    return '<ul class="history" role="list">' + hs.map(function (h) {
      return '<li><span>' + esc(h.tipo) + '</span><time datetime="' + h.fecha + '">' + dia(h.fecha) + '</time><span class="tag ' + (h.estado === 'activo' ? 'tag-alert' : 'tag-ok') + '">' + capital(h.estado) + '</span></li>';
    }).join('') + '</ul>';
  }

  function htmlAcciones(p) {
    var as = p.acciones.slice().sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });
    if (!as.length) return '<p class="small muted">No hay acciones registradas.</p>';
    return '<ul class="mini-list">' + as.map(function (x) { return '<li>' + dia(x.fecha) + ' · ' + esc(x.tipo) + (x.detalle ? ': ' + esc(x.detalle) : '') + ' <span class="muted">(' + esc(x.autor) + ')</span></li>'; }).join('') + '</ul>';
  }

  function htmlFormInspeccion(p) {
    var plagas = Object.keys(D.CATALOGO).map(function (k) { return '<option value="' + k + '">' + esc(D.CATALOGO[k].nombre.replace('Posible ', '')) + '</option>'; }).join('');
    return '<form class="form inspection" id="form-inspeccion" novalidate>' +
      '<div class="error-summary" id="insp-errores" role="alert" tabindex="-1" hidden></div>' +
      '<div class="field-row"><div class="field"><label for="insp-fecha">Fecha de inspección *</label><input type="date" id="insp-fecha" value="' + hoyISO() + '" max="' + hoyISO() + '"></div></div>' +
      '<fieldset class="field"><legend>Estado observado *</legend><div class="radio-row">' +
      '<label><input type="radio" name="insp-estado" value="normal"> Normal, sin síntomas</label>' +
      '<label><input type="radio" name="insp-estado" value="observacion"> Síntomas leves (en observación)</label>' +
      '<label><input type="radio" name="insp-estado" value="alerta"> Problema activo</label></div></fieldset>' +
      '<div class="field"><label for="insp-resultado">Resultado de la inspección</label><textarea id="insp-resultado" rows="2" maxlength="300" placeholder="Ej.: Se revisaron 40 plantas del lote alto"></textarea></div>' +
      '<div class="field check"><label><input type="checkbox" id="insp-problema" aria-controls="insp-problema-campos" aria-expanded="false"> Se identificó una plaga o enfermedad</label></div>' +
      '<fieldset id="insp-problema-campos" class="subfieldset" hidden><legend>Problema identificado</legend>' +
      '<div class="field"><label for="insp-plaga">Plaga o enfermedad (catálogo) *</label><select id="insp-plaga"><option value="">Elige del catálogo</option>' + plagas + '</select></div>' +
      '<fieldset class="field"><legend>Nivel de gravedad *</legend><div class="radio-row">' +
      '<label><input type="radio" name="insp-gravedad" value="bajo"> Bajo</label><label><input type="radio" name="insp-gravedad" value="medio"> Medio</label><label><input type="radio" name="insp-gravedad" value="alto"> Alto</label></div></fieldset>' +
      '<div class="field"><label for="insp-desc">Descripción del problema</label><textarea id="insp-desc" rows="2" maxlength="300"></textarea></div>' +
      '<div class="field"><label for="insp-fotos">Fotografías (opcional)</label><input type="file" id="insp-fotos" accept="image/*" multiple></div>' +
      '</fieldset>' +
      '<button type="submit" class="btn btn-primary">Guardar inspección</button>' +
      '<div class="status" id="insp-ok" role="status" aria-live="polite"></div></form>';
  }

  function renderFicha() {
    var p = parcela(ui.fichaId); if (!p) return;
    var rol = ui.fichaRol;
    var pr = productor(p.productorId);
    var est = estadoParcela(p), r = riesgoParcela(p);
    $('#ficha-titulo').textContent = 'Parcela ' + p.nombre;
    $('#ficha-titulo').setAttribute('tabindex', '-1');
    var h = '';
    if (rol !== 'agricultor') {
      h += '<section class="ficha-sec" aria-label="Productor y parcela"><div class="ficha-datos">' +
        '<p><strong>Productor:</strong> ' + esc(pr.nombre) + ' · Tel. ' + esc(pr.telefono) + '</p>' +
        '<p><strong>Ubicación:</strong> ' + esc(pr.ubicacion) + ' · ' + numeroES(p.hectareas) + ' ha · ' + esc(p.variedad) + '</p></div></section>';
    }
    h += '<section class="ficha-sec" aria-labelledby="sec-estado"><h3 id="sec-estado">Estado de la parcela</h3>' +
      '<p class="ficha-estado">' + badgeEstado(est) + ' ' + badgeRiesgo(r) + '</p>' +
      '<p class="small">Última actualización: <time datetime="' + p.actualizada + '" data-ultima-actualizacion>' + fecha(p.actualizada) + '</time>' +
      (desactualizada(p) ? ' <span class="tag tag-warn" data-desactualizada>Información desactualizada (más de ' + U.diasDesactualizada + ' días sin registros)</span>' : '') + '</p>' +
      (p.alertas.length ? '<p class="small"><strong>Problemas activos:</strong></p><ul class="mini-list" data-problemas-activos>' + p.alertas.map(function (a) { return '<li>' + esc(a.tipo) + ' · riesgo ' + a.riesgo + '</li>'; }).join('') + '</ul>'
        : '<p class="small" data-sin-problemas>Sin problemas activos.</p>') + '</section>';
    h += '<section class="ficha-sec" aria-labelledby="sec-clima"><h3 id="sec-clima">Condiciones ambientales</h3>' + htmlClima(p, rol) + '</section>';
    h += '<section class="ficha-sec" aria-labelledby="sec-alertas"><h3 id="sec-alertas">Alertas activas</h3>';
    if (!p.alertas.length) h += '<p class="empty" data-sin-alertas>No existen alertas activas en esta parcela.</p>';
    else if (rol === 'agricultor') h += '<ul class="alert-cards" role="list">' + p.alertas.map(htmlAlertaAgricultor).join('') + '</ul>';
    else h += '<ul class="alert-list" role="list">' + p.alertas.map(function (a) {
      return '<li class="alert-item" data-alerta="' + a.id + '">' + badgeRiesgo(a.riesgo) + '<div><p class="alert-title">' + esc(a.tipo) + '</p><p class="small">' + esc(a.origen) + ' · detectada <time datetime="' + a.fecha + '">' + fecha(a.fecha) + '</time>' + (a.zona ? ' · ' + esc(a.zona.nombre) : '') + '</p></div></li>';
    }).join('') + '</ul>';
    h += '</section>';
    h += '<section class="ficha-sec" aria-labelledby="sec-hist"><h3 id="sec-hist">Historial de problemas</h3>' + htmlHistorial(p) + '</section>';
    if (rol !== 'agricultor') {
      h += '<section class="ficha-sec" aria-labelledby="sec-acc"><h3 id="sec-acc">Acciones registradas</h3>' + htmlAcciones(p) + '</section>';
    }
    if (rol === 'tecnico') {
      h += '<section class="ficha-sec" aria-labelledby="sec-insp"><h3 id="sec-insp">Registrar inspección</h3>' + htmlFormInspeccion(p) + '</section>';
    }
    $('#ficha-cuerpo').innerHTML = h;
  }

  function initFicha() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-abrir-ficha]');
      if (b) abrirFicha(b.getAttribute('data-abrir-ficha'), b.getAttribute('data-rol'));
    });
    $('#ficha-cerrar').addEventListener('click', cerrarFicha);
    $('#ficha').addEventListener('close', function () { if (ultimoFoco && ultimoFoco.focus && document.contains(ultimoFoco)) ultimoFoco.focus(); });
    $('#ficha').addEventListener('click', function (e) { if (e.target === this) cerrarFicha(); });

    var cuerpo = $('#ficha-cuerpo');
    cuerpo.addEventListener('click', function (e) {
      var b = e.target.closest('[data-alerta-accion]');
      if (!b) return;
      var li = b.closest('[data-alerta]');
      var p = parcela(ui.fichaId);
      var a = p.alertas.filter(function (x) { return x.id === li.getAttribute('data-alerta'); })[0];
      var tipo = b.getAttribute('data-alerta-accion');
      var sub = li.querySelector('[data-sub="' + tipo + '"]');
      var abrir = sub.hidden;
      if (abrir) {
        if (tipo === 'ubicacion') sub.innerHTML = a.zona ? '<figure>' + svgParcela(a.zona) + '<figcaption class="small">Zona afectada: <strong>' + esc(a.zona.nombre) + '</strong></figcaption></figure>'
          : '<p class="callout" data-sin-ubicacion>Esta alerta no tiene una ubicación registrada dentro de la parcela.</p>';
        if (tipo === 'evolucion') sub.innerHTML = htmlEvolucion(a);
        if (tipo === 'accion') sub.innerHTML = htmlFormAccion(a);
      }
      sub.hidden = !abrir;
      b.setAttribute('aria-expanded', String(abrir));
      if (abrir && tipo === 'accion') sub.querySelector('select').focus();
    });

    cuerpo.addEventListener('change', function (e) {
      if (e.target.id === 'insp-problema') {
        $('#insp-problema-campos').hidden = !e.target.checked;
        e.target.setAttribute('aria-expanded', String(e.target.checked));
      }
    });

    cuerpo.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      if (f.hasAttribute('data-form-accion')) guardarAccion(f);
      if (f.id === 'form-inspeccion') guardarInspeccion(f);
    });
  }

  /* HU-012 */
  function guardarAccion(f) {
    var p = parcela(ui.fichaId);
    var aid = f.getAttribute('data-form-accion');
    var a = p.alertas.filter(function (x) { return x.id === aid; })[0];
    var tipo = f.tipo.value, fch = f.fecha.value, det = f.detalle.value.trim();
    var err = f.querySelector('.field-error');
    f.tipo.removeAttribute('aria-invalid'); f.fecha.removeAttribute('aria-invalid');
    if (!tipo) { err.textContent = 'Falta indicar el tipo de acción realizada.'; f.tipo.setAttribute('aria-invalid', 'true'); f.tipo.focus(); return; }
    if (!fch) { err.textContent = 'Falta indicar la fecha de la acción.'; f.fecha.setAttribute('aria-invalid', 'true'); f.fecha.focus(); return; }
    var iso = new Date(fch + 'T12:00:00').toISOString();
    mutar(p, function () {
      a.acciones.push({ tipo: tipo, fecha: iso, detalle: det });
      p.acciones.push({ tipo: tipo, fecha: iso, detalle: det + (det ? ' ' : '') + '(alerta: ' + a.tipo + ')', autor: 'Rosa Cárdenas' });
      a.atendida = true;
    });
    renderTodo();
    toast('Acción guardada en la alerta "' + a.tipo + '".');
  }

  /* HU-023, HU-024, HU-025 */
  function guardarInspeccion(f) {
    var p = parcela(ui.fichaId);
    var errores = [];
    var fch = $('#insp-fecha').value;
    var est = f.querySelector('input[name="insp-estado"]:checked');
    var conProblema = $('#insp-problema').checked;
    var plaga = $('#insp-plaga').value;
    var grav = f.querySelector('input[name="insp-gravedad"]:checked');
    $all('[aria-invalid]', f).forEach(function (x) { x.removeAttribute('aria-invalid'); });
    if (!fch) { errores.push(['insp-fecha', 'Indica la fecha de la inspección.']); }
    if (!est) { errores.push(['insp-estado', 'Falta el estado observado de la parcela.']); }
    if (est && est.value === 'alerta' && !conProblema) { errores.push(['insp-problema', 'Si hay un problema activo, marca "Se identificó una plaga o enfermedad" y complétalo.']); }
    if (conProblema && !plaga) { errores.push(['insp-plaga', 'Debes seleccionar la plaga o enfermedad identificada.']); }
    if (conProblema && !grav) { errores.push(['insp-gravedad', 'Debes seleccionar un nivel de gravedad.']); }
    var box = $('#insp-errores');
    if (errores.length) {
      box.innerHTML = '<p><strong>No se guardó la inspección.</strong> Revisa:</p><ul>' + errores.map(function (x) {
        var destino = x[0] === 'insp-estado' || x[0] === 'insp-gravedad' ? f.querySelector('input[name="' + x[0] + '"]') : $('#' + x[0]);
        if (destino) destino.setAttribute('aria-invalid', 'true');
        return '<li data-error="' + x[0] + '">' + esc(x[1]) + '</li>';
      }).join('') + '</ul>';
      box.hidden = false;
      box.focus();
      return;
    }
    box.hidden = true;
    var iso = new Date(fch + 'T12:00:00').toISOString();
    var texto = $('#insp-resultado').value.trim();
    var fotos = $('#insp-fotos') ? $('#insp-fotos').files.length : 0;
    mutar(p, function () {
      p.estadoManual = est.value;
      if (est.value === 'normal' && !conProblema) {
        p.alertas.forEach(function (a) {
          p.historial.forEach(function (hh) { if (hh.tipo === a.tipo && hh.estado === 'activo') hh.estado = 'resuelto'; });
        });
        p.alertas = [];
      }
      if (conProblema) {
        var cat = D.CATALOGO[plaga];
        var nombre = cat.nombre.replace('Posible ', '');
        var desc = $('#insp-desc').value.trim();
        p.alertas.push({ id: uid('al'), tipo: nombre, origen: 'Inspección del técnico', riesgo: grav.value, fecha: iso, atendida: false, zona: null,
          registros: [{ fecha: iso, riesgo: grav.value, nota: desc || 'Registrado en inspección' }], acciones: [], fotos: fotos });
        p.historial.push({ tipo: nombre, fecha: iso, estado: 'activo' });
      }
      p.acciones.push({ tipo: 'Inspección', fecha: iso, detalle: ESTADOS[est.value] + (texto ? ' · ' + texto : '') + (conProblema ? ' · ' + D.CATALOGO[plaga].nombre.replace('Posible ', '') + ' (gravedad ' + grav.value + ')' : '') + (fotos ? ' · ' + fotos + ' foto(s)' : ''), autor: 'Ing. Carla Mendoza' });
      p.alertas.forEach(function (a) { a.atendida = true; });
      if (conProblema && grav.value === 'alto') p.alertas[p.alertas.length - 1].atendida = false;
    });
    renderTodo();
    var ok = $('#insp-ok');
    if (ok) {
      ok.innerHTML = '<span data-inspeccion-ok>Inspección guardada. Estado de la parcela: <strong>' + ESTADOS[estadoParcela(p)] + '</strong> · prioridad de intervención: <strong>riesgo ' + riesgoParcela(p) + '</strong>.</span>';
    }
    toast('Inspección guardada en ' + p.nombre + '.');
  }

  /* ------------------------------------------------------------------
     Contacto (formulario de la landing)
     ------------------------------------------------------------------ */
  function initContacto() {
    $('#form-contacto').addEventListener('submit', function (e) {
      e.preventDefault();
      var n = $('#c-nombre'), c = $('#c-correo'), ok = true;
      [n, c].forEach(function (x) { x.removeAttribute('aria-invalid'); $('#' + x.id + '-error').textContent = ''; });
      if (n.value.trim().length < 3) { ok = false; n.setAttribute('aria-invalid', 'true'); n.setAttribute('aria-describedby', 'c-nombre-error'); $('#c-nombre-error').textContent = 'Escribe tu nombre y apellido.'; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.value.trim())) { ok = false; c.setAttribute('aria-invalid', 'true'); c.setAttribute('aria-describedby', 'c-correo-error'); $('#c-correo-error').textContent = 'Escribe un correo válido, por ejemplo nombre@correo.com.'; }
      if (!ok) { (n.getAttribute('aria-invalid') ? n : c).focus(); $('#contacto-ok').textContent = ''; return; }
      $('#contacto-ok').textContent = '¡Gracias, ' + n.value.trim().split(' ')[0] + '! Recibimos tu solicitud y te escribiremos a ' + c.value.trim() + '.';
      e.target.reset();
    });
  }

  /* ------------------------------------------------------------------ */
  function renderTodo() {
    renderParcelasAgricultor();
    renderNotificaciones('agricultor', '#notif-agricultor');
    renderTecnico();
    renderCooperativa();
    if ($('#ficha').open) renderFicha();
  }

  function init() {
    cargar();
    initNav();
    initTabs();
    initDiagnostico();
    initResultado();
    initSensores();
    initTecnico();
    initCooperativa();
    initFicha();
    initContacto();
    $('#btn-reset').addEventListener('click', function () {
      try { localStorage.removeItem(CLAVE); sessionStorage.removeItem('cafesync-orden'); } catch (e) { /* noop */ }
      datos = D.crearDatos(); ui.ordenTecnico = 'nombre'; ui.filtroRiesgo = 'todos'; ui.busquedaTecnico = '';
      $('#buscar-tecnico-input').value = ''; $('#buscar-tecnico-msg').textContent = '';
      renderTodo();
      toast('Se restablecieron los datos de ejemplo.');
    });
    renderTodo();
  }

  /* Acceso para pruebas automatizadas (escenarios con conjuntos de datos vacíos) */
  window.CafeSync = {
    get datos() { return datos; },
    set datos(v) { datos = v; renderTodo(); },
    renderTodo: function () { renderTodo(); },
    riesgoParcela: function (id) { return riesgoParcela(parcela(id)); },
    estadoParcela: function (id) { return estadoParcela(parcela(id)); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
