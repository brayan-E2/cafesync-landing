"""Pruebas de aceptación de CaféSync (30 HU core).

Cada prueba ejecuta un escenario Gherkin de la HU sobre la landing page en un
navegador real (Chromium) y registra el resultado esperado y el obtenido.

Uso:
    pip install playwright && playwright install chromium
    python tests/acceptance_test.py https://<usuario>.github.io/cafesync-landing/
Si no se indica URL, se prueba http://localhost:8765/index.html
"""
import json
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/index.html'
CHROME = None
for a in sys.argv[2:]:
    if a.startswith('--chrome='):
        CHROME = a.split('=', 1)[1]

RESULTADOS = []


def registrar(pid, hu, esc, accion, esperado, ok, obtenido):
    RESULTADOS.append({'id': pid, 'hu': hu, 'escenario': esc, 'accion': accion,
                       'esperado': esperado, 'obtenido': obtenido,
                       'estado': 'Cumple' if ok else 'No cumple'})
    print(('OK  ' if ok else 'FAIL'), pid, hu, esc, '->', obtenido)


class Ctx:
    def __init__(self, browser, width=1366, height=900):
        self.c = browser.new_context(viewport={'width': width, 'height': height})
        self.p = self.c.new_page()
        self.errores = []
        self.p.on('pageerror', lambda e: self.errores.append(str(e)))
        self.p.goto(URL)
        self.p.wait_for_selector('#parcelas-agricultor .parcel-card')

    def tab(self, nombre):
        self.p.click('#tab-' + nombre)

    def muestra(self, nombre):
        self.tab('agricultor')
        self.p.click(f'[data-sample="{nombre}"]')
        self.p.wait_for_selector('#preview:not([hidden])')
        self.p.click('#btn-analizar')
        self.p.wait_for_selector('#diag-resultado:not([hidden])')

    def ficha(self, pid, rol):
        self.tab(rol)
        self.p.locator(f'#panel-{rol} [data-abrir-ficha="{pid}"][data-rol="{rol}"]').first.click()
        self.p.wait_for_selector('#ficha[open]')

    def cerrar(self):
        self.p.click('#ficha-cerrar')

    def js(self, code, arg=None):
        return self.p.evaluate(code, arg)

    def txt(self, sel):
        return self.p.locator(sel).first.inner_text()

    def close(self):
        self.c.close()


def inspeccion(c, pid, estado=None, problema=False, plaga=None, gravedad=None, resultado=''):
    c.ficha(pid, 'tecnico')
    p = c.p
    if estado:
        p.check(f'input[name="insp-estado"][value="{estado}"]')
    if resultado:
        p.fill('#insp-resultado', resultado)
    if problema:
        p.check('#insp-problema')
        if plaga:
            p.select_option('#insp-plaga', plaga)
        if gravedad:
            p.check(f'input[name="insp-gravedad"][value="{gravedad}"]')
        p.fill('#insp-desc', 'Manchas naranjas en el envés de 8 plantas')
    p.click('#form-inspeccion button[type="submit"]')
    p.wait_for_timeout(200)


