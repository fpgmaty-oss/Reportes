function navigateTo(viewId) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    
    // Show target view
    document.getElementById(viewId).classList.add('active');
    
    // Scroll to top
    window.scrollTo(0, 0);
}

// URL del Webhook (Aquí pondrás la URL que te dé Google Script o tu servicio de automatización)
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwU-ZIb8iEBjozCscUqGW5deaQlFZiG10wayLphvHqlTWyKyZ5BUdb4xVYBfk2rzeou/exec';

// Handle form submission
document.getElementById('vencimiento-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const btn = this.querySelector('.submit-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Enviando...';
    btn.disabled = true; // Prevenir múltiples clics
    
    // 1. Recopilar los datos del formulario
    const formData = {
        tipoReporte: 'Vencimiento',
        fechaVencimiento: document.getElementById('fecha-venc').value,
        cantidad: document.getElementById('cantidad').value,
        item: document.getElementById('item-id').value,
        nombreProducto: document.getElementById('nombre-prod').value,
        remitente: document.getElementById('remitente').value,
        fechaEnvio: new Date().toLocaleString()
    };

    // Si aún no configuras el webhook, hacemos una simulación
    if (!WEBHOOK_URL) {
        setTimeout(() => {
            alert('¡Reporte de prueba exitoso!\n(Configura el Webhook para guardar en Excel/Google Sheets)');
            btn.textContent = originalText;
            btn.disabled = false;
            this.reset();
            navigateTo('home-view');
        }, 800);
        return;
    }

    // 2. Enviar los datos al Webhook
    try {
        await fetch(WEBHOOK_URL, {
            method: 'POST',
            mode: 'no-cors', // Importante para evitar problemas de seguridad del navegador
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        alert('Reporte guardado correctamente.');
        this.reset();
        navigateTo('home-view');
    } catch (error) {
        alert('Hubo un error al enviar. Intenta de nuevo.');
        console.error('Error:', error);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
});
