# CaféSync · Landing Page (TB2)

Landing page responsive de **CaféSync**, sistema de alerta temprana de roya amarilla para pequeños productores de café del Perú.
Proyecto del curso *HCI for UX Design* (1ASI0784), UPC, ciclo 2026-20.

La página implementa las **30 Historias de Usuario core** del Product Backlog (las 24 *Must* y las 6 *Should* de mayor prioridad) como componentes interactivos de una sola página, con datos de ejemplo.

## Estructura

```
cafesync-landing/
├── index.html              Estructura semántica de la landing (una sola página responsive)
├── css/styles.css          Guía de estilos (paleta, tipografía Poppins, componentes) y breakpoints
├── js/data.js              Datos de ejemplo, umbrales de riesgo, catálogo y recomendaciones
├── js/diagnostico.js       Diagnóstico por foto (calidad de imagen + estimación por color)
├── js/app.js               Interacciones de los tres perfiles (agricultor, técnico, cooperativa)
├── assets/img/             Logo, ilustraciones e íconos en SVG
├── tests/acceptance_test.py  Pruebas de aceptación automatizadas (60 escenarios Gherkin)
└── .nojekyll               Publicación directa en GitHub Pages
```

## Ejecutar en local

Abrir `index.html` en el navegador o, mejor, servir la carpeta:

```bash
python -m http.server 8765
# http://localhost:8765
```

## Publicar en GitHub Pages

1. Crear el repositorio (por ejemplo `cafesync-landing`) y subir el contenido de esta carpeta a la rama `main`.
2. En *Settings → Pages*, elegir **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. La URL pública será `https://<usuario>.github.io/cafesync-landing/`.

## Pruebas de aceptación

```bash
pip install playwright
playwright install chromium
python tests/acceptance_test.py https://<usuario>.github.io/cafesync-landing/
```

El script genera `tests/resultados_aceptacion.json` con el resultado de cada escenario (Cumple / No cumple), la verificación responsive (Desktop 1366 px, Tablet 820 px, Mobile 390 px) y comprobaciones de accesibilidad.

## Notas

- El diagnóstico por foto es una demostración: evalúa luz y nitidez de la foto y estima la proporción de manchas naranjas o marrones sobre la hoja. No reemplaza el modelo de visión computacional previsto ni la evaluación de un técnico.
- Lo que se registra se guarda solo en el navegador (`localStorage`). El botón **Restablecer datos de ejemplo** vuelve al estado inicial.