def run(browser):
    n = [0]

    def pid():
        n[0] += 1
        return 'PA-%02d' % n[0]

    # ---------------- HU-001
    c = Ctx(browser)
    acepta = c.js("()=>{const i=document.querySelector('#foto-input');return i.accept+'|'+i.getAttribute('capture')}")
    c.p.click('[data-sample="roya"]')
    prev = c.p.locator('#preview').is_visible()
    c.p.click('#btn-analizar'); c.p.wait_for_selector('#diag-resultado:not([hidden])')
    tit = c.txt('#diag-resultado .result-title')
    registrar(pid(), 'HU-001', 'E1 Foto analizada correctamente (CA01-CA03)',
              'Elegir foto clara de hoja con manchas, revisar vista previa y pulsar "Analizar"',
              'Se muestra vista previa y luego el posible problema identificado',
              acepta == 'image/*|environment' and prev and 'roya' in tit.lower(),
              f'Input acepta cámara/galería ({acepta}); vista previa visible; resultado: "{tit}"')
    c.muestra('borrosa')
    t = c.txt('#diag-resultado p:nth-of-type(2)')
    ok = 'nueva foto' in t.lower() and c.p.locator('[data-resultado="rechazada"]').count() == 1
    c.muestra('oscura')
    t2 = c.txt('#diag-resultado p:nth-of-type(2)')
    registrar(pid(), 'HU-001', 'E2 Foto de baja calidad',
              'Analizar una foto borrosa y luego una foto oscura',
              'No se procesa la imagen y se pide tomar una nueva foto',
              ok and 'oscura' in t2.lower(),
              'Borrosa: "' + t + '" · Oscura: "' + t2 + '"')
    c.close()

    # ---------------- HU-002 / HU-016 / HU-004 / HU-011
    c = Ctx(browser)
    c.muestra('roya')
    r = c.p.locator('#diag-resultado .risk').first
    urg = c.txt('[data-urgencia]')
    cls = r.get_attribute('class')
    registrar(pid(), 'HU-002', 'E1 Riesgo alto identificado (CA01-CA03)',
              'Consultar el resultado del diagnóstico de una hoja con muchas manchas',
              'Riesgo "Alto" en color de alerta, con texto, y sugerencia de intervención inmediata',
              r.inner_text().strip() == 'Riesgo alto' and 'risk-alto' in cls and urg == 'Inmediata' and 'intervén hoy' in c.txt('#diag-resultado').lower(),
              f'Etiqueta "{r.inner_text().strip()}" (clase {cls}); urgencia "{urg}"; acción sugerida de intervenir hoy')
    c.p.click('[data-accion="recomendaciones"]')
    reco = c.txt('#diag-reco')
    pasos = c.p.locator('#diag-reco ol li').count()
    registrar(pid(), 'HU-004', 'E1 Recomendaciones disponibles (CA01-CA02)',
              'Pulsar "Ver recomendaciones" tras un diagnóstico de roya',
              'Se muestran pasos recomendados en lenguaje claro',
              pasos >= 3, f'{pasos} pasos numerados; primer paso: "{c.txt("#diag-reco ol li")}"')
    registrar(pid(), 'HU-016', 'E1 Riesgo alto (CA01-CA03)',
              'Consultar recomendaciones con riesgo alto',
              'Urgencia "Inmediata" junto al nivel de riesgo y acciones prioritarias',
              'Inmediata' in reco and c.p.locator('#diag-reco .risk-alto').count() == 1,
              'Recomendaciones muestran "Riesgo alto" y "Urgencia: Inmediata" en la misma vista')
    c.p.click('[data-accion="mas-info"]')
    info = c.txt('#diag-info')
    img_alt = c.p.locator('#diag-info img').get_attribute('alt')
    registrar(pid(), 'HU-011', 'E1 Explicación disponible (CA01-CA03)',
              'Pulsar "Más información" sobre roya amarilla',
              'Explicación sencilla con síntomas, causas e imagen de referencia',
              'Síntomas' in info and 'Causas probables' in info and 'Daño' in info and bool(img_alt),
              'Muestra descripción, síntomas, causas, daño e imagen con texto alternativo')
    c.muestra('inicial')
    r = c.txt('#diag-resultado .risk')
    registrar(pid(), 'HU-002', 'E2 Riesgo bajo identificado',
              'Consultar el diagnóstico de una hoja con pocas manchas',
              'Riesgo "Bajo" y sugerencia de mantener en observación',
              r.strip() == 'Riesgo bajo' and 'observación' in c.txt('#diag-resultado'),
              f'Etiqueta "{r.strip()}"; sugiere mantener la planta en observación')
    c.p.click('[data-accion="recomendaciones"]')
    reco = c.txt('#diag-reco')
    registrar(pid(), 'HU-016', 'E2 Riesgo bajo',
              'Consultar recomendaciones con riesgo bajo',
              'Urgencia "Monitoreo" y seguir observando la planta',
              'Monitoreo' in reco and 'observación' in reco, 'Urgencia "Monitoreo"; recomienda mantener en observación')
    c.muestra('nohoja')
    c.p.click('[data-accion="recomendaciones"]')
    ok = c.p.locator('#diag-reco [data-consultar-tecnico]').count() == 1
    registrar(pid(), 'HU-004', 'E2 Diagnóstico incierto (CA03)',
              'Analizar una foto sin hoja reconocible y pulsar "Ver recomendaciones"',
              'Recomendación general y sugerencia de consultar a un técnico',
              ok and 'No pudimos identificar' in c.txt('#diag-resultado .result-title'),
              'Resultado "No pudimos identificar el problema con seguridad"; recomienda consultar a un técnico')
    c.muestra('marron')
    c.p.click('[data-accion="mas-info"]')
    registrar(pid(), 'HU-011', 'E2 Información no disponible',
              'Pulsar "Más información" sobre un problema sin ficha (mancha de hierro)',
              'Mensaje de información no disponible y sugerencia de consultar a un técnico',
              c.p.locator('#diag-info [data-info-no-disponible]').count() == 1,
              'Mensaje: "' + c.txt('#diag-info').strip()[:90] + '…"')
    c.close()

    # ---------------- HU-003 / HU-015
    c = Ctx(browser)
    c.p.select_option('#lectura-parcela', 'pa3')
    c.p.fill('#lectura-temp', '20'); c.p.fill('#lectura-hum', '72')
    antes = int(c.txt('#notif-count'))
    c.p.click('#form-lectura button[type="submit"]'); c.p.wait_for_timeout(200)
    despues = int(c.txt('#notif-count'))
    est = c.js("()=>CafeSync.estadoParcela('pa3')")
    registrar(pid(), 'HU-003', 'E2 Condiciones normales',
              'Enviar lectura de 20 °C y 72 % en La Esperanza',
              'No se genera alerta y la parcela se mantiene en estado normal',
              antes == despues and est == 'normal' and 'rango seguro' in c.txt('#toast'),
              f'Notificaciones {antes}→{despues}; estado "{est}"; aviso: "{c.txt("#toast")[:80]}…"')
    c.p.fill('#lectura-temp', '22'); c.p.fill('#lectura-hum', '93')
    c.p.click('#form-lectura button[type="submit"]'); c.p.wait_for_timeout(200)
    items = c.p.locator('#notif-agricultor .notif-title').all_inner_texts()
    textos = c.txt('#notif-agricultor')
    registrar(pid(), 'HU-003', 'E1 Condiciones de riesgo detectadas (CA01-CA03)',
              'Enviar lectura de 22 °C y 93 % en La Esperanza',
              'Se envía alerta con la condición de riesgo y la plaga que podría favorecer',
              'Clima favorable para roya en La Esperanza' in items and 'humedad de 93 %' in textos and 'roya amarilla' in textos,
              'Nueva notificación: "Clima favorable para roya en La Esperanza" con humedad, temperatura y roya amarilla')
    registrar(pid(), 'HU-015', 'E1 Cambio importante detectado (CA01-CA02)',
              'Enviar lectura con humedad 21 puntos mayor que la anterior',
              'Notificación que indica qué cambió y en qué parcela',
              'Cambio importante en La Esperanza' in items and 'pasó de 72 % a 93 %' in textos,
              'Notificación "Cambio importante en La Esperanza": la humedad pasó de 72 % a 93 %')
    c.p.locator('#notif-agricultor li', has_text='Cambio importante en La Esperanza').locator('button').click()
    c.p.wait_for_selector('#ficha[open]')
    registrar(pid(), 'HU-015', 'E2 Acceso desde la notificación (CA03)',
              'Pulsar el botón de la notificación',
              'Se abre el detalle de la parcela con la información del cambio',
              c.txt('#ficha-titulo') == 'Parcela La Esperanza' and '93 %' in c.txt('#ficha-cuerpo'),
              f'Se abre "{c.txt("#ficha-titulo")}" con humedad 93 % y alerta de clima')
    c.close()

    # ---------------- HU-006 / HU-005 / HU-007 / HU-014 / HU-009 / HU-010 / HU-012
    c = Ctx(browser)
    cards = c.p.locator('#parcelas-agricultor .parcel-card')
    badges = c.p.locator('#parcelas-agricultor .parcel-card .risk').all_inner_texts()
    registrar(pid(), 'HU-006', 'E1 Vista general de parcelas (CA01-CA02)',
              'Ingresar a "Mis parcelas" del agricultor',
              'Todas las parcelas en una sola vista con indicador de riesgo',
              cards.count() == 3 and len(badges) == 3,
              f'{cards.count()} parcelas con indicador: ' + ', '.join(b.strip() for b in badges))
    cards.first.click(); c.p.wait_for_selector('#ficha[open]')
    registrar(pid(), 'HU-006', 'E2 Acceso al detalle (CA03)',
              'Seleccionar la parcela con riesgo alto (San José)',
              'Se abre el detalle con la información y problemas de la parcela',
              c.txt('#ficha-titulo') == 'Parcela San José' and c.p.locator('[data-problemas-activos] li').count() >= 1,
              f'Se abre "{c.txt("#ficha-titulo")}" con {c.p.locator("[data-problemas-activos] li").count()} problemas activos')
    est = c.p.locator('#ficha-cuerpo [data-estado]').first.inner_text()
    registrar(pid(), 'HU-005', 'E1 Parcela con alertas activas (CA01-CA02)',
              'Ingresar al detalle de San José',
              'Estado "Con alerta" y lista de problemas activos',
              est == 'Con alerta', f'Estado "{est}"; problemas: ' + '; '.join(c.p.locator('[data-problemas-activos] li').all_inner_texts()))
    hist = c.p.locator('#ficha-cuerpo .history li')
    fechas = c.js("()=>[...document.querySelectorAll('#ficha-cuerpo .history time')].map(t=>t.getAttribute('datetime'))")
    ordenado = fechas == sorted(fechas, reverse=True)
    registrar(pid(), 'HU-007', 'E1 Historial con registros (CA01-CA02)',
              'Revisar la sección "Historial de problemas" de San José',
              'Lista de problemas con tipo, fecha y estado, ordenada por fecha',
              hist.count() == 3 and ordenado and c.p.locator('#ficha-cuerpo .history .tag').count() == 3,
              f'{hist.count()} registros ordenados del más reciente al más antiguo, con estado Activo/Resuelto')
    li1 = c.p.locator('[data-alerta="al1"]')
    li1.locator('[data-alerta-accion="ubicacion"]').click()
    ok = li1.locator('svg.mapa-parcela circle').count() == 2
    registrar(pid(), 'HU-009', 'E1 Ubicación disponible (CA01-CA02)',
              'Pulsar "Ver ubicación" en la alerta de roya',
              'Esquema de la parcela con la zona afectada resaltada',
              ok, 'Esquema SVG con zona resaltada: "' + li1.locator('figcaption').inner_text() + '"')
    li2 = c.p.locator('[data-alerta="al2"]')
    li2.locator('[data-alerta-accion="ubicacion"]').click()
    registrar(pid(), 'HU-009', 'E2 Ubicación no disponible (CA03)',
              'Pulsar "Ver ubicación" en la alerta de clima (sin ubicación)',
              'Mensaje de que no hay ubicación registrada',
              li2.locator('[data-sin-ubicacion]').count() == 1, 'Mensaje: "' + li2.locator('[data-sin-ubicacion]').inner_text() + '"')
    li1.locator('[data-alerta-accion="evolucion"]').click()
    tend = li1.locator('[data-tendencia]').get_attribute('data-tendencia')
    registrar(pid(), 'HU-010', 'E1 Alerta con varios registros (CA01-CA03)',
              'Pulsar "Ver evolución" en la alerta de roya (3 registros)',
              'Línea de tiempo, tendencia y comparación entre fechas',
              li1.locator('.timeline li').count() == 3 and tend == 'aumentando' and li1.locator('table.compare').count() == 1,
              f'Línea de tiempo con 3 registros; tendencia "{tend}"; tabla comparativa primer vs. último registro')
    li2.locator('[data-alerta-accion="evolucion"]').click()
    registrar(pid(), 'HU-010', 'E2 Alerta con un solo registro',
              'Pulsar "Ver evolución" en la alerta de clima (1 registro)',
              'Muestra el registro e indica que se necesitan más datos',
              li2.locator('[data-tendencia="sin-datos"]').count() == 1, 'Muestra 1 registro y el mensaje "Se necesitan más datos…"')
    li1.locator('[data-alerta-accion="accion"]').click()
    li1.locator('form button[type="submit"]').click()
    err = li1.locator('.field-error').inner_text()
    n_acc = c.js("()=>CafeSync.datos.parcelas[0].alertas[0].acciones.length")
    registrar(pid(), 'HU-012', 'E2 Datos incompletos (CA02)',
              'Pulsar "Guardar acción" sin indicar el tipo de acción',
              'No se guarda y se indica el campo obligatorio faltante',
              n_acc == 0 and 'tipo de acción' in err, f'Mensaje: "{err}"; acciones guardadas: {n_acc}')
    li1.locator('select[name="tipo"]').select_option('Poda sanitaria')
    li1.locator('input[name="detalle"]').fill('Poda de 6 plantas')
    li1.locator('form button[type="submit"]').click(); c.p.wait_for_timeout(200)
    li1 = c.p.locator('[data-alerta="al1"]')
    acc = li1.locator('.acciones-alerta').inner_text()
    registrar(pid(), 'HU-012', 'E1 Acción registrada (CA01, CA03)',
              'Elegir "Poda sanitaria", fecha de hoy y pulsar "Guardar acción"',
              'La acción se registra y aparece en el historial de la alerta',
              'Poda sanitaria' in acc, 'Acciones registradas en la alerta: "' + acc.replace('\n', ' ') + '"')
    c.cerrar()
    c.ficha('pa3', 'agricultor')
    est = c.p.locator('#ficha-cuerpo [data-estado]').first.inner_text()
    registrar(pid(), 'HU-005', 'E2 Parcela sin problemas (CA03)',
              'Ingresar al detalle de La Esperanza',
              'Estado "Normal" y fecha de la última actualización',
              est == 'Normal' and c.p.locator('[data-ultima-actualizacion]').count() == 1,
              f'Estado "{est}"; última actualización: {c.txt("[data-ultima-actualizacion]")}')
    registrar(pid(), 'HU-007', 'E2 Parcela sin historial (CA03)',
              'Revisar el historial de La Esperanza',
              'Mensaje de que aún no hay registros',
              c.p.locator('[data-sin-historial]').count() == 1, 'Mensaje: "' + c.txt('[data-sin-historial]') + '"')
    clima = c.txt('#ficha-cuerpo .clima')
    registrar(pid(), 'HU-014', 'E1 Consulta de condiciones (CA01-CA03)',
              'Revisar "Condiciones ambientales" de La Esperanza',
              'Temperatura, humedad, hora de la última medición y si está en rango normal',
              '°C' in clima and '%' in clima and 'Última medición' in clima and 'Rango normal' in clima,
              'Muestra ' + clima.replace('\n', ' · ')[:120])
    c.cerrar()
    c.js("()=>{const d=CafeSync.datos;d.parcelas[2].lectura.fecha=new Date(Date.now()-3*86400000).toISOString();CafeSync.datos=d}")
    c.ficha('pa3', 'agricultor')
    registrar(pid(), 'HU-014', 'E2 Sin datos disponibles',
              'Revisar condiciones de una parcela sin mediciones en las últimas 24 h',
              'Mensaje de que no hay datos y fecha de la última medición',
              c.p.locator('[data-clima="sin-datos"]').count() == 1,
              c.txt('[data-clima="sin-datos"]').replace('\n', ' '))
    c.close()

    # ---------------- Técnico: HU-017 / HU-018 / HU-019 / HU-020 / HU-027 / HU-030
    c = Ctx(browser)
    c.tab('tecnico')
    filas = c.p.locator('#tabla-tecnico tbody tr')
    fila0 = filas.first.inner_text()
    registrar(pid(), 'HU-017', 'E1 Listado de parcelas asignadas (CA01-CA03)',
              'Ingresar a "Mis parcelas" del técnico',
              'Listado con nombre, productor, estado y última actualización, con acceso al detalle',
              filas.count() == 5 and c.p.locator('#tabla-tecnico [data-abrir-ficha]').count() == 5,
              f'{filas.count()} parcelas; ejemplo: "' + fila0.replace('\n', ' | ').replace('\t', ' | ') + '"')
    c.p.select_option('#orden-tecnico', 'riesgo')
    orden = c.js("()=>[...document.querySelectorAll('#tabla-tecnico tbody tr')].map(r=>r.dataset.parcela+':'+r.querySelector('[data-riesgo]').dataset.riesgo)")
    val = {'alto': 3, 'medio': 2, 'bajo': 1}
    rs = [val[x.split(':')[1]] for x in orden]
    registrar(pid(), 'HU-018', 'E1 Ordenamiento por riesgo (CA01-CA02)',
              'Elegir "Ordenar: Por riesgo"',
              'Primero riesgo alto, luego medio y bajo, con color y texto',
              rs == sorted(rs, reverse=True), 'Orden obtenido: ' + ', '.join(orden))
    altos = [x.split(':')[0] for x in orden if x.endswith('alto')]
    c.ficha('pa4', 'tecnico'); c.cerrar()
    orden2 = c.js("()=>[...document.querySelectorAll('#tabla-tecnico tbody tr')].map(r=>r.dataset.parcela)")
    c.p.reload(); c.p.wait_for_selector('#tabla-tecnico tbody tr', state='attached'); c.tab('tecnico')
    persist = c.p.locator('#orden-tecnico').input_value()
    registrar(pid(), 'HU-018', 'E2 Parcelas con el mismo riesgo (CA03)',
              'Ordenar por riesgo con tres parcelas de riesgo alto; abrir una ficha y recargar',
              'Las de igual riesgo se ordenan por la alerta más reciente y el orden se mantiene',
              altos == ['pa1', 'pa6', 'pa4'] and orden2[:3] == altos and persist == 'riesgo',
              f'Riesgo alto ordenado por alerta más reciente: {altos}; orden conservado tras navegar ("{persist}")')
    vis = c.p.locator('#visitas-pendientes [data-visita]')
    ids = [vis.nth(i).get_attribute('data-visita') for i in range(vis.count())]
    mot = vis.first.inner_text()
    obs = c.txt('[data-en-observacion]')
    registrar(pid(), 'HU-027', 'E1 Parcelas que requieren visita (CA01-CA03)',
              'Consultar "Visitas pendientes"',
              'Parcelas con riesgo alto sin atender y el motivo; se diferencian las que siguen en observación',
              sorted(ids) == ['pa1', 'pa4', 'pa6'] and 'Motivo' in mot and 'El Mirador' in obs,
              f'{len(ids)} visitas ({", ".join(ids)}) con motivo; en observación: ' + obs[:80])
    c.ficha('pa4', 'tecnico')
    cuerpo = c.txt('#ficha-cuerpo')
    al = c.p.locator('#ficha-cuerpo .alert-item').first.inner_text()
    registrar(pid(), 'HU-019', 'E1 Parcela con alertas activas (CA01-CA02)',
              'Abrir la ficha de Los Naranjos y revisar "Alertas activas"',
              'Lista de alertas con tipo, nivel de riesgo y fecha',
              'Roya amarilla' in al and 'Riesgo alto' in al and 'detectada' in al, al.replace('\n', ' · '))
    registrar(pid(), 'HU-020', 'E1 Condiciones favorables para plagas (CA01-CA03)',
              'Revisar condiciones ambientales de Los Naranjos (23 °C, 91 %)',
              'Valores actuales, fecha y hora, y aviso de condiciones favorables',
              c.p.locator('[data-clima="riesgo"]').count() == 1 and 'favorables para la aparición de plagas' in cuerpo,
              c.txt('[data-clima="riesgo"]').replace('\n', ' · '))
    registrar(pid(), 'HU-030', 'E1 Consulta de información centralizada (CA01-CA02)',
              'Abrir la ficha de Los Naranjos',
              'Datos del productor y parcela, alertas, historial y acciones en una sola vista',
              all(s in cuerpo for s in ['María Huamán', 'Tel.', 'Alertas activas', 'Historial de problemas', 'Acciones registradas']),
              'La ficha reúne productor (María Huamán, teléfono), parcela, alertas, historial y acciones')
    c.cerrar()
    c.ficha('pa2', 'tecnico')
    registrar(pid(), 'HU-019', 'E2 Parcela sin alertas (CA03)',
              'Abrir la ficha de El Mirador',
              'Mensaje de que no existen alertas activas',
              c.p.locator('#ficha-cuerpo [data-sin-alertas]').count() == 1, 'Mensaje: "' + c.txt('#ficha-cuerpo [data-sin-alertas]') + '"')
    c.cerrar()
    c.ficha('pa5', 'tecnico')
    registrar(pid(), 'HU-020', 'E2 Sin mediciones recientes',
              'Revisar Alto Paraíso (última medición hace 30 h)',
              'Mensaje de que no hay datos actualizados y la fecha de la última medición',
              c.p.locator('[data-clima="sin-datos"]').count() == 1, c.txt('[data-clima="sin-datos"]').replace('\n', ' '))
    c.cerrar()
    c.p.fill('#buscar-tecnico-input', 'zzz'); c.p.click('#buscar-tecnico button')
    registrar(pid(), 'HU-030', 'E2 Búsqueda sin resultados (CA03)',
              'Buscar "zzz" y pulsar "Buscar"',
              'Mensaje de que no se encontraron resultados',
              'No se encontraron resultados' in c.txt('#buscar-tecnico-msg'), 'Mensaje: "' + c.txt('#buscar-tecnico-msg') + '"')
    c.js("()=>{const d=CafeSync.datos;d.parcelas.forEach(p=>p.alertas.forEach(a=>a.atendida=true));CafeSync.datos=d}")
    registrar(pid(), 'HU-027', 'E2 Ninguna parcela requiere visita',
              'Consultar "Visitas pendientes" cuando todas las alertas altas fueron atendidas',
              'Mensaje de que no hay visitas urgentes',
              c.p.locator('[data-sin-visitas]').count() == 1, 'Mensaje: "' + c.txt('[data-sin-visitas]') + '"')
    c.js("()=>{const d=CafeSync.datos;d.parcelas.forEach(p=>p.tecnico=false);CafeSync.datos=d}")
    registrar(pid(), 'HU-017', 'E2 Sin parcelas asignadas',
              'Ingresar a "Mis parcelas" con un técnico sin parcelas asignadas (datos de prueba)',
              'Mensaje de que aún no tiene parcelas asignadas',
              c.p.locator('#tecnico-vacio').is_visible(), 'Mensaje: "' + c.txt('#tecnico-vacio') + '"')
    c.close()

    # ---------------- Inspección: HU-023 / HU-024 / HU-025 + HU-041 / HU-036
    c = Ctx(browser)
    antes = c.js("()=>CafeSync.datos.parcelas[1].acciones.length")
    inspeccion(c, 'pa2')
    err = c.txt('#insp-errores')
    registrar(pid(), 'HU-023', 'E2 Datos obligatorios incompletos (CA02)',
              'Pulsar "Guardar inspección" sin indicar el estado observado',
              'No se guarda y se indica el campo obligatorio faltante',
              'estado observado' in err and c.js("()=>CafeSync.datos.parcelas[1].acciones.length") == antes,
              'Mensaje: "' + err.replace('\n', ' ') + '"')
    c.cerrar()
    inspeccion(c, 'pa2', estado='alerta', problema=True, gravedad='medio')
    err = c.txt('#insp-errores')
    registrar(pid(), 'HU-024', 'E2 Plaga no seleccionada',
              'Marcar "Se identificó una plaga" sin elegir la plaga y guardar',
              'No se guarda y se pide seleccionar la plaga o enfermedad',
              'seleccionar la plaga' in err, 'Mensaje: "' + err.replace('\n', ' ') + '"')
    c.cerrar()
    inspeccion(c, 'pa2', estado='alerta', problema=True, plaga='roya')
    err = c.txt('#insp-errores')
    registrar(pid(), 'HU-025', 'E2 Gravedad no seleccionada (CA03)',
              'Registrar el problema sin elegir nivel de gravedad',
              'No se guarda y se pide seleccionar un nivel de gravedad',
              'nivel de gravedad' in err and c.js("()=>CafeSync.datos.parcelas[1].alertas.length") == 0,
              'Mensaje: "' + err.replace('\n', ' ') + '"')
    c.cerrar()
    inspeccion(c, 'pa2', estado='observacion', resultado='Se revisaron 40 plantas del lote bajo')
    ok = c.txt('#insp-ok')
    hist = c.txt('#ficha-cuerpo')
    registrar(pid(), 'HU-023', 'E1 Inspección registrada (CA01, CA03)',
              'Completar fecha, estado "Síntomas leves" y resultado; pulsar "Guardar inspección"',
              'Se guarda, se actualiza el estado de la parcela y aparece en el historial',
              'Inspección guardada' in ok and 'En observación' in ok and 'Se revisaron 40 plantas' in hist,
              ok.replace('\n', ' ') + ' · La acción "Inspección" aparece en "Acciones registradas"')
    c.cerrar()
    n_coop = c.js("()=>CafeSync.datos.notificaciones.filter(n=>n.rol==='cooperativa').length")
    inspeccion(c, 'pa2', estado='alerta', problema=True, plaga='roya', gravedad='alto')
    ok = c.txt('#insp-ok')
    alerta = c.p.locator('#ficha-cuerpo .alert-item').first.inner_text()
    registrar(pid(), 'HU-024', 'E1 Plaga registrada (CA01-CA03)',
              'Elegir "Roya amarilla" del catálogo, adjuntar descripción y guardar',
              'El registro se guarda asociado a la parcela y a la fecha de inspección',
              'Roya amarilla' in alerta and 'Inspección del técnico' in alerta, 'Alerta creada: ' + alerta.replace('\n', ' · '))
    registrar(pid(), 'HU-025', 'E1 Gravedad registrada (CA01-CA02)',
              'Seleccionar gravedad "Alto" y guardar',
              'Se guarda la gravedad y se actualiza la prioridad de intervención',
              'riesgo alto' in ok and c.js("()=>CafeSync.riesgoParcela('pa2')") == 'alto',
              ok.replace('\n', ' '))
    c.cerrar()
    c.tab('cooperativa')
    notifs = c.p.locator('#notif-cooperativa li')
    t0 = notifs.first.inner_text()
    registrar(pid(), 'HU-041', 'E1 Alerta de riesgo alto (CA01-CA02)',
              'La parcela El Mirador pasa a riesgo alto tras la inspección',
              'Notificación con productor, parcela y motivo del riesgo',
              c.js("()=>CafeSync.datos.notificaciones.filter(n=>n.rol==='cooperativa').length") == n_coop + 1 and 'El Mirador' in t0 and 'Rosa Cárdenas' in t0 and 'Motivo' in t0,
              t0.replace('\n', ' · ')[:150])
    notifs.first.locator('button').click(); c.p.wait_for_selector('#ficha[open]')
    registrar(pid(), 'HU-041', 'E2 Acceso desde la notificación (CA03)',
              'Pulsar "Ver El Mirador" en la notificación',
              'Se abre el detalle de la parcela con la información de la alerta',
              c.txt('#ficha-titulo') == 'Parcela El Mirador' and 'Roya amarilla' in c.txt('#ficha-cuerpo'),
              f'Se abre "{c.txt("#ficha-titulo")}" con la alerta de roya amarilla')
    c.cerrar()
    c.p.fill('#buscar-coop-input', 'Rosa'); c.p.click('#buscar-coop button')
    det = c.txt('#productor-detalle')
    registrar(pid(), 'HU-036', 'E1 Información centralizada (CA01-CA03)',
              'Buscar "Rosa" en Productores; verificar que incluye lo registrado por el técnico',
              'Una sola vista con parcelas, alertas e historial, actualizada automáticamente',
              all(s in det for s in ['Rosa Cárdenas', 'San José', 'El Mirador', 'Alertas activas', 'Historial']) and 'Roya amarilla · El Mirador' in det,
              'Detalle de Rosa Cárdenas con 3 parcelas, alertas e historial; incluye la roya registrada por el técnico en El Mirador')
    c.p.fill('#buscar-coop-input', 'zzz'); c.p.click('#buscar-coop button')
    registrar(pid(), 'HU-036', 'E2 Búsqueda sin resultados',
              'Buscar "zzz" y pulsar "Buscar"',
              'Mensaje de que no se encontraron resultados',
              'No se encontraron resultados' in c.txt('#buscar-coop-msg'), 'Mensaje: "' + c.txt('#buscar-coop-msg') + '"')
    c.close()

    # ---------------- Cooperativa: HU-033 / HU-034 / HU-035 / HU-037 / HU-044
    c = Ctx(browser)
    c.tab('cooperativa')
    filas = c.p.locator('#tabla-cooperativa tbody tr')
    registrar(pid(), 'HU-033', 'E1 Listado de parcelas afiliadas (CA01-CA03)',
              'Ingresar a "Parcelas de productores afiliados"',
              'Listado con productor, estado y nivel de riesgo, con acceso al detalle',
              filas.count() == 8 and c.p.locator('#tabla-cooperativa [data-abrir-ficha]').count() == 8,
              f'{filas.count()} parcelas con productor, estado, riesgo, motivo y botón "Ver detalle"')
    c.p.click('[data-filtro-riesgo="alto"]')
    rows = c.js("()=>[...document.querySelectorAll('#tabla-cooperativa tbody tr')].map(r=>[r.dataset.parcela,r.className,r.querySelector('[data-label=Motivo]').textContent])")
    registrar(pid(), 'HU-034', 'E1 Parcelas de riesgo alto (CA01-CA03)',
              'Aplicar el filtro "Riesgo alto"',
              'Solo parcelas de riesgo alto, resaltadas, con el motivo del riesgo',
              len(rows) == 3 and all(r[1] == 'row-alto' and r[2] for r in rows),
              '; '.join(f'{r[0]}: {r[2]}' for r in rows))
    c.p.click('[data-filtro-riesgo="todos"]')
    items = c.p.locator('#alertas-cooperativa .alert-item')
    t0 = items.first.inner_text()
    registrar(pid(), 'HU-035', 'E1 Alertas activas (CA01-CA02)',
              'Ingresar a "Alertas de los productores"',
              'Lista con productor, parcela, tipo de problema, riesgo y fecha',
              items.count() == 5 and '·' in t0, f'{items.count()} alertas; ejemplo: ' + t0.replace('\n', ' · '))
    c.p.select_option('#f-alerta-riesgo', 'medio')
    rs = c.js("()=>[...document.querySelectorAll('#alertas-cooperativa [data-riesgo]')].map(e=>e.dataset.riesgo)")
    c.p.select_option('#f-alerta-riesgo', ''); c.p.select_option('#f-alerta-productor', 'pr1')
    n_pr = c.p.locator('#alertas-cooperativa .alert-item').count()
    registrar(pid(), 'HU-035', 'E2 Filtrado de alertas (CA03)',
              'Filtrar por riesgo "Medio" y luego por productor "Rosa Cárdenas"',
              'Solo se muestran las alertas que coinciden con el filtro',
              len(rs) == 2 and set(rs) == {'medio'} and n_pr == 2,
              f'Filtro medio: {len(rs)} alertas, todas medio; filtro productor: {n_pr} alertas de Rosa Cárdenas')
    c.ficha('pa1', 'cooperativa')
    registrar(pid(), 'HU-037', 'E1 Estado actualizado (CA01-CA02)',
              'Abrir el detalle de San José',
              'Estado actual y fecha y hora de la última actualización',
              c.p.locator('#ficha-cuerpo [data-estado]').count() >= 1 and c.p.locator('[data-ultima-actualizacion]').count() == 1 and c.p.locator('#ficha-cuerpo [data-desactualizada]').count() == 0,
              'Estado "' + c.p.locator('#ficha-cuerpo [data-estado]').first.inner_text() + '"; actualizada: ' + c.txt('[data-ultima-actualizacion]'))
    c.cerrar()
    c.ficha('pa7', 'cooperativa')
    registrar(pid(), 'HU-037', 'E2 Información desactualizada (CA03)',
              'Abrir el detalle de Rioja Verde (12 días sin registros)',
              'Indica que la información está desactualizada y la fecha del último registro',
              c.p.locator('#ficha-cuerpo [data-desactualizada]').count() == 1,
              c.txt('#ficha-cuerpo [data-desactualizada]') + '; último registro: ' + c.txt('[data-ultima-actualizacion]'))
    c.cerrar()
    prs = c.p.locator('#productores-riesgo [data-productor]')
    luis = c.p.locator('#productores-riesgo [data-productor="pr1"]').inner_text()
    c.p.click('#productores-riesgo [data-ver-productor="pr1"]')
    det = c.txt('#productor-detalle')
    registrar(pid(), 'HU-044', 'E1 Productores con parcelas en riesgo (CA01-CA03)',
              'Consultar "Productores en riesgo" y abrir las parcelas de Rosa Cárdenas',
              'Lista con cantidad de parcelas en riesgo y nivel más alto; acceso a sus parcelas en riesgo',
              prs.count() == 4 and '2 parcela(s) en riesgo' in luis and 'nivel más alto: alto' in luis and 'Parcelas en riesgo' in det and 'La Esperanza' not in det,
              f'{prs.count()} productores; Rosa Cárdenas: 2 parcelas en riesgo, nivel más alto alto; el detalle muestra solo San José y El Mirador')
    c.js("""()=>{const d=CafeSync.datos;d.parcelas.forEach(p=>{p.alertas=p.alertas.filter(a=>a.riesgo!=='alto');p.lectura.hum=Math.min(p.lectura.hum,85)});CafeSync.datos=d}""")
    c.p.click('[data-filtro-riesgo="alto"]')
    registrar(pid(), 'HU-034', 'E2 Sin parcelas de riesgo alto',
              'Aplicar "Riesgo alto" cuando ninguna parcela tiene riesgo alto (datos de prueba)',
              'Mensaje de que no hay parcelas con riesgo alto',
              c.p.locator('[data-sin-resultados]').count() == 1, 'Mensaje: "' + c.txt('[data-sin-resultados]') + '"')
    c.js("""()=>{const d=CafeSync.datos;d.parcelas.forEach(p=>{p.alertas=[];p.estadoManual=null;p.lectura.hum=60});CafeSync.datos=d}""")
    registrar(pid(), 'HU-044', 'E2 Ningún productor en riesgo',
              'Consultar "Productores en riesgo" sin parcelas en riesgo (datos de prueba)',
              'Mensaje de que no hay productores con parcelas en riesgo',
              c.p.locator('[data-sin-productores]').count() == 1, 'Mensaje: "' + c.txt('[data-sin-productores]') + '"')
    c.js("()=>{const d=CafeSync.datos;d.parcelas=[];CafeSync.datos=d}")
    registrar(pid(), 'HU-033', 'E2 Sin parcelas registradas',
              'Ingresar a "Parcelas" sin parcelas registradas (datos de prueba)',
              'Mensaje de que aún no hay parcelas registradas',
              c.p.locator('#cooperativa-vacio').is_visible(), 'Mensaje: "' + c.txt('#cooperativa-vacio') + '"')
    c.close()


