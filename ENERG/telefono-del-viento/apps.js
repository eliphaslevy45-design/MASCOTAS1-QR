/* ============================================
   TELÉFONO DEL VIENTO - IVENARK
   Grabación conectada a Google Drive (vía Apps Script)
   ============================================ */

/* ══════════════════════════════════════════════
   CONFIGURACIÓN — AJUSTA ESTO PARA CADA MASCOTA
   ══════════════════════════════════════════════ */
const CONFIG = {
  // Pega aquí la URL de tu Apps Script (termina en /exec)
  scriptUrl: "https://script.google.com/macros/s/AKfycbxvcnIsuFru6BJQ-nUlr1n874Iu3YYBOpWwK6UFMPuGAlofz_Di0WX1npXri9abzFH1/exec",

  // Identificador único de esta mascota — debe coincidir
  // con el nombre de carpeta que usará el script en Drive.
  // Cada copia de esta carpeta "telefono-del-viento" (una por mascota)
  // debe tener su propio petId distinto.
  petId: "ENERGY-QR0000",

  maxRecordings: 5,        // mensajes guardados antes de borrar el más antiguo
  maxRecordingSeconds: 180 // duración máxima de cada mensaje (3 minutos)
};

// Variables globales
let mediaRecorder;
let chunks = [];
let recordingTimeout = null;
let recordingStartTime = null;

// Elementos del DOM
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const grabando = document.getElementById("grabando");
const halo = document.getElementById("halo");
const recordingsList = document.getElementById("recordingsList");
const pantallaFinal = document.getElementById("pantallaFinal");
const sinMensajes = document.getElementById("sinMensajes");
const petNameInput = document.getElementById("petName");

// ============================================
// SONIDOS (igual que antes, sin cambios)
// ============================================

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playPickupSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
}

function playHangupSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.2);
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.25);
}

// ============================================
// COMUNICACIÓN CON GOOGLE APPS SCRIPT / DRIVE
// ============================================

/**
 * Pide al script la lista de mensajes guardados para esta mascota
 */
async function fetchRecordings() {
    try {
        const url = `${CONFIG.scriptUrl}?petId=${encodeURIComponent(CONFIG.petId)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.ok) {
            console.error('Error del servidor al listar mensajes:', data.error);
            return [];
        }
        return data.recordings;
    } catch (e) {
        console.error('Error de red al listar mensajes:', e);
        return [];
    }
}

/**
 * Envía un audio nuevo al script para que lo guarde en Drive
 * (Content-Type text/plain evita el preflight CORS de Apps Script)
 */
async function uploadRecording(petName, base64Audio, mimeType) {
    const payload = {
        action: "upload",
        petId: CONFIG.petId,
        petName: petName,
        dedicatoria: petName,
        audio: base64Audio,
        mimeType: mimeType
    };

    const res = await fetch(CONFIG.scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    });

    return res.json();
}

/**
 * Pide al script que borre un mensaje concreto
 */
async function deleteRecordingRemote(fileId) {
    const payload = { action: "delete", fileId: fileId };
    const res = await fetch(CONFIG.scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    });
    return res.json();
}

// ============================================
// RENDERIZADO DE LA LISTA
// ============================================

async function renderRecordings() {
    recordingsList.innerHTML = '<li class="cargando-msg">Cargando mensajes…</li>';

    const recordings = await fetchRecordings();
    recordingsList.innerHTML = '';

    if (recordings.length === 0) {
        sinMensajes.style.display = 'block';
        return;
    }

    sinMensajes.style.display = 'none';

    recordings.forEach((recording, index) => {
        const li = document.createElement("li");
        li.style.animationDelay = `${index * 0.1}s`;

        const fecha = new Date(recording.timestamp).toLocaleString('es-ES', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        li.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <div>
                    <strong style="font-size: 1.1em;">💝 ${recording.petName}</strong>
                    <div style="font-size: 0.9em; opacity: 0.7; margin-top: 4px;">
                        📅 ${fecha}
                    </div>
                </div>
            </div>
            <audio controls src="${recording.audioUrl}"></audio>
            <button class="delete" data-fileid="${recording.fileId}">🗑️ Eliminar mensaje</button>
        `;

        recordingsList.appendChild(li);
    });

    document.querySelectorAll('.delete').forEach(btn => {
        btn.addEventListener('click', function () {
            const fileId = this.getAttribute('data-fileid');
            deleteRecording(fileId);
        });
    });
}

