// ==========================================================================
// CONFIGURACIÓN & CONSTANTES
// ==========================================================================
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxJVkG6HVXtmOXgr5DAbLEnZNxeQ01e-5wh0gV7G-6nvi3JWG6pBV4ZyHQE9xfLVPSh/exec';
const AUTOPICK_STORAGE_KEY = 'reportes_autopick_records_v1';
const OPERATORS_STORAGE_KEY = 'reportes_autopick_operators_v1';

let autopickChartInstance = null;

// Helpers para normalizar motivos a solo 2 opciones válidas
function isEstante(motivo) {
    if (!motivo) return true; // Default
    const m = motivo.toLowerCase();
    return m.includes('estante') || m.includes('capacidad') || m.includes('espacio') || m.includes('góndola');
}

function isDanado(motivo) {
    if (!motivo) return false;
    const m = motivo.toLowerCase();
    return m.includes('dañ') || m.includes('roto') || m.includes('golpe') || m.includes('merma') || m.includes('fuga') || m.includes('damage');
}

function normalizeMotivo(motivo) {
    if (isDanado(motivo)) return 'Producto dañado';
    return 'Capacidad de estante';
}

// Sincronización en vivo instantánea entre pestañas / pantallas
const syncChannel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('autopick_sync_channel') : null;
if (syncChannel) {
    syncChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'UPDATE') {
            updateAutopickUI();
            showToast('Nuevas cajas registradas en otra pantalla', 'info');
        }
    };
}
window.addEventListener('storage', (e) => {
    if (e.key === AUTOPICK_STORAGE_KEY) {
        updateAutopickUI();
    }
});

// Polling de sincronización periódica cada 8 segundos
setInterval(() => {
    syncNow(false);
}, 8000);


// ==========================================================================
// NAVEGACIÓN ENTRE VISTAS
// ==========================================================================
function navigateTo(viewId) {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    
    const target = document.getElementById(viewId);
    if (target) {
        target.classList.add('active');
    }
    
    window.scrollTo(0, 0);

    // Si navegamos a autopick o al home, actualizamos las métricas
    if (viewId === 'autopick-view' || viewId === 'home-view') {
        updateAutopickUI();
    }
}

// ==========================================================================
// GESTIÓN DEL MENÚ LATERAL (DRAWER)
// ==========================================================================
function toggleDrawer(forceState) {
    const backdrop = document.getElementById('drawer-backdrop');
    const panel = document.getElementById('drawer-panel');
    if (!backdrop || !panel) return;

    const isActive = panel.classList.contains('active');
    const newState = (forceState !== undefined) ? forceState : !isActive;

    if (newState) {
        backdrop.classList.add('active');
        panel.classList.add('active');
    } else {
        backdrop.classList.remove('active');
        panel.classList.remove('active');
    }
}

// ==========================================================================
// SISTEMA DE NOTIFICACIONES TOAST
// ==========================================================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
    
    const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';
    toast.innerHTML = `<i class="material-icons">${icon}</i><span>${message}</span>`;
    
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

