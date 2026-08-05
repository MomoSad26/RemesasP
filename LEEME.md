# Remesas — App de control de envíos

App completa (Clientes, Envío, Trabajadores, Precio especial, Historial,
Compras, Ventas, Gastos, In/Out, Balance, Deudas y Respaldos) que funciona
**100% offline** y guarda todo en el propio teléfono. No necesita internet
para usarse, solo para instalarla la primera vez.

---

## Opción A — La más rápida: usarla como app sin generar .apk

1. Sube esta carpeta a algún hosting simple y gratuito. La forma más fácil:
   - Entra a **https://app.netlify.com/drop** desde una computadora.
   - Arrastra esta carpeta completa (`remesas_app`) a la página.
   - Te da un link tipo `https://algo-random.netlify.app`.
2. Abre ese link en **Chrome** desde tu teléfono Android.
3. Toca el menú (⋮) de Chrome → **"Instalar app"** o **"Agregar a pantalla
   de inicio"**.
4. Listo: te queda un ícono en tu teléfono que abre la app en pantalla
   completa, como cualquier app instalada. Ya no necesita internet.

## Opción B — Generar un archivo .apk instalable de verdad

1. Haz los pasos 1 y 2 de la Opción A (subir la carpeta y obtener el link).
2. Entra a **https://www.pwabuilder.com** desde una computadora.
3. Pega el link de tu app y presiona **Start**.
4. Cuando termine de analizarla, ve a la pestaña **Android** y presiona
   **Generate Package**.
5. Descarga el `.apk` (o `.aab`) que te entrega.
6. Pasa ese archivo `.apk` a tu teléfono (por USB, WhatsApp, Google Drive,
   etc.) y ábrelo para instalarlo. Android puede pedirte permitir
   "instalar apps de orígenes desconocidos" la primera vez — es normal,
   acepta esa opción.

> PWABuilder es un servicio gratuito de Microsoft que empaqueta cualquier
> app web en un .apk real, firmado y listo para instalar. No requiere
> saber programar.

## Opción C — Ya la subiste a GitHub Pages y no se instala

Revisa esto en orden:

1. **Confirma que `index.html` esté en la raíz** de lo que GitHub Pages
   sirve (o en la carpeta que configuraste como fuente). Si tu URL es
   `https://tuusuario.github.io/turepo/`, entrando ahí debe cargar la app
   directamente — si te da 404, el `index.html` no está en esa ruta.
2. Abre la URL en **Chrome de computadora** → `F12` → pestaña
   **Application** → **Manifest** y **Service Workers**. Ahí Chrome
   muestra el error exacto si algo no cargó.
3. Si ya la habías instalado antes y le subiste esta versión nueva,
   **desinstala la app vieja del teléfono** y vuelve a instalarla — el
   Service Worker cachea archivos y a veces no detecta la actualización
   sola la primera vez.
4. GitHub Pages es sensible a mayúsculas/minúsculas: confirma que subiste
   `manifest.json`, `sw.js`, `app.js`, `styles.css` y la carpeta `icons/`
   exactamente con esos nombres, en la misma carpeta que `index.html`.

---



Todo (clientes, envíos, ventas, gastos, balances) se guarda **localmente
en el navegador o la app instalada de ese teléfono**, no en ningún
servidor. Por eso:

- Si desinstalas la app o borras los datos del navegador, se pierde la
  información.
- Usa el **Menú 10 — Respaldos → Exportar todos los datos (JSON)**
  regularmente para tener una copia de seguridad que puedas guardar en
  Google Drive, correo, etc.
- Ese mismo respaldo se puede **Importar** después (o en otro teléfono)
  y se fusiona con lo que ya exista, sin borrar nada.

## Archivos de este proyecto

- `index.html` — estructura de la app
- `styles.css` — diseño visual
- `app.js` — toda la lógica (clientes, envíos, cálculos, balances, filtros, respaldos)
- `manifest.json` + `sw.js` — hacen que la app sea instalable y funcione offline
- `icons/` — ícono de la app
