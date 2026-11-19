/* CaféSync · datos de ejemplo de la demostración.
   Las fechas se calculan respecto al momento en que se abre la página,
   para que los estados "actualizado" o "desactualizado" sean coherentes. */
(function () {
  'use strict';

  var HORA = 3600 * 1000;
  var DIA = 24 * HORA;
  function hace(ms) { return new Date(Date.now() - ms).toISOString(); }

  /* Umbrales usados para evaluar el clima de la parcela (roya amarilla).
     Hemileia vastatrix necesita agua libre sobre la hoja y temperaturas moderadas
     (Talhinhas et al., 2017); se usa la humedad relativa como aproximación. */
  var UMBRALES = {
    altoHumedad: 90, medioHumedad: 80, tempMin: 18, tempMax: 28,
    cambioHumedad: 15, cambioTemp: 4,
    horasSinMedicion: 24, diasDesactualizada: 7
  };

  var CATALOGO = {
    roya: {
      nombre: 'Roya amarilla',
      cientifico: 'Hemileia vastatrix',
      descripcion: 'Es un hongo que ataca las hojas del café. Hace que la planta pierda hojas y produzca menos granos.',
      sintomas: ['Manchas amarillas que luego se vuelven naranjas, sobre todo por debajo de la hoja.', 'Polvillo naranja que se queda en los dedos al tocar la mancha.', 'Caída de hojas antes de tiempo.'],
      causas: ['Lluvias frecuentes y mucha humedad sobre las hojas.', 'Temperaturas templadas, entre 18 y 28 °C.', 'Plantas debilitadas o con poca nutrición.'],
      danio: 'Si no se controla, la planta se queda sin hojas, el grano no madura bien y baja la cosecha y la calidad de la taza.',
      referencia: 'assets/img/ref-roya.svg',
      referenciaAlt: 'Ilustración de referencia: envés de una hoja de café con manchas circulares naranjas y polvillo'
    },
    mancha_hierro: {
      nombre: 'Posible mancha de hierro',
      cientifico: 'Cercospora coffeicola',
      descripcion: null /* explicación aún no registrada en el catálogo */
    },
    ojo_gallo: { nombre: 'Ojo de gallo', cientifico: 'Mycena citricolor', descripcion: null },
    broca: { nombre: 'Broca del café', cientifico: 'Hypothenemus hampei', descripcion: null },
    antracnosis: { nombre: 'Antracnosis', cientifico: 'Colletotrichum spp.', descripcion: null }
  };

  var RECOMENDACIONES = {
    alto: {
      urgencia: 'Inmediata',
      pasos: [
        'Marca las plantas afectadas con una cinta para no perderlas de vista.',
        'Retira y entierra las hojas muy dañadas; no las dejes en el suelo.',
        'Llama hoy mismo a tu técnico para que confirme el problema y te indique el producto y la dosis.',
        'Revisa las plantas vecinas de la misma fila.'
      ]
    },
    medio: {
      urgencia: 'Próxima (en los siguientes 3 días)',
      pasos: [
        'Revisa por debajo las hojas de las plantas cercanas.',
        'Toma una nueva foto en 3 días para ver si las manchas crecen.',
        'Consulta con tu técnico en su próxima visita.'
      ]
    },
    bajo: {
      urgencia: 'Monitoreo',
      pasos: [
        'Mantén la planta en observación durante tus recorridos.',
        'Vuelve a tomar una foto si aparecen manchas nuevas.'
      ]
    },
    incierto: {
      urgencia: 'Consulta a un técnico',
      pasos: [
        'No pudimos identificar el problema con seguridad.',
        'Toma otra foto de cerca, con luz de día, por el envés de la hoja.',
        'Muestra la planta a tu técnico o a la cooperativa antes de aplicar cualquier producto.'
      ]
    }
  };

  var PRODUCTORES = [
    { id: 'pr1', nombre: 'Rosa Cárdenas', telefono: '987 654 321', ubicacion: 'San Ignacio, Cajamarca', afiliadoDesde: '2019' },
    { id: 'pr2', nombre: 'María Huamán', telefono: '965 112 430', ubicacion: 'San Ignacio, Cajamarca', afiliadoDesde: '2021' },
    { id: 'pr3', nombre: 'Jorge Tantaleán', telefono: '944 330 218', ubicacion: 'Jaén, Cajamarca', afiliadoDesde: '2018' },
    { id: 'pr4', nombre: 'Carmen Rojas', telefono: '951 207 884', ubicacion: 'Jaén, Cajamarca', afiliadoDesde: '2022' },
    { id: 'pr5', nombre: 'Pedro Saavedra', telefono: '976 550 013', ubicacion: 'Moyobamba, San Martín', afiliadoDesde: '2020' },
    { id: 'pr6', nombre: 'Ana Villanueva', telefono: '938 004 671', ubicacion: 'Moyobamba, San Martín', afiliadoDesde: '2023' }
  ];

  function lectura(t, h, ms) { return { temp: t, hum: h, fecha: hace(ms) }; }

  function crearDatos() {
    return {
      productores: JSON.parse(JSON.stringify(PRODUCTORES)),
      parcelas: [
        {
          id: 'pa1', nombre: 'San José', productorId: 'pr1', hectareas: 1.2, variedad: 'Catimor',
          tecnico: true, actualizada: hace(2 * HORA),
          lectura: lectura(22.4, 93, 2 * HORA), lecturaAnterior: lectura(21.8, 88, 8 * HORA),
          alertas: [
            {
              id: 'al1', tipo: 'Roya amarilla', origen: 'Diagnóstico por foto', riesgo: 'alto', fecha: hace(26 * HORA), atendida: false,
              zona: { x: 68, y: 34, r: 14, nombre: 'Lote alto, junto al camino' },
              registros: [
                { fecha: hace(9 * DIA), riesgo: 'bajo', nota: 'Pocas manchas en 2 plantas' },
                { fecha: hace(4 * DIA), riesgo: 'medio', nota: 'Manchas en 6 plantas de la misma fila' },
                { fecha: hace(26 * HORA), riesgo: 'alto', nota: 'Polvillo naranja y caída de hojas' }
              ],
              acciones: []
            },
            {
              id: 'al2', tipo: 'Clima favorable para roya', origen: 'Sensores', riesgo: 'medio', fecha: hace(2 * HORA), atendida: false,
              zona: null,
              registros: [{ fecha: hace(2 * HORA), riesgo: 'medio', nota: 'Humedad de 93 % durante la noche' }],
              acciones: []
            }
          ],
          historial: [
            { tipo: 'Roya amarilla', fecha: hace(26 * HORA), estado: 'activo' },
            { tipo: 'Broca del café', fecha: hace(140 * DIA), estado: 'resuelto' },
            { tipo: 'Roya amarilla', fecha: hace(300 * DIA), estado: 'resuelto' }
          ],
          acciones: [
            { fecha: hace(138 * DIA), tipo: 'Trampa para broca', detalle: 'Instalación de 20 trampas', autor: 'Rosa Cárdenas' }
          ]
        },
        {
          id: 'pa2', nombre: 'El Mirador', productorId: 'pr1', hectareas: 0.8, variedad: 'Caturra',
          tecnico: true, actualizada: hace(5 * HORA),
          lectura: lectura(20.1, 84, 5 * HORA), lecturaAnterior: lectura(20.6, 81, 11 * HORA),
          alertas: [],
          historial: [
            { tipo: 'Mancha de hierro', fecha: hace(60 * DIA), estado: 'resuelto' }
          ],
          acciones: [
            { fecha: hace(58 * DIA), tipo: 'Abonamiento', detalle: 'Fertilización foliar', autor: 'Rosa Cárdenas' }
          ]
        },
        {
          id: 'pa3', nombre: 'La Esperanza', productorId: 'pr1', hectareas: 0.5, variedad: 'Typica',
          tecnico: false, actualizada: hace(3 * HORA),
          lectura: lectura(19.5, 71, 3 * HORA), lecturaAnterior: lectura(19.2, 70, 9 * HORA),
          alertas: [], historial: [], acciones: []
        },
        {
          id: 'pa4', nombre: 'Los Naranjos', productorId: 'pr2', hectareas: 2.0, variedad: 'Catimor',
          tecnico: true, actualizada: hace(7 * HORA),
          lectura: lectura(23.0, 91, 7 * HORA), lecturaAnterior: lectura(22.1, 86, 13 * HORA),
          alertas: [
            {
              id: 'al3', tipo: 'Roya amarilla', origen: 'Inspección del técnico', riesgo: 'alto', fecha: hace(20 * HORA), atendida: false,
              zona: { x: 30, y: 60, r: 16, nombre: 'Ladera baja, cerca de la quebrada' },
              registros: [
                { fecha: hace(6 * DIA), riesgo: 'medio', nota: 'Focos en el borde de la parcela' },
                { fecha: hace(20 * HORA), riesgo: 'alto', nota: 'Avance hacia el centro de la parcela' }
              ],
              acciones: []
            }
          ],
          historial: [{ tipo: 'Roya amarilla', fecha: hace(20 * HORA), estado: 'activo' }],
          acciones: []
        },
        {
          id: 'pa5', nombre: 'Alto Paraíso', productorId: 'pr3', hectareas: 3.1, variedad: 'Bourbon',
          tecnico: true, actualizada: hace(30 * HORA),
          lectura: lectura(21.2, 86, 30 * HORA), lecturaAnterior: lectura(21.0, 85, 36 * HORA),
          alertas: [
            {
              id: 'al4', tipo: 'Broca del café', origen: 'Reporte del productor', riesgo: 'medio', fecha: hace(3 * DIA), atendida: false,
              zona: { x: 50, y: 50, r: 18, nombre: 'Centro de la parcela' },
              registros: [{ fecha: hace(3 * DIA), riesgo: 'medio', nota: 'Granos perforados en cosecha' }],
              acciones: []
            }
          ],
          historial: [{ tipo: 'Broca del café', fecha: hace(3 * DIA), estado: 'activo' }],
          acciones: []
        },
        {
          id: 'pa6', nombre: 'Buenos Aires', productorId: 'pr4', hectareas: 1.6, variedad: 'Catuaí',
          tecnico: true, actualizada: hace(4 * HORA),
          lectura: lectura(22.8, 92, 4 * HORA), lecturaAnterior: lectura(21.5, 79, 10 * HORA),
          alertas: [
            {
              id: 'al5', tipo: 'Roya amarilla', origen: 'Diagnóstico por foto', riesgo: 'alto', fecha: hace(9 * HORA), atendida: false,
              zona: { x: 72, y: 70, r: 12, nombre: 'Esquina sureste' },
              registros: [{ fecha: hace(9 * HORA), riesgo: 'alto', nota: 'Diagnóstico por foto con 87 % de confianza' }],
              acciones: []
            }
          ],
          historial: [{ tipo: 'Roya amarilla', fecha: hace(9 * HORA), estado: 'activo' }],
          acciones: []
        },
        {
          id: 'pa7', nombre: 'Rioja Verde', productorId: 'pr5', hectareas: 2.4, variedad: 'Catimor',
          tecnico: false, actualizada: hace(12 * DIA),
          lectura: lectura(24.0, 78, 12 * DIA), lecturaAnterior: lectura(24.2, 77, 13 * DIA),
          alertas: [], historial: [{ tipo: 'Ojo de gallo', fecha: hace(90 * DIA), estado: 'resuelto' }], acciones: []
        },
        {
          id: 'pa8', nombre: 'La Florida', productorId: 'pr6', hectareas: 1.0, variedad: 'Geisha',
          tecnico: false, actualizada: hace(6 * HORA),
          lectura: lectura(23.5, 74, 6 * HORA), lecturaAnterior: lectura(23.1, 75, 12 * HORA),
          alertas: [], historial: [], acciones: []
        }
      ],
      notificaciones: [
        { id: 'n0', rol: 'cooperativa', parcelaId: 'pa6', fecha: hace(9 * HORA), titulo: 'Riesgo alto en Buenos Aires', texto: 'Productora: Carmen Rojas. Motivo: roya amarilla detectada por foto con 87 % de confianza.' },
        { id: 'n1', rol: 'agricultor', parcelaId: 'pa1', fecha: hace(2 * HORA), titulo: 'Clima favorable para roya en San José', texto: 'La humedad llegó a 93 % con 22,4 °C. Estas condiciones favorecen la roya amarilla. Revisa primero el lote alto.' }
      ]
    };
  }

  window.CafeSyncData = {
    UMBRALES: UMBRALES, CATALOGO: CATALOGO, RECOMENDACIONES: RECOMENDACIONES,
    crearDatos: crearDatos, HORA: HORA, DIA: DIA
  };
})();