// ==========================================================================
// MODELO DE DATOS - CAJAS AUTOPICK
// ==========================================================================
function getAutopickRecords() {
    try {
        const data = localStorage.getItem(AUTOPICK_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('Error leyendo registros de autopick:', e);
        return [];
    }
}

function saveAutopickRecords(records) {
    try {
        localStorage.setItem(AUTOPICK_STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
        console.error('Error guardando registros de autopick:', e);
        showToast('Error de almacenamiento en el navegador', 'error');
    }
}

function getRecentOperators() {
    try {
        const data = localStorage.getItem(OPERATORS_STORAGE_KEY);
        return data ? JSON.parse(data) : ['Carlos M.', 'Andrea R.', 'Pedro S.', 'Juan P.'];
    } catch (e) {
        return [];
    }
}

function saveOperator(name) {
    if (!name) return;
    const clean = name.trim();
    let list = getRecentOperators();
    list = [clean, ...list.filter(n => n.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
    try {
        localStorage.setItem(OPERATORS_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
}

function getTodayDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function detectCurrentTurno() {
    const hour = new Date().getHours();
    if (hour >= 7 && hour < 15) return 'Mañana';
    if (hour >= 15 && hour < 23) return 'Tarde';
    return 'Noche';
}

// ==========================================================================
// CONTROLES DE CANTIDAD (STEPPER & PRESETS)
// ==========================================================================
function adjustAutopickCount(delta) {
    const input = document.getElementById('autopick-cantidad');
    if (!input) return;
    let current = parseInt(input.value, 10) || 1;
    current = Math.max(1, current + delta);
    input.value = current;
}

function setOrAddAutopickCount(qty) {
    const input = document.getElementById('autopick-cantidad');
    if (!input) return;
    let current = parseInt(input.value, 10) || 0;
    input.value = current + qty;
}

function resetAutopickInput() {
    const input = document.getElementById('autopick-cantidad');
    if (input) input.value = 1;
}

// ==========================================================================
// ENVÍO Y REGISTRO DE CAJAS DEVUELTAS
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar turno automático
    const turnoSelect = document.getElementById('autopick-turno');
    if (turnoSelect) {
        turnoSelect.value = detectCurrentTurno();
    }

    // Inicializar UI
    updateAutopickUI();

    // Event listener para el formulario de autopick
    const autopickForm = document.getElementById('autopick-form');
    if (autopickForm) {
        autopickForm.addEventListener('submit', handleAutopickSubmit);
    }

    // Event listener para vencimiento
    const vencimientoForm = document.getElementById('vencimiento-form');
    if (vencimientoForm) {
        vencimientoForm.addEventListener('submit', handleVencimientoSubmit);
    }

    // Event listener para abastecimiento
    const abastForm = document.getElementById('abastecimiento-form');
    if (abastForm) {
        abastForm.addEventListener('submit', handleAbastecimientoSubmit);
    }
});

async function handleAutopickSubmit(e) {
    e.preventDefault();

    const quienInput = document.getElementById('autopick-quien');
    const cantidadInput = document.getElementById('autopick-cantidad');
    const turnoSelect = document.getElementById('autopick-turno');
    const obsInput = document.getElementById('autopick-obs');
    const submitBtn = document.getElementById('autopick-submit-btn');

    const quien = quienInput.value.trim();
    const cantidad = parseInt(cantidadInput.value, 10);
    const turno = turnoSelect.value;
    const motivoRadio = document.querySelector('input[name="autopick-motivo"]:checked');
    const motivo = motivoRadio ? motivoRadio.value : 'Capacidad de estante';
    const observaciones = obsInput.value.trim();

    if (!quien || isNaN(cantidad) || cantidad <= 0) {
        showToast('Por favor ingresa un nombre y una cantidad válida', 'error');
        return;
    }

    const now = new Date();
    const hora = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const fecha = getTodayDateString();

    const newRecord = {
        id: 'ap_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        quien,
        cantidad,
        turno,
        motivo,
        observaciones,
        fecha,
        hora,
        timestamp: Date.now()
    };

    // 1. Guardar localmente
    const records = getAutopickRecords();
    records.unshift(newRecord);
    saveAutopickRecords(records);
    saveOperator(quien);

    if (syncChannel) {
        syncChannel.postMessage({ type: 'UPDATE' });
    }

    // Si Firebase está activo, guardar en la nube en tiempo real
    if (firebaseDbRef) {
        firebaseDbRef.child(newRecord.id).set(newRecord);
    }

    // 2. Feedback visual inmediato
    showToast(`¡Se registraron +${cantidad} cajas devueltas por ${quien}!`, 'success');
    resetAutopickInput();
    obsInput.value = '';

    // Actualizar pantalla
    updateAutopickUI();

    // 3. Sincronizar en segundo plano con el Webhook si está disponible
    if (WEBHOOK_URL) {
        const esEstante = (motivo || '').toLowerCase().includes('estante') || (motivo || '').toLowerCase().includes('capacidad');
        const payload = {
            tipoReporte: 'AutopickDevueltas',
            ...newRecord,
            cajasCapacidadEstante: esEstante ? cantidad : 0,
            cajasProductoDanado: !esEstante ? cantidad : 0,
            fechaEnvio: now.toLocaleString()
        };

        fetch(WEBHOOK_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        }).catch(err => {
            console.warn('Webhook background sync warning:', err);
        });
    }
}

// ==========================================================================
// SINCRONIZACIÓN EN VIVO (SIN EXPORTAR)
// ==========================================================================
let isSyncing = false;
async function syncNow(manual = true) {
    if (isSyncing) return;
    isSyncing = true;
    const statusText = document.getElementById('sync-status-text');
    if (statusText && manual) statusText.textContent = 'Actualizando datos...';

    try {
        if (WEBHOOK_URL) {
            const resp = await fetch(WEBHOOK_URL + '?action=getAutopick', { redirect: 'follow' });
            if (resp.ok) {
                const text = await resp.text();
                try {
                    const cloudRecords = JSON.parse(text);
                    let normalized = [];

                    if (Array.isArray(cloudRecords) && cloudRecords.length > 0) {
                        if (typeof cloudRecords[0] === 'object' && !Array.isArray(cloudRecords[0])) {
                            // Viene como lista de objetos JSON {quien, cantidad, fecha, ...}
                            normalized = cloudRecords.filter(r => r && (r.tipoReporte === 'AutopickDevueltas' || r.cantidad));
                            // Normalizar motivos a solo 2 opciones
                            normalized.forEach(r => { if (r.motivo) r.motivo = normalizeMotivo(r.motivo); });
                        } else if (Array.isArray(cloudRecords[0])) {
                            // Viene como matriz de celdas de Google Sheets [ [col1, col2, ...], ... ]
                            const headers = cloudRecords[0].map(h => String(h).toLowerCase().trim());
                            const quienIdx = headers.findIndex(h => h.includes('quien') || h.includes('operador') || h.includes('remitente'));
                            const cantIdx = headers.findIndex(h => h.includes('cantidad') || h.includes('cajas'));
                            const fechaIdx = headers.findIndex(h => h.includes('fecha'));
                            const horaIdx = headers.findIndex(h => h.includes('hora'));
                            const turnoIdx = headers.findIndex(h => h.includes('turno'));
                            const motivoIdx = headers.findIndex(h => h.includes('motivo'));
                            const obsIdx = headers.findIndex(h => h.includes('obs'));
                            const idIdx = headers.findIndex(h => h === 'id');

                            for (let i = 1; i < cloudRecords.length; i++) {
                                const row = cloudRecords[i];
                                if (!row || row.length === 0) continue;
                                const cantidad = parseInt(cantIdx !== -1 ? row[cantIdx] : row[5], 10);
                                if (isNaN(cantidad) || cantidad <= 0) continue;

                                normalized.push({
                                    id: (idIdx !== -1 && row[idIdx]) ? String(row[idIdx]) : ('gs_' + i),
                                    quien: quienIdx !== -1 ? String(row[quienIdx] || 'Operador') : 'Operador',
                                    cantidad: cantidad,
                                    turno: turnoIdx !== -1 ? String(row[turnoIdx] || 'Mañana') : 'Mañana',
                                    motivo: motivoIdx !== -1 ? normalizeMotivo(String(row[motivoIdx] || '')) : 'Capacidad de estante',
                                    observaciones: obsIdx !== -1 ? String(row[obsIdx] || '') : '',
                                    fecha: fechaIdx !== -1 ? String(row[fechaIdx] || getTodayDateString()) : getTodayDateString(),
                                    hora: horaIdx !== -1 ? String(row[horaIdx] || '12:00') : '12:00',
                                    timestamp: Date.now() - (i * 1000)
                                });
                            }
                        }

                        if (normalized.length > 0) {
                            const localRecords = getAutopickRecords();
                            const map = new Map();
                            localRecords.forEach(r => { if (r && r.id) map.set(r.id, r); });
                            normalized.forEach(r => { if (r && r.id) map.set(r.id, r); });
                            const merged = Array.from(map.values()).sort((a,b) => (b.timestamp||0) - (a.timestamp||0));
                            saveAutopickRecords(merged);
                        }
                    }
                } catch(e) {
                    console.warn('Error parseando datos de Google Sheets:', e);
                }
            }
        }
        updateAutopickUI();
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (statusText) statusText.textContent = `En Vivo · Actualizado a las ${timeStr}`;
        if (manual) showToast('Datos actualizados en tiempo real', 'success');
    } catch (e) {
        updateAutopickUI();
        if (statusText) statusText.textContent = 'En Vivo (Modo Local Activo)';
    } finally {
        isSyncing = false;
    }
}

// ==========================================================================
// ACTUALIZACIÓN DE INTERFAZ & MÉTRICAS
// ==========================================================================
function updateAutopickUI() {
    const records = getAutopickRecords();
    const todayStr = getTodayDateString();

    // Filtros
    const todayRecords = records.filter(r => r.fecha === todayStr);
    const totalHoy = todayRecords.reduce((sum, r) => sum + (Number(r.cantidad) || 0), 0);
    const totalHistorico = records.reduce((sum, r) => sum + (Number(r.cantidad) || 0), 0);
    const totalAnotaciones = records.length;

    // Desglose por motivo (solo 2: Capacidad de estante / Producto dañado)
    const cajasEstanteHoy = todayRecords
        .filter(r => isEstante(r.motivo))
        .reduce((sum, r) => sum + (Number(r.cantidad) || 0), 0);
    const cajasDanadoHoy = todayRecords
        .filter(r => isDanado(r.motivo))
        .reduce((sum, r) => sum + (Number(r.cantidad) || 0), 0);

    // Actualizar Badges en Home
    const homeCount = document.getElementById('home-autopick-count');
    if (homeCount) homeCount.textContent = totalHoy;

    // Actualizar KPIs en Vista Autopick
    const kpiHoy = document.getElementById('kpi-cajas-hoy');
    const kpiHoySub = document.getElementById('kpi-cajas-hoy-sub');
    if (kpiHoy) kpiHoy.textContent = totalHoy;
    if (kpiHoySub) {
        kpiHoySub.textContent = todayRecords.length > 0 
            ? `${todayRecords.length} registro${todayRecords.length > 1 ? 's' : ''} hoy`
            : 'Sin registros hoy';
    }

    // KPI: Capacidad de Estante
    const kpiEstante = document.getElementById('kpi-cajas-estante');
    const kpiEstanteSub = document.getElementById('kpi-estante-sub');
    if (kpiEstante) kpiEstante.textContent = cajasEstanteHoy;
    if (kpiEstanteSub) {
        kpiEstanteSub.textContent = totalHoy > 0
            ? `${Math.round(cajasEstanteHoy / totalHoy * 100)}% del total hoy`
            : '0% del total hoy';
    }

    // KPI: Producto Dañado
    const kpiDanado = document.getElementById('kpi-cajas-danado');
    const kpiDanadoSub = document.getElementById('kpi-danado-sub');
    if (kpiDanado) kpiDanado.textContent = cajasDanadoHoy;
    if (kpiDanadoSub) {
        kpiDanadoSub.textContent = totalHoy > 0
            ? `${Math.round(cajasDanadoHoy / totalHoy * 100)}% del total hoy`
            : '0% del total hoy';
    }

    const kpiTotal = document.getElementById('kpi-cajas-total');
    const kpiTotalSub = document.getElementById('kpi-total-registros');
    if (kpiTotal) kpiTotal.textContent = totalHistorico;
    if (kpiTotalSub) kpiTotalSub.textContent = `${totalAnotaciones} anotaciones en total`;

    // Último Registro
    const kpiUltimoQuien = document.getElementById('kpi-ultimo-quien');
    const kpiUltimoDetalle = document.getElementById('kpi-ultimo-detalle');
    if (records.length > 0) {
        const last = records[0];
        if (kpiUltimoQuien) kpiUltimoQuien.textContent = `${last.quien} (+${last.cantidad})`;
        if (kpiUltimoDetalle) {
            const timeAgo = formatTimeAgo(last.timestamp);
            kpiUltimoDetalle.textContent = `${timeAgo} · ${last.hora} hrs`;
        }
    } else {
        if (kpiUltimoQuien) kpiUltimoQuien.textContent = '--';
        if (kpiUltimoDetalle) kpiUltimoDetalle.textContent = 'Esperando registros';
    }

    // Mayor Aporte Hoy (Líder del día)
    const kpiTopOperador = document.getElementById('kpi-top-operador');
    const kpiTopCantidad = document.getElementById('kpi-top-cantidad');
    if (todayRecords.length > 0) {
        const operatorMap = {};
        todayRecords.forEach(r => {
            operatorMap[r.quien] = (operatorMap[r.quien] || 0) + Number(r.cantidad);
        });
        let topName = '--';
        let topCount = 0;
        for (const [name, count] of Object.entries(operatorMap)) {
            if (count > topCount) {
                topCount = count;
                topName = name;
            }
        }
        if (kpiTopOperador) kpiTopOperador.textContent = topName;
        if (kpiTopCantidad) kpiTopCantidad.textContent = `${topCount} cajas hoy`;
    } else {
        if (kpiTopOperador) kpiTopOperador.textContent = '--';
        if (kpiTopCantidad) kpiTopCantidad.textContent = '0 cajas hoy';
    }

    // Actualizar lista de operadores sugeridos
    renderOperatorsSuggestions();

    // Renderizar historial
    filterHistoryList();

    // Renderizar o actualizar gráfico
    renderAutopickChart();
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;
    return 'Días atrás';
}

function renderOperatorsSuggestions() {
    const list = getRecentOperators();
    const datalist = document.getElementById('recent-operators-list');
    const container = document.getElementById('quick-operators-container');
    const tagsWrapper = document.getElementById('quick-operators-tags');

    if (datalist) {
        datalist.innerHTML = list.map(op => `<option value="${op}">`).join('');
    }

    if (container && tagsWrapper) {
        if (list.length > 0) {
            container.style.display = 'flex';
            tagsWrapper.innerHTML = list.slice(0, 4).map(op => 
                `<button type="button" class="quick-tag-chip" onclick="selectQuickOperator('${op}')">${op}</button>`
            ).join('');
        } else {
            container.style.display = 'none';
        }
    }
}

function selectQuickOperator(name) {
    const input = document.getElementById('autopick-quien');
    if (input) {
        input.value = name;
        input.focus();
    }
}

// ==========================================================================
// HISTORIAL DE ANOTACIONES & ACCIONES
// ==========================================================================
function filterHistoryList() {
    const searchInput = document.getElementById('history-search');
    const term = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const records = getAutopickRecords();

    const filtered = term 
        ? records.filter(r => 
            (r.quien && r.quien.toLowerCase().includes(term)) ||
            (r.motivo && r.motivo.toLowerCase().includes(term)) ||
            (r.observaciones && r.observaciones.toLowerCase().includes(term)) ||
            (r.turno && r.turno.toLowerCase().includes(term))
        )
        : records;

    const badge = document.getElementById('history-total-count');
    if (badge) badge.textContent = filtered.length;

    renderHistoryDOM(filtered);
}

function renderHistoryDOM(records) {
    const container = document.getElementById('history-list');
    if (!container) return;

    if (records.length === 0) {
        container.innerHTML = `
            <div class="history-empty">
                <i class="material-icons">inbox</i>
                <p>No hay anotaciones de cajas devueltas registradas aún.</p>
                <button type="button" class="btn-sm btn-outline" style="margin-top: 10px;" onclick="loadSampleAutopickData()">
                    <i class="material-icons">science</i> Cargar datos de prueba
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = records.map(rec => {
        const initials = getInitials(rec.quien);
        const obsHtml = rec.observaciones 
            ? `<div style="font-size: 12px; color: var(--text-muted); margin-top: 4px; font-style: italic;">"${escapeHtml(rec.observaciones)}"</div>` 
            : '';

        // Determinar clase visual según motivo normalizado
        const motivoPillClass = isDanado(rec.motivo) ? 'pill-danado' : 'pill-estante';
        const motivoDisplay = normalizeMotivo(rec.motivo);

        return `
            <div class="history-item" id="rec-item-${rec.id}">
                <div class="history-item-left">
                    <div class="history-avatar">${initials}</div>
                    <div class="history-details">
                        <div class="history-top-row">
                            <span class="history-author">${escapeHtml(rec.quien)}</span>
                            <span class="history-pill pill-turno">${escapeHtml(rec.turno || 'Turno')}</span>
                            <span class="history-pill ${motivoPillClass}">${escapeHtml(motivoDisplay)}</span>
                        </div>
                        <div class="history-meta-row">
                            <i class="material-icons" style="font-size: 13px;">schedule</i>
                            <span>${rec.fecha} a las ${rec.hora}</span>
                        </div>
                        ${obsHtml}
                    </div>
                </div>

                <div class="history-item-right">
                    <div class="history-qty-badge">+${rec.cantidad}</div>
                    <div class="history-actions">
                        <button type="button" class="btn-icon-edit" title="Modificar anotación" onclick="openEditModal('${rec.id}')">
                            <i class="material-icons" style="font-size: 17px;">edit</i>
                        </button>
                        <button type="button" class="btn-icon-danger" title="Eliminar anotación" onclick="deleteAutopickRecord('${rec.id}')">
                            <i class="material-icons" style="font-size: 17px;">delete</i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getInitials(name) {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function deleteAutopickRecord(id) {
    if (!confirm('¿Deseas eliminar este registro de cajas?')) return;

    let records = getAutopickRecords();
    records = records.filter(r => r.id !== id);
    saveAutopickRecords(records);
    if (syncChannel) syncChannel.postMessage({ type: 'UPDATE' });
    if (firebaseDbRef) firebaseDbRef.child(id).remove();
    showToast('Registro eliminado', 'info');
    updateAutopickUI();
}

// ==========================================================================
// MODAL DE EDICIÓN RÁPIDA
// ==========================================================================
function openEditModal(id) {
    const records = getAutopickRecords();
    const record = records.find(r => r.id === id);
    if (!record) return;

    document.getElementById('edit-record-id').value = record.id;
    document.getElementById('edit-record-quien').value = record.quien;
    document.getElementById('edit-record-cantidad').value = record.cantidad;
    document.getElementById('edit-record-motivo').value = record.motivo || '';

    const backdrop = document.getElementById('edit-modal-backdrop');
    if (backdrop) backdrop.classList.add('active');
}

function closeEditModal() {
    const backdrop = document.getElementById('edit-modal-backdrop');
    if (backdrop) backdrop.classList.remove('active');
}

function saveEditedRecord(e) {
    e.preventDefault();
    const id = document.getElementById('edit-record-id').value;
    const quien = document.getElementById('edit-record-quien').value.trim();
    const cantidad = parseInt(document.getElementById('edit-record-cantidad').value, 10);
    const motivo = document.getElementById('edit-record-motivo').value.trim();

    if (!quien || isNaN(cantidad) || cantidad <= 0) {
        showToast('Datos inválidos', 'error');
        return;
    }

    const records = getAutopickRecords();
    const idx = records.findIndex(r => r.id === id);
    if (idx !== -1) {
        records[idx].quien = quien;
        records[idx].cantidad = cantidad;
        records[idx].motivo = motivo;
        saveAutopickRecords(records);
        if (syncChannel) syncChannel.postMessage({ type: 'UPDATE' });
        if (firebaseDbRef) firebaseDbRef.child(id).update({ quien, cantidad, motivo });
        showToast('Registro actualizado correctamente', 'success');
        closeEditModal();
        updateAutopickUI();
    }
}

// ==========================================================================
// GRÁFICO EVOLUTIVO (CHART.JS)
// ==========================================================================
function renderAutopickChart() {
    const canvas = document.getElementById('autopickChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const periodSelect = document.getElementById('chart-period-select');
    const typeSelect = document.getElementById('chart-type-select');
    const period = periodSelect ? periodSelect.value : 'hoy';
    const chartType = typeSelect ? typeSelect.value : 'acumulado';

    let records = getAutopickRecords();
    const todayStr = getTodayDateString();

    // 1. Filtrar por período
    if (period === 'hoy') {
        records = records.filter(r => r.fecha === todayStr);
    } else if (period === '7d') {
        const limitMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
        records = records.filter(r => (r.timestamp || 0) >= limitMs);
    }

    // Ordenar cronológicamente (más antiguo a más reciente) para la evolución temporal
    const sorted = [...records].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    // Si ya existe instancia previa, destruirla
    if (autopickChartInstance) {
        autopickChartInstance.destroy();
        autopickChartInstance = null;
    }

    const ctx = canvas.getContext('2d');
    const legendStats = document.getElementById('chart-legend-stats');

    // Manejo de estado vacío
    if (sorted.length === 0) {
        if (legendStats) {
            legendStats.innerHTML = `<span style="color: var(--text-muted);">Sin datos para el período seleccionado. Agrega anotaciones para trazar la curva.</span>`;
        }
        return;
    }

    // ======================================================================
    // MODO 1: CURVA ACUMULATIVA (EVOLUTIVO EN EL TIEMPO)
    // ======================================================================
    if (chartType === 'acumulado') {
        let runningTotal = 0;
        const labels = [];
        const dataPoints = [];
        const metaList = [];

        sorted.forEach(r => {
            runningTotal += Number(r.cantidad) || 0;
            const label = period === 'hoy' ? r.hora : `${r.fecha.slice(5)} ${r.hora}`;
            labels.push(label);
            dataPoints.push(runningTotal);
            metaList.push({ quien: r.quien, agregado: r.cantidad, acumulado: runningTotal });
        });

        const gradient = ctx.createLinearGradient(0, 0, 0, 260);
        gradient.addColorStop(0, 'rgba(0, 113, 206, 0.35)');
        gradient.addColorStop(1, 'rgba(0, 113, 206, 0.00)');

        autopickChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Cajas Devueltas Acumuladas',
                    data: dataPoints,
                    borderColor: '#0071ce',
                    borderWidth: 3,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#0071ce',
                    pointBorderWidth: 2,
                    pointRadius: sorted.length > 20 ? 3 : 5,
                    pointHoverRadius: 7,
                    fill: true,
                    backgroundColor: gradient,
                    tension: 0.35
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#041f41',
                        titleFont: { size: 12, weight: 'bold' },
                        bodyFont: { size: 12 },
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                const meta = metaList[context.dataIndex];
                                return [
                                    `Total acumulado: ${meta.acumulado} cajas`,
                                    `Anotó: ${meta.quien} (+${meta.agregado} cajas)`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 5, font: { size: 11 } },
                        grid: { color: 'rgba(0,0,0,0.06)' }
                    },
                    x: {
                        ticks: { font: { size: 10 }, maxRotation: 45 },
                        grid: { display: false }
                    }
                }
            }
        });

        if (legendStats) {
            legendStats.innerHTML = `
                <div class="chart-legend-item">
                    <span class="chart-legend-dot" style="background:#0071ce;"></span>
                    <span><strong>Total acumulado en período:</strong> ${runningTotal} cajas devueltas</span>
                </div>
            `;
        }
    } 
    // ======================================================================
    // MODO 2: BARRAS POR HORAS / BLOQUES
    // ======================================================================
    else if (chartType === 'bloques') {
        const timeBlocks = {};

        sorted.forEach(r => {
            let key;
            if (period === 'hoy') {
                const hourPrefix = (r.hora || '12:00').split(':')[0] + ':00';
                key = hourPrefix;
            } else {
                key = r.fecha;
            }
            timeBlocks[key] = (timeBlocks[key] || 0) + Number(r.cantidad);
        });

        const labels = Object.keys(timeBlocks);
        const data = Object.values(timeBlocks);

        autopickChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Cajas ingresadas en bloque',
                    data,
                    backgroundColor: '#ffc220',
                    borderColor: '#f59e0b',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { font: { size: 11 } },
                        grid: { color: 'rgba(0,0,0,0.06)' }
                    },
                    x: {
                        ticks: { font: { size: 11 } },
                        grid: { display: false }
                    }
                }
            }
        });

        if (legendStats) {
            const maxVal = Math.max(...data);
            legendStats.innerHTML = `
                <div class="chart-legend-item">
                    <span class="chart-legend-dot" style="background:#ffc220;"></span>
                    <span>Pico máximo en bloque: <strong>${maxVal} cajas</strong></span>
                </div>
            `;
        }
    }
    // ======================================================================
    // MODO 3: ESTANTE VS DAÑADO (Doughnut / Barras Apiladas)
    // ======================================================================
    else if (chartType === 'motivo') {
        const totalEstante = sorted.filter(r => isEstante(r.motivo)).reduce((s, r) => s + (Number(r.cantidad) || 0), 0);
        const totalDanado = sorted.filter(r => isDanado(r.motivo)).reduce((s, r) => s + (Number(r.cantidad) || 0), 0);

        autopickChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Capacidad de estante', 'Producto dañado'],
                datasets: [{
                    data: [totalEstante, totalDanado],
                    backgroundColor: ['#0071ce', '#ef4444'],
                    borderColor: ['#ffffff', '#ffffff'],
                    borderWidth: 3,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '55%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 16,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            font: { size: 13, weight: '600' }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#041f41',
                        padding: 12,
                        callbacks: {
                            label: function(context) {
                                const total = totalEstante + totalDanado;
                                const pct = total > 0 ? Math.round(context.raw / total * 100) : 0;
                                return ` ${context.label}: ${context.raw} cajas (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });

        if (legendStats) {
            const total = totalEstante + totalDanado;
            const pctEstante = total > 0 ? Math.round(totalEstante / total * 100) : 0;
            const pctDanado = total > 0 ? Math.round(totalDanado / total * 100) : 0;
            legendStats.innerHTML = `
                <div class="chart-legend-item">
                    <span class="chart-legend-dot" style="background:#0071ce;"></span>
                    <span>Estante: <strong>${totalEstante} cajas (${pctEstante}%)</strong></span>
                </div>
                <div class="chart-legend-item">
                    <span class="chart-legend-dot" style="background:#ef4444;"></span>
                    <span>Dañado: <strong>${totalDanado} cajas (${pctDanado}%)</strong></span>
                </div>
            `;
        }
    }
    // ======================================================================
    // MODO 4: POR COLABORADOR (QUIÉN ANOTÓ MÁS)
    // ======================================================================
    else if (chartType === 'operador') {
        const operatorCounts = {};
        sorted.forEach(r => {
            operatorCounts[r.quien] = (operatorCounts[r.quien] || 0) + Number(r.cantidad);
        });

        const entries = Object.entries(operatorCounts).sort((a, b) => b[1] - a[1]);
        const labels = entries.map(e => e[0]);
        const data = entries.map(e => e[1]);

        const colors = [
            '#0071ce', '#7c3aed', '#10b981', '#f59e0b', 
            '#ec4899', '#06b6d4', '#84cc16', '#64748b'
        ];

        autopickChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Cajas devueltas por colaborador',
                    data,
                    backgroundColor: labels.map((_, i) => colors[i % colors.length]),
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y', // Barra horizontal para nombres legibles
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `Devueltas: ${ctx.raw} cajas`
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.06)' }
                    },
                    y: {
                        grid: { display: false }
                    }
                }
            }
        });

        if (legendStats) {
            legendStats.innerHTML = `
                <div class="chart-legend-item">
                    <span class="chart-legend-dot" style="background:#7c3aed;"></span>
                    <span>Colaboradores activos en período: <strong>${labels.length} personas</strong></span>
                </div>
            `;
        }
    }
}

// ==========================================================================
// COMPARTIR POR WHATSAPP & RESUMEN
// ==========================================================================
function generateWhatsAppMessage() {
    const records = getAutopickRecords();
    const todayStr = getTodayDateString();
    const todayRecords = records.filter(r => r.fecha === todayStr);

    const totalHoy = todayRecords.reduce((sum, r) => sum + (Number(r.cantidad) || 0), 0);

    // Agrupar por colaborador
    const porOperador = {};
    todayRecords.forEach(r => {
        porOperador[r.quien] = (porOperador[r.quien] || 0) + Number(r.cantidad);
    });

    let listaOperadores = '';
    const sortedOps = Object.entries(porOperador).sort((a, b) => b[1] - a[1]);
    if (sortedOps.length > 0) {
        listaOperadores = sortedOps.map(([name, count]) => ` • *${name}*: ${count} cajas`).join('\n');
    } else {
        listaOperadores = ' • _Sin registros el día de hoy_';
    }

    const last = records[0];
    const ultimoText = last 
        ? `${last.hora} hrs por ${last.quien} (+${last.cantidad} cajas)` 
        : 'N/A';

    return `📦 *REPORTE DE CAJAS AUTOPICK DEVUELTAS*
📅 Fecha: ${todayStr}
━━━━━━━━━━━━━━━━━━━━━━
📊 *Total Cajas Devueltas Hoy:* ${totalHoy} cajas
📝 *Anotaciones realizadas:* ${todayRecords.length}

👥 *Detalle por Colaborador:*
${listaOperadores}

🕒 *Último ingreso:* ${ultimoText}
━━━━━━━━━━━━━━━━━━━━━━
_Portal de Reportes de Tienda_`;
}

function shareAutopickWhatsApp() {
    const text = generateWhatsAppMessage();
    const encoded = encodeURIComponent(text);
    const url = `https://api.whatsapp.com/send?text=${encoded}`;

    // Intentar copiar al portapapeles
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('¡Texto copiado al portapapeles y abriendo WhatsApp!', 'success');
        }).catch(() => {});
    }

    window.open(url, '_blank');
}

function shareQuickSummary() {
    shareAutopickWhatsApp();
}

// ==========================================================================
// EXPORTACIÓN A EXCEL (CSV CON UTF-8 BOM)
// ==========================================================================
function exportAutopickCSV() {
    const records = getAutopickRecords();
    if (records.length === 0) {
        showToast('No hay registros para exportar', 'error');
        return;
    }

    let csvContent = '\uFEFF'; // BOM para que Excel respete tildes y caracteres especiales
    csvContent += 'ID;Fecha;Hora;Turno;Colaborador;Cantidad Cajas;Motivo;Observaciones\n';

    records.forEach(r => {
        const row = [
            `"${r.id || ''}"`,
            `"${r.fecha || ''}"`,
            `"${r.hora || ''}"`,
            `"${r.turno || ''}"`,
            `"${(r.quien || '').replace(/"/g, '""')}"`,
            r.cantidad,
            `"${(r.motivo || '').replace(/"/g, '""')}"`,
            `"${(r.observaciones || '').replace(/"/g, '""')}"`
        ];
        csvContent += row.join(';') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Cajas_Autopick_Devueltas_${getTodayDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Archivo CSV descargado para Excel', 'success');
}

// ==========================================================================
// DATOS DEMO & UTILIDADES
// ==========================================================================
function loadSampleAutopickData() {
    const todayStr = getTodayDateString();
    const now = Date.now();

    const sampleRecords = [
        {
            id: 'demo_1',
            quien: 'Carlos M.',
            cantidad: 14,
            turno: 'Mañana',
            motivo: 'Capacidad de estante',
            observaciones: 'Pasillo 3, góndola de cereales llena',
            fecha: todayStr,
            hora: '08:30',
            timestamp: now - (6 * 3600 * 1000)
        },
        {
            id: 'demo_2',
            quien: 'Andrea R.',
            cantidad: 8,
            turno: 'Mañana',
            motivo: 'Producto dañado',
            observaciones: 'Cajas de galletas aplastadas',
            fecha: todayStr,
            hora: '10:45',
            timestamp: now - (4 * 3600 * 1000)
        },
        {
            id: 'demo_3',
            quien: 'Pedro S.',
            cantidad: 22,
            turno: 'Tarde',
            motivo: 'Capacidad de estante',
            observaciones: 'Pallet alto sin espacio en pasillo 5',
            fecha: todayStr,
            hora: '13:15',
            timestamp: now - (2 * 3600 * 1000)
        },
        {
            id: 'demo_4',
            quien: 'Carlos M.',
            cantidad: 19,
            turno: 'Tarde',
            motivo: 'Producto dañado',
            observaciones: 'Botellas con fuga en caja',
            fecha: todayStr,
            hora: '15:20',
            timestamp: now - (45 * 60 * 1000)
        },
        {
            id: 'demo_5',
            quien: 'Juan P.',
            cantidad: 11,
            turno: 'Tarde',
            motivo: 'Capacidad de estante',
            observaciones: 'Góndola B2 sin espacio para refrescos',
            fecha: todayStr,
            hora: '17:05',
            timestamp: now - (10 * 60 * 1000)
        }
    ];

    saveAutopickRecords(sampleRecords);
    if (syncChannel) syncChannel.postMessage({ type: 'UPDATE' });
    showToast('¡5 registros de prueba cargados con éxito!', 'success');
    updateAutopickUI();
}

function clearAllAutopickData() {
    if (!confirm('¿Estás seguro de que deseas eliminar TODOS los registros de cajas autopick? Esta acción no se puede deshacer.')) {
        return;
    }
    saveAutopickRecords([]);
    if (syncChannel) syncChannel.postMessage({ type: 'UPDATE' });
    showToast('Historial de cajas autopick vaciado', 'info');
    updateAutopickUI();
}

// ==========================================================================
// FORMULARIO: REPORTE DE VENCIMIENTO
// ==========================================================================
async function handleVencimientoSubmit(e) {
    e.preventDefault();

    const btn = this.querySelector('.submit-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="material-icons">hourglass_top</i> Enviando...';
    btn.disabled = true;

    const formData = {
        tipoReporte: 'Vencimiento',
        fechaVencimiento: document.getElementById('fecha-venc').value,
        cantidad: document.getElementById('cantidad').value,
        item: document.getElementById('item-id').value,
        nombreProducto: document.getElementById('nombre-prod').value,
        remitente: document.getElementById('remitente').value,
        fechaEnvio: new Date().toLocaleString()
    };

    try {
        if (WEBHOOK_URL) {
            await fetch(WEBHOOK_URL, {
                method: 'POST',
                body: JSON.stringify(formData),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });
        }
        showToast('Reporte de vencimiento guardado correctamente', 'success');
        this.reset();
        navigateTo('home-view');
    } catch (error) {
        console.error('Error al enviar vencimiento:', error);
        showToast('Guardado localmente. Error conectando al webhook.', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==========================================================================
// FORMULARIO: REPORTE DE ABASTECIMIENTO
// ==========================================================================
async function handleAbastecimientoSubmit(e) {
    e.preventDefault();

    const btn = this.querySelector('.submit-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="material-icons">hourglass_top</i> Enviando...';
    btn.disabled = true;

    const formData = {
        tipoReporte: 'Abastecimiento',
        tipoIncidencia: document.getElementById('abast-tipo').value,
        item: document.getElementById('abast-item').value,
        ubicacion: document.getElementById('abast-ubicacion').value,
        nombreProducto: document.getElementById('abast-producto').value,
        cantidad: document.getElementById('abast-cantidad').value,
        remitente: document.getElementById('abast-remitente').value,
        observaciones: document.getElementById('abast-obs').value,
        fechaEnvio: new Date().toLocaleString()
    };

    try {
        if (WEBHOOK_URL) {
            await fetch(WEBHOOK_URL, {
                method: 'POST',
                body: JSON.stringify(formData),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });
        }
        showToast('Reporte de abastecimiento enviado con éxito', 'success');
        this.reset();
        navigateTo('home-view');
    } catch (error) {
        console.error('Error enviando abastecimiento:', error);
        showToast('Guardado localmente. Error conectando al servidor.', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==========================================================================
// CONFIGURACIÓN DE NUBE (GITHUB PAGES + FIREBASE / GOOGLE APPS SCRIPT)
// ==========================================================================
let firebaseDbRef = null;

function openCloudModal() {
    const backdrop = document.getElementById('cloud-modal-backdrop');
    if (backdrop) {
        const input = document.getElementById('firebase-url-input');
        if (input) input.value = localStorage.getItem('reportes_firebase_url') || '';
        backdrop.classList.add('active');
    }
}

function closeCloudModal() {
    const backdrop = document.getElementById('cloud-modal-backdrop');
    if (backdrop) backdrop.classList.remove('active');
}

function openGitHubGuideModal() {
    const backdrop = document.getElementById('github-modal-backdrop');
    if (backdrop) backdrop.classList.add('active');
}

function closeGitHubGuideModal() {
    const backdrop = document.getElementById('github-modal-backdrop');
    if (backdrop) backdrop.classList.remove('active');
}

function copyAppsScriptCode() {
    const scriptCode = `// Código para Google Apps Script (Extensiones > Apps Script en tu hoja de Google Sheets)
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
}`;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(scriptCode).then(() => {
            showToast('¡Código de Apps Script copiado al portapapeles!', 'success');
        }).catch(() => {
            showToast('Error copiando. Selecciona el texto manualmente.', 'error');
        });
    }
}

function saveFirebaseConfig() {
    const input = document.getElementById('firebase-url-input');
    const url = input ? input.value.trim() : '';
    if (!url) {
        localStorage.removeItem('reportes_firebase_url');
        showToast('Configuración de Firebase eliminada. Se usará Google Sheets.', 'info');
        closeCloudModal();
        return;
    }

    localStorage.setItem('reportes_firebase_url', url);
    initFirebaseIfConfigured();
    showToast('¡Firebase activado! Sincronización en tiempo real habilitada.', 'success');
    closeCloudModal();
}

function initFirebaseIfConfigured() {
    const fbUrl = localStorage.getItem('reportes_firebase_url');
    if (!fbUrl || typeof firebase === 'undefined') return;

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp({ databaseURL: fbUrl });
        }
        firebaseDbRef = firebase.database().ref('autopick_records');
        firebaseDbRef.limitToLast(150).on('value', (snapshot) => {
            const val = snapshot.val();
            if (val) {
                const records = Object.values(val).sort((a,b) => (b.timestamp||0) - (a.timestamp||0));
                saveAutopickRecords(records);
                updateAutopickUI();
                const statusText = document.getElementById('sync-status-text');
                if (statusText) statusText.textContent = 'En Vivo (Firebase Conectado)';
            }
        });
        showToast('Conectado a Firebase en tiempo real', 'success');
    } catch(err) {
        console.warn('Firebase connection error:', err);
    }
}

// Inicializar Firebase al cargar si está configurado
document.addEventListener('DOMContentLoaded', () => {
    initFirebaseIfConfigured();
});

