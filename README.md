# Gastos — control mensual de gastos e ingresos

Aplicación web para registrar los movimientos del mes. Sin dependencias, sin
build: archivos estáticos y toda la lógica en el navegador.

```
index.html      estructura
styles.css      estilos (claro / oscuro automático)
app.js          lógica: estado, gráficos SVG, persistencia
build-standalone.py   genera gastos-standalone.html (todo en un archivo)
```

## Funcionalidad

- **Gastos e ingresos**: conmutador *Gasto / Ingreso* en el formulario. Cada tipo
  tiene sus propias categorías sugeridas (gasto: comida, vivienda…; ingreso:
  nómina, freelance, ventas…). También aceptas categorías libres.
- **Importe** tolerante al formato: `15,50`, `15.50`, `1.800`, `1.234,56` o
  `1,234.56` se interpretan bien (coma = decimal por defecto).
- **Resumen del mes**: Ingresos · Gastos · Balance (verde/rojo) · Categoría de
  gasto principal, con comparación de gasto frente al mes anterior.
- **Gráfico de dónut**: reparto del gasto por categoría (solo gastos).
- **Gráfico por día**: gasto de cada día del mes, resalta hoy.
- **Balance mensual**: barras de los últimos 6 meses (ingreso − gasto), positivo
  hacia arriba en verde, negativo hacia abajo en rojo.
- **Filtros por categoría** (chips) sobre la tabla de movimientos.
- **Tabla**: ordenada por fecha; los ingresos en verde con `+` y etiqueta
  *ingreso*; borrado individual con confirmación.
- **Exportar CSV** del mes (`fecha;tipo;categoria;descripcion;importe`) y
  **vaciar mes**.
- **Navegación por meses**; no permite meses futuros.
- **Persistencia local**: `localStorage`, clave `gastos.v1`. Los datos no salen
  del dispositivo y se sincronizan entre pestañas del mismo navegador.
  Se migran automáticamente los datos guardados por la versión anterior
  (solo gastos).

## Ejecutar en local

No hay build. Para evitar restricciones de `file://`, sírvelo por HTTP:

```bash
cd "gastos" && python3 -m http.server 8777
```

Y abre http://127.0.0.1:8777. (El archivo `gastos-standalone.html` sí se puede
abrir con doble clic, sin servidor.)

## Compartir con otras personas (cada una en su local)

Los datos viven en el `localStorage` del navegador de cada persona, así que
**da igual cómo reciban la app: sus movimientos nunca se mezclan con los tuyos**.

1. **Un solo archivo (lo más simple).** Regenera y envía `gastos-standalone.html`:

   ```bash
   cd "gastos" && python3 build-standalone.py
   ```

   La otra persona guarda el archivo y lo abre con doble clic. Funciona sin
   internet y sin servidor.

2. **Carpeta comprimida.** Comprime `index.html`, `styles.css` y `app.js` en un
   ZIP. Al descomprimir, se abre `index.html` con doble clic (los tres archivos
   deben quedar juntos).

3. **Publicarla en una URL** (una vez) y pasar el enlace:
   - **GitHub Pages**: sube la carpeta a un repo y actívalo en *Settings →
     Pages*.
   - **Netlify / Cloudflare Pages**: arrastra la carpeta a su panel de *deploy*.
   - Cualquier hosting de estáticos sirve; no hay backend.

4. **En la misma red local**: lanza el servidor abierto a la red y comparte tu IP:

   ```bash
   cd "gastos" && python3 -m http.server 8777 --bind 0.0.0.0
   ```

   Los demás entran a `http://TU_IP_LOCAL:8777` (p. ej. `http://192.168.1.40:8777`).

## Personalización

Al principio de `app.js`:

- `CURRENCY` / `LOCALE` — moneda y formato (por defecto `EUR` / `es-ES`).
- `EXPENSE_COLORS` / `INCOME_COLORS` — colores y categorías sugeridas por tipo.
- `FALLBACK_PALETTE` — colores para categorías nuevas (asignación estable por nombre).