async function deleteRecording(fileId) {
    if (!confirm('¿Estás seguro de que quieres eliminar este mensaje?')) return;

    const result = await deleteRecordingRemote(fileId);
    if (!result.ok) {
        alert('No se pudo eliminar el mensaje. Inténtalo de nuevo.');
        return;
    }
    renderRecordings();
}

// ============================================
// GRABACIÓN DE AUDIO
// ============================================

btnStart.addEventListener("click", async () => {
    const petName = petNameInput.value.trim();

    if (petName === "") {
        alert("Por favor, escribe el nombre de tu mascota antes de comenzar.");
        petNameInput.focus();
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        mediaRecorder = new MediaRecorder(stream);
        chunks = [];

        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            const blob = new Blob(chunks, { type: "audio/webm" });
            stream.getTracks().forEach(track => track.stop());

            // Convertir a base64 y enviar al servidor
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = async () => {
                const base64Full = reader.result; // "data:audio/webm;base64,XXXX"
                const base64Data = base64Full.split(',')[1];

                btnStart.disabled = true;
                btnStart.querySelector('.btn-text').textContent = 'Enviando mensaje…';

                const result = await uploadRecording(petName, base64Data, 'audio/webm');

                btnStart.disabled = false;
                btnStart.querySelector('.btn-text').textContent = 'Levantar auricular';

                if (!result.ok) {
                    alert('No se pudo guardar el mensaje. Comprueba tu conexión e inténtalo de nuevo.');
                    console.error(result.error);
                    return;
                }

                petNameInput.value = '';
                showFinalScreen();
                renderRecordings();
            };
        };

        playPickupSound();
        setTimeout(() => {
            halo.classList.remove("hidden");
            grabando.classList.remove("hidden");
            btnStart.classList.add("hidden");
            btnStop.classList.remove("hidden");
        }, 100);

        mediaRecorder.start();
        recordingStartTime = Date.now();

        // Parada automática al llegar al máximo de duración
        recordingTimeout = setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                btnStop.click();
            }
        }, CONFIG.maxRecordingSeconds * 1000);

        console.log("Grabación iniciada correctamente");

    } catch (error) {
        console.error("Error al acceder al micrófono:", error);
        let errorMessage = "No se pudo acceder al micrófono. ";
        if (error.name === 'NotAllowedError') {
            errorMessage += "Por favor, permite el acceso al micrófono en la configuración de tu navegador.";
        } else if (error.name === 'NotFoundError') {
            errorMessage += "No se detectó ningún micrófono en tu dispositivo.";
        } else {
            errorMessage += "Verifica que tu micrófono esté conectado y funcionando.";
        }
        alert(errorMessage);
    }
});

btnStop.addEventListener("click", () => {
    if (recordingTimeout) {
        clearTimeout(recordingTimeout);
        recordingTimeout = null;
    }

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        playHangupSound();
    }

    setTimeout(() => {
        halo.classList.add("hidden");
        grabando.classList.add("hidden");
        btnStop.classList.add("hidden");
        btnStart.classList.remove("hidden");
    }, 100);
});

function showFinalScreen() {
    pantallaFinal.classList.remove("hidden");
    setTimeout(() => {
        pantallaFinal.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
    setTimeout(() => {
        pantallaFinal.classList.add("hidden");
    }, 8000);
}

// ============================================
// INICIALIZACIÓN
// ============================================

/**
 * IMPORTANTE: no cargamos nada al abrir la página.
 * Esta función solo se ejecuta cuando el GATE-TELEFONO-VIENTO
 * confirma la contraseña correcta (ver index.html). Así los audios
 * nunca se descargan en segundo plano mientras el gate está activo.
 */
function iniciarTelefonoViento() {
    renderRecordings();
    console.log(`
    ═══════════════════════════════════════
         TELÉFONO DEL VIENTO - IVENARK
      Conectando corazones más allá del tiempo
      Mensajes guardados en Google Drive
    ═══════════════════════════════════════
    `);
    petNameInput.focus();
}

window.addEventListener('beforeunload', (e) => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        e.preventDefault();
        e.returnValue = '¿Estás seguro? Hay una grabación en progreso que se perderá.';
        return e.returnValue;
    }
});
