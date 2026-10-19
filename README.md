# 📦 Portal de Reportes & Control de Cajas Autopick Devueltas

Aplicación web moderna y responsive diseñada para tiendas y centros de distribución. Permite el registro ágil de incidencias y el control en tiempo real de **cajas de autopick devueltas**, con curvas evolutivas temporales, desglose por operador y auditoría completa.

---

## 🚀 Cómo Publicar la Aplicación en GitHub Pages (100% Gratis)

Esta aplicación está completamente lista para funcionar como una web estática en **GitHub Pages**.

### Paso 1: Inicializar el repositorio Git y subirlo a GitHub
Abre la terminal (PowerShell o Git Bash) en esta carpeta y ejecuta los siguientes comandos:

```bash
# 1. Iniciar git y preparar los archivos
git init
git add .
git commit -m "feat: Sistema de Reportes con Contador de Cajas Autopick y Evolutivo"

# 2. Configurar la rama principal
git branch -M main

# 3. Vincular con tu repositorio de GitHub (Reemplaza TU_USUARIO y TU_REPOSITORIO)
git remote add origin https://github.com/TU_USUARIO/Reportes.git

# 4. Subir los archivos
git push -u origin main
```

*(Si ya tenías el repositorio clonado o vinculado, solo haz `git add .`, `git commit -m "mejoras"` y `git push`)*.

---

### Paso 2: Activar GitHub Pages en tu repositorio
1. Entra a tu repositorio en [GitHub.com](https://github.com).
2. Haz clic en la pestaña **Settings** (Configuración) arriba a la derecha.
3. En el menú de la izquierda, entra a **Pages**.
4. En **Build and deployment > Source**, selecciona:
   - **Branch**: `main`
   - **Folder**: `/ (root)`
5. Haz clic en **Save** (Guardar).
6. En 1 minuto, GitHub te dará tu enlace público, por ejemplo:
   `https://TU_USUARIO.github.io/Reportes/`

---

## ⚡ ¿Cómo funciona en Tiempo Real entre Celulares en GitHub Pages?

Dado que GitHub Pages es un hosting estático, cada celular tiene su propio almacenamiento local. Para que **lo que anote un operador en su celular se refleje en tu pantalla en vivo sin tener que exportar nada**, tienes dos opciones gratuitas:

### Opción 1: Google Sheets (Sincronización Automática cada 6 segundos)
Tu aplicación ya cuenta con un Webhook conectado. Para que la hoja de Google Sheets permita tanto **guardar** como **devolver los datos a todas las pantallas**:

1. Abre tu hoja de Google Sheets.
2. Ve al menú superior: **Extensiones > Apps Script**.
3. Reemplaza el código existente por este:

```javascript
function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Autopick") || SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }
  var headers = ["id", "fecha", "hora", "turno", "quien", "cantidad", "motivo", "observaciones", "timestamp"];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    rows.push(row);
  }
  return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Autopick") || SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  sheet.appendRow([
    data.id || new Date().getTime(),
    data.fecha || '',
    data.hora || '',
    data.turno || '',
    data.quien || '',
    data.cantidad || 0,
    data.motivo || '',
    data.observaciones || '',
    data.timestamp || new Date().getTime()
  ]);
  return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
}
```
4. Haz clic en **Implementar > Nueva implementación**.
5. Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario (Anyone)**.
6. Copia la URL que te da Google y pégala en la variable `WEBHOOK_URL` de `app.js`.

---

### Opción 2: Firebase Realtime Database (Instantáneo en 0.2 segundos)
Si deseas velocidad de milisegundos como WhatsApp (cuando alguien pulsa "+10" en el pasillo, en menos de medio segundo sube la curva en tu pantalla):

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) con tu cuenta de Google.
2. Crea un proyecto gratuito.
3. Entra a **Realtime Database > Crear base de datos** (modo de prueba / lectura y escritura permitida).
4. Copia la URL de tu base de datos (ej: `https://mi-tienda-rtdb.firebaseio.com`).
5. En la aplicación (menú de hamburguesa ☰ > **Sincronizar en Vivo**), pega la URL y pulsa **Guardar y Activar**.
6. ¡Listo! Todo se sincroniza en vivo de forma instantánea entre todos los dispositivos que abran tu GitHub Pages.

---

## 📋 Módulos de la Aplicación

- 📦 **Cajas Autopick Devueltas**: Contador en vivo con botones de incremento rápido (+1, +5, +10, +20, +50), registro de colaborador, motivos, selector de turnos automático, gráfico evolutivo interactivo (Chart.js) y timeline de auditoría.
- ⏰ **Problemas Vencimiento**: Formulario de alerta de productos próximos a caducar para control de mermas.
- 🏪 **Problemas Abastecimiento**: Reporte de quiebres de góndola, faltantes en sala y diferencias de inventario.
- 📈 **Planes de Acción (Modulares)**: Panel interactivo integrado para metas y seguimiento de modulares atrasados y futuros.
- 📤 **Exportación y Compartir**: Botón instantáneo para compartir resumen a WhatsApp y descarga en CSV/Excel con codificación UTF-8.
