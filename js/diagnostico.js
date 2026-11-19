/* CaféSync · módulo de diagnóstico por foto (demostración).
   El modelo real de visión computacional se entrenará con fotos de hojas de café
   (ver Esgario et al., 2020). Para la landing se usa una estimación por color que
   corre en el navegador: mide la calidad de la foto (luz y nitidez) y la proporción
   de manchas naranjas o marrones sobre la superficie verde de la hoja. */
(function () {
  'use strict';

  var LIMITES = {
    luzMinima: 45,         // luminancia media (0-255) por debajo de la cual la foto está muy oscura
    nitidezMinima: 20,     // varianza del laplaciano por debajo de la cual la foto está borrosa
    hojaMinima: 0.15,      // fracción mínima de la imagen que debe ser hoja
    royaAlta: 0.08, royaMedia: 0.025, royaInicial: 0.003,
    marronMinimo: 0.02
  };

  function cargarImagen(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('No se pudo leer la imagen.')); };
      img.src = src;
    });
  }

  function analizarPixeles(img) {
    var ancho = 200;
    var escala = Math.min(1, ancho / img.naturalWidth);
    var w = Math.max(1, Math.round(img.naturalWidth * escala));
    var h = Math.max(1, Math.round(img.naturalHeight * escala));
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    var d = ctx.getImageData(0, 0, w, h).data;
    var n = w * h;
    var gris = new Float32Array(n);
    var suma = 0, verde = 0, roya = 0, marron = 0;
    for (var i = 0, p = 0; i < n; i++, p += 4) {
      var r = d[p], g = d[p + 1], b = d[p + 2];
      var l = 0.299 * r + 0.587 * g + 0.114 * b;
      gris[i] = l; suma += l;
      if (r > 170 && g > 90 && b < 110 && r > g + 15) roya++;
      else if (r >= 70 && r <= 160 && g >= 35 && g <= 105 && b < 85 && r > g + 15) marron++;
      else if (g > r + 10 && g > b + 10 && g > 60) verde++;
    }
    // Varianza del laplaciano (nitidez)
    var lapSuma = 0, lapSuma2 = 0, m = 0;
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var k = y * w + x;
        var v = gris[k - w] + gris[k + w] + gris[k - 1] + gris[k + 1] - 4 * gris[k];
        lapSuma += v; lapSuma2 += v * v; m++;
      }
    }
    var lapMedia = m ? lapSuma / m : 0;
    var nitidez = m ? lapSuma2 / m - lapMedia * lapMedia : 0;
    var hoja = verde + roya + marron;
    return {
      luz: suma / n,
      nitidez: nitidez,
      fraccionHoja: hoja / n,
      royaRatio: hoja ? roya / hoja : 0,
      marronRatio: hoja ? marron / hoja : 0
    };
  }

  function clasificar(mt) {
    if (mt.luz < LIMITES.luzMinima) {
      return { valida: false, motivo: 'oscura', mensaje: 'La foto está muy oscura. Toma una nueva foto con luz de día, sin sombra sobre la hoja.' };
    }
    if (mt.nitidez < LIMITES.nitidezMinima) {
      return { valida: false, motivo: 'borrosa', mensaje: 'La foto está borrosa. Acércate un poco, mantén el celular quieto y toma una nueva foto.' };
    }
    if (mt.fraccionHoja < LIMITES.hojaMinima) {
      return { valida: true, tipo: 'incierto', riesgo: null, confianza: null };
    }
    var confBase = Math.min(0.25, mt.fraccionHoja / 4);
    if (mt.marronRatio >= LIMITES.marronMinimo && mt.marronRatio > mt.royaRatio) {
      return { valida: true, tipo: 'mancha_hierro', riesgo: 'medio', confianza: Math.round((0.6 + confBase) * 100) };
    }
    if (mt.royaRatio >= LIMITES.royaAlta) {
      return { valida: true, tipo: 'roya', riesgo: 'alto', confianza: Math.round(Math.min(0.95, 0.7 + confBase + mt.royaRatio) * 100) };
    }
    if (mt.royaRatio >= LIMITES.royaMedia) {
      return { valida: true, tipo: 'roya', riesgo: 'medio', confianza: Math.round((0.62 + confBase) * 100) };
    }
    if (mt.royaRatio >= LIMITES.royaInicial) {
      return { valida: true, tipo: 'roya', riesgo: 'bajo', confianza: Math.round((0.55 + confBase) * 100) };
    }
    return { valida: true, tipo: 'sana', riesgo: 'bajo', confianza: Math.round((0.7 + confBase) * 100) };
  }

  function analizar(src) {
    return cargarImagen(src).then(function (img) {
      var mt = analizarPixeles(img);
      var res = clasificar(mt);
      res.metricas = mt;
      return res;
    });
  }

  /* ---------- Fotos de ejemplo dibujadas en el navegador ---------- */
  function rnd(seed) {
    var s = seed;
    return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  function dibujarHoja(ctx, w, h) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.35);
    var grad = ctx.createLinearGradient(-180, 0, 180, 0);
    grad.addColorStop(0, '#2E7D32');
    grad.addColorStop(1, '#43A047');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-200, 0);
    ctx.bezierCurveTo(-120, -130, 120, -130, 200, 0);
    ctx.bezierCurveTo(120, 130, -120, 130, -200, 0);
    ctx.fill();
    ctx.strokeStyle = '#A5D6A7'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-195, 0); ctx.lineTo(195, 0); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#81C784';
    for (var i = -150; i <= 150; i += 50) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.quadraticCurveTo(i + 25, -40, i + 45, -75); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.quadraticCurveTo(i + 25, 40, i + 45, 75); ctx.stroke();
    }
    ctx.restore();
  }

  function manchas(ctx, w, h, cantidad, colores, halo, seed, rMin, rMax) {
    var r = rnd(seed);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.35);
    for (var i = 0; i < cantidad; i++) {
      var x = (r() - 0.5) * 300;
      var y = (r() - 0.5) * 120;
      var rad = rMin + r() * (rMax - rMin);
      if (halo) {
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(x, y, rad * 1.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = colores[i % colores.length];
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function fondo(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#4A524A');
    g.addColorStop(1, '#6A6E68');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function crearMuestra(tipo) {
    var w = 480, h = 360;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    if (tipo === 'nohoja') {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#90CAF9'); g.addColorStop(1, '#E3F2FD');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#B0BEC5';
      ctx.fillRect(40, 220, 120, 140); ctx.fillRect(200, 180, 90, 180); ctx.fillRect(330, 240, 110, 120);
      ctx.fillStyle = '#ECEFF1';
      for (var i = 0; i < 6; i++) { ctx.fillRect(60 + (i % 2) * 50, 240 + Math.floor(i / 2) * 35, 25, 20); }
      return c.toDataURL('image/png');
    }
    fondo(ctx, w, h);
    dibujarHoja(ctx, w, h);
    if (tipo === 'roya' || tipo === 'oscura' || tipo === 'borrosa') {
      manchas(ctx, w, h, 34, ['#E67E22', '#F39C12', '#D35400'], '#F1C40F', 7, 6, 14);
    } else if (tipo === 'inicial') {
      manchas(ctx, w, h, 5, ['#F39C12'], '#F1C40F', 3, 3, 5);
    } else if (tipo === 'marron') {
      manchas(ctx, w, h, 22, ['#5D4037', '#6D4C41'], '#8D6E63', 11, 6, 12);
    }
    if (tipo === 'oscura') {
      ctx.fillStyle = 'rgba(0,0,0,0.86)';
      ctx.fillRect(0, 0, w, h);
    }
    if (tipo === 'borrosa') {
      var c2 = document.createElement('canvas');
      c2.width = w; c2.height = h;
      var ctx2 = c2.getContext('2d');
      ctx2.filter = 'blur(9px)';
      ctx2.drawImage(c, 0, 0);
      return c2.toDataURL('image/png');
    }
    return c.toDataURL('image/png');
  }

  window.CafeSyncDiagnostico = { analizar: analizar, crearMuestra: crearMuestra, LIMITES: LIMITES, clasificar: clasificar };
})();
