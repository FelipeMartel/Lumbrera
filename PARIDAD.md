# Paridad con STEPBible

Objetivo: que Lumbrera ofrezca todo lo que ofrece la interfaz original (versión 26.1.2), sin perder nada.
La lista sale de los módulos de su código (`step-web/js/backbone/views`) y de las opciones de su API.

## Hecho

### Lectura
- [x] Leer cualquier libro y capítulo; capítulo anterior y siguiente
- [x] Elegir libro y capítulo en un selector
- [x] Ir a un pasaje escribiéndolo ("juan 3:16", "sal 23")
- [x] Pasajes con varios tramos ("Juan 3:16-18; Romanos 8:28")
- [x] Encabezados de sección, notas al pie y referencias cruzadas con su texto
- [x] Palabras de Jesús en rojo, sin perder el estudio de palabras
- [x] Opciones de vista: encabezados, números, un versículo por línea, notas
- [x] Tamaño del texto y letra más legible para dislexia
- [x] Modo oscuro y adaptación a móvil
- [x] Varios paneles de lectura independientes

### Versiones
- [x] Selector completo por idioma, con nombre, filtro y lo que ofrece cada versión
- [x] Tres o más versiones a la vez
- [x] Modos de comparación: columnas, intercaladas, diferencias (en lista y en columnas), palabra por palabra
- [x] Catálogo de módulos instalables, instalación con avance y retirada de módulos (probado con un módulo real)

### Original
- [x] Palabra original: término, transliteración, glosa, definición, frecuencia y forma gramatical
- [x] Entrada completa del léxico y palabras emparentadas
- [x] Resaltar la misma palabra original en todo el capítulo, también entre versiones
- [x] Interlineal: original, transliteración, glosa en español, en inglés y en chino, y gramática
- [x] Opciones del griego y el hebreo: acentos, vocales, división de palabras, transliteración
- [x] Colores por gramática en griego y hebreo: tiempo y forma del verbo; género, número o caso del nombre
- [x] Elegir cada color de la gramática y activar por separado verbos y nombres
- [x] Vocabulario completo de un versículo
- [x] Vocabulario más repetido y temas de un pasaje

### Búsqueda
- [x] Sugerencias mientras se escribe: pasajes, palabras, temas, significados y palabras originales
- [x] En el texto: todas las palabras, cualquiera o la frase exacta; con paginación
- [x] Por palabra original y por significado original, con filtro por palabra y orden
- [x] Por la forma exacta de una palabra en griego o hebreo
- [x] Por tema (índice de Nave) y en los encabezados
- [x] Limitar a un testamento, a un libro o a varios libros
- [x] Combinar condiciones en una misma búsqueda
- [x] Contexto alrededor de cada resultado
- [x] Versículos relacionados y temas de un versículo

### Aplicación
- [x] Comentarios por versículo (todos los instalados)
- [x] Copiar un versículo o un tramo con su referencia
- [x] Historial de lectura, historial de búsquedas y marcadores
- [x] Dirección propia para cada pasaje y cada búsqueda; Atrás y Adelante del navegador
- [x] Ayuda con ejemplos que se pueden ejecutar
- [x] Interfaz en español, inglés, portugués y francés; los nombres de los libros y las glosas siguen al idioma
- [x] Formulario para escribir al equipo de STEPBible

## Pendiente

- [ ] Más idiomas de interfaz. Hay español, inglés, portugués y francés; el original ofrece decenas.
      Cada uno es una lista numerada más (ver `generar_idiomas.py`) y una línea en `src/i18n/index.ts`.
- [ ] Revisar el portugués y el francés con hablantes nativos: se han traducido sin esa revisión.
- [ ] Enviar un mensaje real al equipo. El formulario usa el mismo canal que la interfaz original y valida los datos,
      pero no se ha enviado ninguno de prueba para no abrirles una incidencia falsa. La imagen que acompaña al mensaje
      es una ficha con el pasaje y la dirección, no una captura de pantalla como en el original.

## Fuera de alcance

- Línea de tiempo: las rutas existen en el motor, pero ninguna pantalla de la interfaz original las usa.

## Diferencias conocidas del motor

- La búsqueda por forma exacta necesita instaladas las Biblias griegas WHNU y Byz, y da muy pocos resultados
  (2 para λόγος en cualquier versión). Puede que su índice sea parcial; conviene preguntarlo al equipo.

- Los temas, los significados y los encabezados solo están indexados en inglés: "amor" no devuelve nada
  y "love" sí, aunque la interfaz esté en español.
- La búsqueda por palabra original devuelve muy pocos resultados en la Reina-Valera 1909
  (4 para ἀγαπάω, frente a 109 en la KJV). Ocurre en el motor, no en la interfaz.
- Con las letras rojas activadas, el motor devuelve las palabras de Jesús de la KJV sin etiquetas de
  palabra original. Lumbrera pide el rojo aparte y lo vuelca sobre el texto etiquetado, así que conserva ambas cosas.
- Las estadísticas de palabras (`analysis/analyseStats` con `WORD`) devuelven error en esta instalación;
  Lumbrera hace el recuento con las palabras ya cargadas. Las de temas sí funcionan.
- Las sugerencias (`search/suggest`) devuelven error si no se les pasa el contexto de versión terminado en `@`.
- Los tramos vacíos de una ruta (`/1///0`) se pierden al pasar por un intermediario; Lumbrera envía un espacio en su lugar.