def responsive(browser):
    """Comprobaciones de la adaptación responsive y accesibilidad básica."""
    salida = []
    for nombre, w, h in [('Desktop', 1366, 900), ('Tablet', 820, 1180), ('Mobile', 390, 844)]:
        c = Ctx(browser, w, h)
        overflow = c.js("()=>document.documentElement.scrollWidth - window.innerWidth")
        menu = c.p.locator('.nav-toggle').is_visible()
        if menu:
            c.p.click('.nav-toggle')
            abierto = c.p.locator('#menu-principal').is_visible()
        else:
            abierto = c.p.locator('#menu-principal').is_visible()
        c.tab('cooperativa')
        tabla_cards = c.js("()=>getComputedStyle(document.querySelector('#tabla-cooperativa tr')).display")
        pequenos = c.js("""()=>[...document.querySelectorAll('button, a.btn, select, input:not([type=file]):not(.visually-hidden-input), [role=tab]')]
            .filter(e=>e.offsetParent!==null).filter(e=>{const r=e.getBoundingClientRect();return r.height<44 && !(e.type==='radio'||e.type==='checkbox')}).map(e=>e.outerHTML.slice(0,60))""")
        salida.append({'vista': nombre, 'ancho': w, 'desborde_horizontal_px': overflow, 'menu_hamburguesa': menu,
                       'menu_accesible': abierto, 'tabla_display': tabla_cards, 'objetivos_menores_44px': pequenos,
                       'errores_js': c.errores})
        c.close()
    c = Ctx(browser)
    a11y = c.js("""()=>{
      const imgs=[...document.querySelectorAll('img')].filter(i=>!i.hasAttribute('alt')).length;
      const ctrls=[...document.querySelectorAll('input,select,textarea')].filter(e=>e.type!=='hidden').filter(e=>{
        if(e.closest('label')) return false; if(e.id && document.querySelector('label[for="'+e.id+'"]')) return false;
        return !e.getAttribute('aria-label');}).map(e=>e.id||e.name);
      return {lang:document.documentElement.lang, imgs_sin_alt:imgs, controles_sin_etiqueta:ctrls,
        landmarks:['header','nav','main','footer'].filter(t=>document.querySelector(t)).length,
        h1:document.querySelectorAll('h1').length}}""")
    c.p.keyboard.press('Tab')
    a11y['primer_tab'] = c.js("()=>document.activeElement.textContent.trim()")
    c.p.focus('#tab-agricultor'); c.p.keyboard.press('ArrowRight')
    a11y['flecha_en_pestanas'] = c.js("()=>document.activeElement.id+':'+document.activeElement.getAttribute('aria-selected')")
    c.ficha('pa1', 'agricultor'); c.p.keyboard.press('Escape'); c.p.wait_for_timeout(100)
    a11y['escape_cierra_dialogo'] = not c.js("()=>document.querySelector('#ficha').open")
    c.p.click('#form-contacto button[type=submit]')
    a11y['error_formulario_con_texto'] = c.txt('#c-nombre-error') + ' / ' + c.txt('#c-correo-error')
    a11y['errores_js'] = c.errores
    c.close()
    return salida, a11y


if __name__ == '__main__':
    with sync_playwright() as pw:
        kw = {'executable_path': CHROME} if CHROME else {}
        b = pw.chromium.launch(**kw)
        t0 = time.time()
        run(b)
        resp, a11y = responsive(b)
        b.close()
    cumple = sum(1 for r in RESULTADOS if r['estado'] == 'Cumple')
    hus = sorted({r['hu'] for r in RESULTADOS})
    hus_ok = [h for h in hus if all(r['estado'] == 'Cumple' for r in RESULTADOS if r['hu'] == h)]
    resumen = {'url': URL, 'fecha': time.strftime('%Y-%m-%d %H:%M'), 'pruebas': len(RESULTADOS), 'cumple': cumple,
               'hu_probadas': len(hus), 'hu_cumplen': len(hus_ok), 'duracion_s': round(time.time() - t0, 1)}
    json.dump({'resumen': resumen, 'resultados': RESULTADOS, 'responsive': resp, 'accesibilidad': a11y},
              open('tests/resultados_aceptacion.json', 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(resumen, ensure_ascii=False))
    print(json.dumps(resp, ensure_ascii=False, indent=1))
    print(json.dumps(a11y, ensure_ascii=False, indent=1))
