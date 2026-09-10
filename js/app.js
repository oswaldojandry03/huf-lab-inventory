console.log("Sistema del Laboratorio Huf México Inicializado con Firebase");

// =============================================================
// CONFIGURACIÓN E INICIALIZACIÓN DE FIREBASE
// =============================================================
const firebaseConfig = {
  apiKey: "AIzaSyCzOL802-zVPt96gVdA4Rym0qBQyMc1crQ",
  authDomain: "laboratorio-huf.firebaseapp.com",
  projectId: "laboratorio-huf",
  storageBucket: "laboratorio-huf.firebasestorage.app",
  messagingSenderId: "160379972739",
  appId: "1:160379972739:web:36294555996ec0bc517fb6",
  measurementId: "G-H6W5VYSQ1D"
};

// Inicializar Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

var db = firebase.firestore();
var auth = firebase.auth();

// =============================================================
// ESTRUCTURAS DE DATOS LOCALES
// =============================================================
let inventarioGabinetes = {};
let inventarioLockers = {};
let listaNacho = [];
let listaTickets = [];
let listaUsuariosFirebase = {};

// USUARIO ACTUAL Y REGISTRO MASTER (AUTOLOGIN COMO SUPER_ADMIN)
let usuarioActual = "Jandry";
let rolActual = "SUPER_ADMIN";

let indiceEdicionMaterial = null;
let indiceEliminarMaterial = null;

let chartBusquedasInstancia = null;
let chartMaterialesInstancia = null;
let temporalPiezaDual = null;

// =============================================================
// HELPER: NOTIFICACIÓN IN-APP EN REEMPLAZO DE ALERT()
// =============================================================
function mostrarAlertaInApp(mensaje, titulo = "System Notification") {
    const elTitulo = document.getElementById('notif-titulo');
    const elMensaje = document.getElementById('notif-mensaje');
    if (elTitulo) elTitulo.textContent = titulo;
    if (elMensaje) elMensaje.textContent = mensaje;
    abrirModal('modal-notificacion-inapp');
}

// =============================================================
// INICIALIZACIÓN Y DESBLOQUEO INMEDIATO DE LA INTERFAZ
// =============================================================
document.addEventListener("DOMContentLoaded", () => {
    generarGabinetes();
    escucharFirestore();
    
    // FORZAR ACCESO INMEDIATO SIN BLOQUEOS
    activarInterfazSuperAdmin();
});

function activarInterfazSuperAdmin() {
    usuarioActual = "Jandry";
    rolActual = "SUPER_ADMIN";

    const labelUser = document.getElementById('usuario-login');
    if (labelUser) labelUser.textContent = "Jandry (Master)";

    const btnLogin = document.getElementById('btn-login-trigger');
    if (btnLogin) btnLogin.style.display = 'none';

    const btnReg = document.getElementById('btn-register-trigger');
    if (btnReg) btnReg.style.display = 'none';

    const btnLogout = document.getElementById('btn-logout-trigger');
    if (btnLogout) btnLogout.style.display = 'inline-block';

    const bloqueo = document.getElementById('bloqueo-pantalla');
    if (bloqueo) bloqueo.style.display = 'none';

    const contenido = document.getElementById('contenido-protegido');
    if (contenido) contenido.style.display = 'block';

    const navTabs = document.getElementById('nav-tabs-container');
    if (navTabs) navTabs.style.display = 'flex';

    const panelMaster = document.getElementById('panel-master-acciones');
    if (panelMaster) panelMaster.style.display = 'flex';

    const panelAdmin = document.getElementById('panel-admin-nacho');
    if (panelAdmin) panelAdmin.style.display = 'block';

    const tabAuditoria = document.getElementById('tab-btn-auditoria');
    if (tabAuditoria) tabAuditoria.style.display = 'block';

    setTimeout(() => {
        inicializarGraficas();
        if (typeof cargarFixturesGlobales === "function") cargarFixturesGlobales();
    }, 300);
}

// OMITIR VERIFICACIONES DE FIREBASE AUTH PARA PRUEBAS
auth.onAuthStateChanged((user) => {
    activarInterfazSuperAdmin();
});

// AUTO-REGISTRO DE USUARIOS (ESTADO PENDIENTE)
async function registrarUsuarioForm(event) {
    if (event) event.preventDefault();
    const email = document.getElementById('reg-email').value.trim();
    const name = document.getElementById('reg-nombre').value.trim();
    const password = document.getElementById('reg-password').value;

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        await db.collection("users").doc(userCredential.user.uid).set({
            email: email,
            name: name,
            role: "User",
            status: "Pending",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        cerrarModal('modal-register');
        mostrarAlertaInApp("Registration successful! Account is pending Administrator approval.", "Account Created");
    } catch (error) {
        const msgError = document.getElementById('mensaje-error-registro');
        if (msgError) {
            msgError.textContent = error.message;
            msgError.style.display = 'block';
        }
    }
}

function escucharFirestore() {
    // 1. Usuarios (Legacy Admin Panel)
    db.collection("usuarios").onSnapshot((snapshot) => {
        listaUsuariosFirebase = {};
        snapshot.forEach((doc) => {
            listaUsuariosFirebase[doc.id] = doc.data();
        });
        
        // Crear automáticamente a Jandry (Master) y Nacho (Admin) si no existen
        if (!listaUsuariosFirebase["Jandry"]) {
            db.collection("usuarios").doc("Jandry").set({ pass: "Jandrik.21", rol: "SUPER_ADMIN" });
        }
        if (!listaUsuariosFirebase["Nacho"]) {
            db.collection("usuarios").doc("Nacho").set({ pass: "Nacho.2026", rol: "ADMIN" });
        }
        
        renderizarTablaUsuarios();
    });

    // 2. Gabinetes
    db.collection("gabinetes").onSnapshot((snapshot) => {
        inventarioGabinetes = {};
        snapshot.forEach((doc) => {
            inventarioGabinetes[doc.id] = doc.data();
        });
        generarGabinetes();
    });

    // 3. Lockers
    db.collection("lockers").onSnapshot((snapshot) => {
        inventarioLockers = {};
        snapshot.forEach((doc) => {
            inventarioLockers[doc.id] = doc.data().items || [];
        });
        generarTarjetasLockers();
    });

    // 4. Catalogo Consumibles
    db.collection("catalogo_nacho").onSnapshot((snapshot) => {
        listaNacho = [];
        snapshot.forEach((doc) => {
            listaNacho.push({ firestoreId: doc.id, ...doc.data() });
        });
        renderizarCatalogoNacho();
    });

    // 5. Tickets Solicitados
    db.collection("tickets").orderBy("fechaSort", "desc").onSnapshot((snapshot) => {
        listaTickets = [];
        snapshot.forEach((doc) => {
            listaTickets.push({ firestoreId: doc.id, ...doc.data() });
        });
        renderizarTicketsNacho();
    });
}

// NAVEGACIÓN POR PESTAÑAS
function cambiarPestana(event, idTab) {
    document.querySelectorAll('#contenido-protegido .tab-content').forEach(tab => tab.classList.remove('activo'));
    document.querySelectorAll('.btn-tab').forEach(btn => btn.classList.remove('activo'));

    const tabTarget = document.getElementById(idTab);
    if (tabTarget) tabTarget.classList.add('activo');
    if (event && event.currentTarget) event.currentTarget.classList.add('activo');
}

// CONTROL DE MODALES
function abrirModal(id) { 
    const el = document.getElementById(id);
    if (el) el.style.display = 'block'; 
}

function cerrarModal(id) { 
    const el = document.getElementById(id);
    if (el) el.style.display = 'none'; 
}

// INICIAR SESIÓN Y GESTIÓN DE ROLES (MANUAL)
function iniciarSesion(event) {
    if (event) event.preventDefault();
    const uInput = document.getElementById('usuario');
    const pInput = document.getElementById('password');
    const u = uInput ? uInput.value.trim() : 'Jandry';
    const p = pInput ? pInput.value.trim() : 'Jandrik.21';
    const err = document.getElementById('mensaje-error-login');

    const esMasterDirecto = (u === "Jandry" && p === "Jandrik.21");
    const esValido = listaUsuariosFirebase[u] && listaUsuariosFirebase[u].pass === p;

    if (esMasterDirecto || esValido) {
        activarInterfazSuperAdmin();
        cerrarModal('modal-login');
        if (err) err.style.display = 'none';
    } else if (err) {
        err.textContent = "Usuario o contraseña incorrectos.";
        err.style.display = 'block';
    }
}

function cerrarSesionUI() {
    usuarioActual = null;
    rolActual = null;
    const lblUser = document.getElementById('usuario-login');
    if (lblUser) lblUser.textContent = "Guest";
    
    const btnLogin = document.getElementById('btn-login-trigger');
    if (btnLogin) btnLogin.style.display = 'inline-block';

    const btnReg = document.getElementById('btn-register-trigger');
    if (btnReg) btnReg.style.display = 'inline-block';

    const btnLogout = document.getElementById('btn-logout-trigger');
    if (btnLogout) btnLogout.style.display = 'none';

    const bloqueo = document.getElementById('bloqueo-pantalla');
    if (bloqueo) bloqueo.style.display = 'block';

    const contenido = document.getElementById('contenido-protegido');
    if (contenido) contenido.style.display = 'none';

    const navTabs = document.getElementById('nav-tabs-container');
    if (navTabs) navTabs.style.display = 'none';
}

function cerrarSesion() {
    cerrarSesionUI();
}

// REGISTRO DE AUDITORÍA
async function registrarAuditLog(action, description) {
    if (!usuarioActual) return;
    try {
        await db.collection("audit_logs").add({
            action: action,
            description: description,
            user: usuarioActual,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            dateString: new Date().toLocaleString("en-US")
        });
    } catch(e) {
        console.log("Log error:", e);
    }
}

// GESTIÓN EXCLUSIVA DE USUARIOS
async function crearNuevoUsuario(event) {
    if (event) event.preventDefault();
    if (rolActual !== "SUPER_ADMIN") return;

    const nombre = document.getElementById('nuevo-user-nombre').value.trim();
    const pass = document.getElementById('nuevo-user-pass').value.trim();
    const rol = document.getElementById('nuevo-user-rol').value;

    if (nombre && pass) {
        await db.collection("usuarios").doc(nombre).set({
            pass: pass,
            rol: rol
        });

        document.getElementById('nuevo-user-nombre').value = '';
        document.getElementById('nuevo-user-pass').value = '';
        mostrarAlertaInApp(`Usuario "${nombre}" registrado correctamente.`, "Usuario Creado");
    }
}

function renderizarTablaUsuarios() {
    const contenedor = document.getElementById('lista-usuarios-sistema');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    for (const u in listaUsuariosFirebase) {
        const item = document.createElement('div');
        item.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: #f8f9fa; padding: 8px 12px; border-radius: 6px; border: 1px solid #dee2e6;";
        
        const info = listaUsuariosFirebase[u];
        const esMaster = info.rol === "SUPER_ADMIN";
        
        const btnEliminar = esMaster ? '' : `<button onclick="eliminarUsuario('${u}')" style="background: none; border: none; color: #e30613; cursor: pointer; font-weight: bold;">&times;</button>`;

        item.innerHTML = `
            <div>
                <strong>${u}</strong> - <span style="font-size: 12px; color: #6c757d;">${info.rol}</span>
            </div>
            ${btnEliminar}
        `;
        contenedor.appendChild(item);
    }
}

async function eliminarUsuario(nombre) {
    if (confirm(`¿Eliminar al usuario ${nombre}?`)) {
        await db.collection("usuarios").doc(nombre).delete();
    }
}

// RESPALDO Y RESTAURACIÓN
function exportarDatos() {
    if (rolActual !== "SUPER_ADMIN") return;
    const dataBackup = {
        inv_gabinetes: inventarioGabinetes,
        inv_lockers_v2: inventarioLockers,
        inv_nacho: listaNacho,
        inv_tickets: listaTickets
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataBackup, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Respaldo_Inventario_Huf_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function importarDatos(event) {
    if (rolActual !== "SUPER_ADMIN") return;
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (importedData.inv_gabinetes) {
                const batch = db.batch();
                for (const key in importedData.inv_gabinetes) {
                    const ref = db.collection("gabinetes").doc(key);
                    batch.set(ref, importedData.inv_gabinetes[key]);
                }
                await batch.commit();
            }
            mostrarAlertaInApp("¡Base de datos cargada a Firebase con éxito!", "Importación Completada");
        } catch (err) {
            mostrarAlertaInApp("Error al importar el archivo JSON a la nube.", "Error");
        }
    };
    reader.readAsText(file);
}

// -------------------------------------------------------------
// GABINETES Y CAJONES
// -------------------------------------------------------------
function generarGabinetes() {
    const gab1 = document.getElementById('gabinete-1');
    if (gab1) {
        gab1.innerHTML = '';
        for (let i = 1; i <= 64; i++) gab1.appendChild(crearBotonCajon('G1', String(i).padStart(2, '0')));
    }

    const gab2 = document.getElementById('gabinete-2');
    if (gab2) {
        gab2.innerHTML = '';
        for (let i = 1; i <= 60; i++) gab2.appendChild(crearBotonCajon('G2', String(i).padStart(2, '0')));
    }

    const izq = document.getElementById('gab3-izq');
    const centro = document.getElementById('gab3-centro');
    const der = document.getElementById('gab3-der');
    if (izq && centro && der) {
        izq.innerHTML = ''; centro.innerHTML = ''; der.innerHTML = '';
        for (let i = 1; i <= 3; i++) izq.appendChild(crearBotonCajon('G3', `I${i}`));
        for (let i = 1; i <= 20; i++) centro.appendChild(crearBotonCajon('G3', `C${String(i).padStart(2,'0')}`));
        for (let i = 1; i <= 3; i++) der.appendChild(crearBotonCajon('G3', `D${i}`));
    }
}

function crearBotonCajon(gabId, num) {
    const key = `${gabId}-${num}`;
    const btn = document.createElement('button');
    btn.className = 'cajon';
    btn.setAttribute('data-key', key);
    btn.onclick = () => abrirEdicionCajon(gabId, num);

    const info = inventarioGabinetes[key] || { nombre: "Available", cant: "" };
    const textoCant = info.cant ? ` (${info.cant} pzs)` : "";
    
    btn.innerHTML = `<span class="numero">${num}</span><span class="material">${info.nombre}${textoCant}</span>`;
    return btn;
}

function abrirEdicionCajon(gabId, num) {
    const key = `${gabId}-${num}`;
    const elGab = document.getElementById('cajon-gab-id');
    const elNum = document.getElementById('cajon-num-id');
    const elTit = document.getElementById('titulo-modal-cajon');
    
    if (elGab) elGab.value = gabId;
    if (elNum) elNum.value = num;
    if (elTit) elTit.textContent = `Editar Cajón ${num} (${gabId})`;

    const info = inventarioGabinetes[key] || { nombre: "", cant: "" };
    const elNombre = document.getElementById('material-nombre');
    const elCant = document.getElementById('material-cantidad');
    if (elNombre) elNombre.value = info.nombre === "Available" ? "" : info.nombre;
    if (elCant) elCant.value = info.cant;

    abrirModal('modal-cajon');
}

async function guardarCajon(event) {
    if (event) event.preventDefault();
    const gabId = document.getElementById('cajon-gab-id').value;
    const num = document.getElementById('cajon-num-id').value;
    let nombre = document.getElementById('material-nombre').value.trim();
    let cant = document.getElementById('material-cantidad').value.trim();

    if (nombre === "" || cant === "" || parseInt(cant) === 0) {
        nombre = "Available";
        cant = "";
    }

    const key = `${gabId}-${num}`;
    await db.collection("gabinetes").doc(key).set({ nombre: nombre, cant: cant });
    registrarAuditLog("Update Cabinet", `Cabinet ${key} updated: ${nombre} (${cant})`);
    cerrarModal('modal-cajon');
}

function ejecutarBusqueda(event) {
    if (event) event.preventDefault();
    const termino = document.getElementById('buscar').value.toLowerCase().trim();
    let primerCoincidencia = null;

    document.querySelectorAll('.cajon').forEach(cajon => {
        const texto = cajon.textContent.toLowerCase();
        if (termino !== "" && texto.includes(termino)) {
            cajon.classList.add('resaltado');
            if (!primerCoincidencia) primerCoincidencia = cajon;
        } else {
            cajon.classList.remove('resaltado');
        }
    });

    if (primerCoincidencia) {
        primerCoincidencia.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// -------------------------------------------------------------
// LOCKERS (A - G)
// -------------------------------------------------------------
function generarTarjetasLockers() {
    const contenedor = document.getElementById('contenedor-lockers');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    const letras = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

    letras.forEach(letra => {
        let totalPiezas = 0;
        for (let d = 1; d <= 5; d++) {
            const key = `${letra}-${d}`;
            if (inventarioLockers[key]) {
                totalPiezas += inventarioLockers[key].length;
            }
        }

        const card = document.createElement('div');
        card.className = 'card-locker-selector';
        card.onclick = () => abrirDetalleLockerCompleto(letra);
        card.innerHTML = `
            <h3>Locker ${letra}</h3>
            <p>5 Divisiones</p>
            <p style="margin-top: 8px; font-weight: bold; color: #212529;">${totalPiezas} Fixture(s) guardados</p>
        `;
        contenedor.appendChild(card);
    });
}

function abrirDetalleLockerCompleto(letra) {
    const elTit = document.getElementById('titulo-modal-locker-detalle');
    if (elTit) elTit.textContent = `Locker ${letra} - Estantes y Piezas`;
    const cont = document.getElementById('contenido-estantes-locker');
    if (!cont) return;
    cont.innerHTML = '';

    for (let d = 1; d <= 5; d++) {
        const key = `${letra}-${d}`;
        const piezas = inventarioLockers[key] || [];

        const bloque = document.createElement('div');
        bloque.className = 'bloque-estante';

        let htmlPiezas = '';
        if (piezas.length === 0) {
            htmlPiezas = `<p style="font-size: 12px; color: #adb5bd; grid-column: 1/-1;">Sin piezas registradas en este estante.</p>`;
        } else {
            piezas.forEach((p, idx) => {
                const imgTag = p.foto ? `<img src="${p.foto}" class="img-preview-thumb" onclick="ampliarFoto('${p.foto}')" title="Clic para ampliar">` : '';
                const btnBorrar = `<button class="btn-borrar-pieza" onclick="eliminarPiezaLocker('${letra}', ${d}, ${idx})" title="Eliminar">&times;</button>`;

                htmlPiezas += `
                    <div class="card-pieza-item">
                        ${imgTag}
                        <div class="info-pieza">
                            <h5>${p.nombre}</h5>
                            <p>${p.desc || 'Sin descripción'}</p>
                        </div>
                        ${btnBorrar}
                    </div>
                `;
            });
        }

        const btnAgregar = `<button class="btn-huf-secundario" style="font-size: 11px; padding: 4px 8px;" onclick="abrirModalAgregarPieza('${letra}', ${d})">+ Agregar Fixture</button>`;

        bloque.innerHTML = `
            <div class="header-estante">
                <h4>Estante / División ${d}</h4>
                ${btnAgregar}
            </div>
            <div class="grid-piezas-estante">
                ${htmlPiezas}
            </div>
        `;
        cont.appendChild(bloque);
    }

    abrirModal('modal-locker-detalle');
}

function abrirModalAgregarPieza(letra, divNum) {
    document.getElementById('pieza-locker-id').value = letra;
    document.getElementById('pieza-div-id').value = divNum;
    document.getElementById('titulo-modal-pieza').textContent = `Agregar Fixture a Locker ${letra} (División ${divNum})`;
    
    if (document.getElementById('input-pieza-cliente')) document.getElementById('input-pieza-cliente').value = '';
    if (document.getElementById('input-pieza-nombre')) document.getElementById('input-pieza-nombre').value = '';
    if (document.getElementById('input-pieza-proyecto')) document.getElementById('input-pieza-proyecto').value = '';
    if (document.getElementById('input-pieza-desc')) document.getElementById('input-pieza-desc').value = '';
    if (document.getElementById('input-pieza-foto-file')) document.getElementById('input-pieza-foto-file').value = '';
    if (document.getElementById('input-pieza-foto-base64')) document.getElementById('input-pieza-foto-base64').value = '';
    if (document.getElementById('preview-foto-miniatura')) document.getElementById('preview-foto-miniatura').style.display = 'none';

    abrirModal('modal-editar-pieza');
}

function convertirImagenBase64(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('input-pieza-foto-base64').value = e.target.result;
            document.getElementById('img-pieza-miniatura-prev').src = e.target.result;
            document.getElementById('preview-foto-miniatura').style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function prepararGuardadoPiezaLocker(event) {
    if (event) event.preventDefault();
    const tipo = document.querySelector('input[name="tipo-objeto"]:checked')?.value || 'Auxiliary';

    temporalPiezaDual = {
        letra: document.getElementById('pieza-locker-id').value,
        divNum: document.getElementById('pieza-div-id').value,
        client: document.getElementById('input-pieza-cliente')?.value || '',
        nombre: document.getElementById('input-pieza-nombre').value,
        projectNumber: document.getElementById('input-pieza-proyecto')?.value || '',
        desc: document.getElementById('input-pieza-desc').value,
        foto: document.getElementById('input-pieza-foto-base64').value,
        tipo: tipo
    };

    if (tipo === 'Fixture') {
        abrirModal('modal-confirmar-fixture-dual');
    } else {
        await procesarGuardadoDual(false);
    }
}

async function procesarGuardadoDual(guardarEnFixtures) {
    cerrarModal('modal-confirmar-fixture-dual');
    if (!temporalPiezaDual) return;

    const key = `${temporalPiezaDual.letra}-${temporalPiezaDual.divNum}`;
    const listaActual = inventarioLockers[key] || [];
    listaActual.push(temporalPiezaDual);

    await db.collection("lockers").doc(key).set({ items: listaActual });

    if (guardarEnFixtures) {
        await db.collection("fixtures").add({
            ...temporalPiezaDual,
            lockerLocation: key,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        registrarAuditLog("Dual Save Fixture", `Fixture ${temporalPiezaDual.nombre} saved to Locker ${key} and Fixtures Directory.`);
    }

    cerrarModal('modal-editar-pieza');
    abrirDetalleLockerCompleto(temporalPiezaDual.letra);
    temporalPiezaDual = null;
}

async function guardarPiezaLocker(event) {
    await prepararGuardadoPiezaLocker(event);
}

async function eliminarPiezaLocker(letra, divNum, index) {
    if (!confirm("¿Seguro que deseas eliminar este fixture?")) return;
    const key = `${letra}-${divNum}`;
    if (inventarioLockers[key]) {
        const listaActual = inventarioLockers[key];
        const piezaEliminada = listaActual.splice(index, 1);
        await db.collection("lockers").doc(key).set({ items: listaActual });
        registrarAuditLog("Delete Locker Item", `Item ${piezaEliminada[0]?.nombre || ''} deleted from Locker ${key}`);
        abrirDetalleLockerCompleto(letra);
    }
}

function ampliarFoto(src) {
    const elImg = document.getElementById('foto-ampliada-src');
    if (elImg) elImg.src = src;
    abrirModal('modal-visor-foto');
}

function buscarLockers(event) {
    if (event) event.preventDefault();
    const termino = document.getElementById('buscar-locker').value.toLowerCase().trim();
    if (!termino) return;

    const contenedorResultados = document.getElementById('contenedor-resultados-busqueda-lockers');
    if (!contenedorResultados) return;
    contenedorResultados.innerHTML = '';

    let encontrados = [];
    for (const key in inventarioLockers) {
        inventarioLockers[key].forEach(p => {
            if (p.nombre.toLowerCase().includes(termino) || (p.desc && p.desc.toLowerCase().includes(termino))) {
                encontrados.push({ locker: key, pieza: p });
            }
        });
    }

    if (encontrados.length === 0) {
        contenedorResultados.innerHTML = `<div class="sin-resultados-texto"><p>No se encontraron fixtures que coincidan con "<strong>${termino}</strong>".</p></div>`;
    } else {
        encontrados.forEach(e => {
            const item = document.createElement('div');
            item.className = 'item-resultado-locker';
            item.innerHTML = `
                <div>
                    <h5>${e.pieza.nombre}</h5>
                    <p>${e.pieza.desc || 'Sin descripción'}</p>
                </div>
                <div class="badge-ubicacion-locker">Locker ${e.locker}</div>
            `;
            contenedorResultados.appendChild(item);
        });
    }

    abrirModal('modal-resultados-lockers');
}

// -------------------------------------------------------------
// CONSUMIBLES Y TICKETS
// -------------------------------------------------------------
function renderizarCatalogoNacho() {
    const contenedor = document.getElementById('catalogo-nacho');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    listaNacho.forEach((mat, idx) => {
        const card = document.createElement('div');
        
        let claseStock = '';
        let badgeStock = '<span class="badge-stock ok">In Stock</span>';
        if (mat.cant === 0) {
            claseStock = 'stock-agotado';
            badgeStock = '<span class="badge-stock out">Out of Stock</span>';
        } else if (mat.cant <= 5) {
            claseStock = 'stock-bajo';
            badgeStock = '<span class="badge-stock low">Low Stock</span>';
        }

        const botonesAdmin = `
            <div class="acciones-admin-material" style="margin-top: 8px;">
                <button class="btn-admin-edit" onclick="abrirModalEditarCantidad(${idx})">Editar Cantidad</button>
                <button class="btn-admin-delete" onclick="eliminarMaterialNacho(${idx})" title="Eliminar material">&times;</button>
            </div>
        `;

        card.className = `card-material ${claseStock}`;
        card.setAttribute('data-nombre', mat.nombre.toLowerCase());
        card.innerHTML = `
            <div>
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <h4>${mat.nombre}</h4>
                    ${badgeStock}
                </div>
                <p>${mat.desc}</p>
                <p style="font-size: 12px; font-weight: bold; margin-bottom: 8px;">Available: ${mat.cant} pcs</p>
            </div>
            <div>
                <button class="btn-huf" style="width: 100%; font-size: 12px;" onclick="abrirModalTicket('${mat.nombre}')" ${mat.cant === 0 ? 'disabled' : ''}>Request Material</button>
                ${botonesAdmin}
            </div>
        `;
        contenedor.appendChild(card);
    });
}

function buscarMaterialNacho(event) {
    if (event) event.preventDefault();
    const termino = document.getElementById('buscar-nacho').value.toLowerCase().trim();
    let primerCoincidencia = null;

    document.querySelectorAll('.card-material').forEach(card => {
        const texto = card.textContent.toLowerCase();
        if (termino !== "" && texto.includes(termino)) {
            card.classList.add('resaltado');
            if (!primerCoincidencia) primerCoincidencia = card;
        } else {
            card.classList.remove('resaltado');
        }
    });

    if (primerCoincidencia) {
        primerCoincidencia.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function abrirModalEditarCantidad(index) {
    indiceEdicionMaterial = index;
    const mat = listaNacho[index];
    
    document.getElementById('edit-cant-material-nombre').textContent = mat.nombre;
    document.getElementById('edit-cant-material-input').value = mat.cant;
    
    abrirModal('modal-editar-cantidad-nacho');
}

async function guardarCantidadModal(event) {
    if (event) event.preventDefault();
    const nuevaCant = parseInt(document.getElementById('edit-cant-material-input').value);
    
    if (!isNaN(nuevaCant) && indiceEdicionMaterial !== null) {
        const mat = listaNacho[indiceEdicionMaterial];
        await db.collection("catalogo_nacho").doc(mat.firestoreId).update({ cant: nuevaCant });
        registrarAuditLog("Update Stock", `Stock updated for ${mat.nombre} to ${nuevaCant}`);
        cerrarModal('modal-editar-cantidad-nacho');
    }
}

function eliminarMaterialNacho(index) {
    indiceEliminarMaterial = index;
    const mat = listaNacho[index];
    document.getElementById('nombre-eliminar-material').textContent = mat.nombre;
    abrirModal('modal-confirmar-eliminar-nacho');
}

async function confirmarEliminacionMaterial() {
    if (indiceEliminarMaterial !== null) {
        const mat = listaNacho[indiceEliminarMaterial];
        await db.collection("catalogo_nacho").doc(mat.firestoreId).delete();
        registrarAuditLog("Delete Material", `Material ${mat.nombre} removed from catalog.`);
        cerrarModal('modal-confirmar-eliminar-nacho');
        indiceEliminarMaterial = null;
    }
}

function abrirModalTicket(nombreMaterial) {
    document.getElementById('ticket-material-nombre').value = nombreMaterial;
    document.getElementById('ticket-material-mostrar').value = nombreMaterial;
    document.getElementById('ticket-solicitante-display').value = usuarioActual ? usuarioActual : 'Jandry';
    document.getElementById('ticket-cantidad').value = 1;
    document.getElementById('ticket-motivo').value = '';

    abrirModal('modal-ticket');
}

async function enviarSolicitudTicketInterno(event) {
    if (event) event.preventDefault();
    const nuevoTicket = {
        material: document.getElementById('ticket-material-nombre').value,
        solicitante: usuarioActual ? usuarioActual : 'Jandry',
        cant: document.getElementById('ticket-cantidad').value,
        motivo: document.getElementById('ticket-motivo').value,
        fecha: new Date().toLocaleString(),
        fechaSort: Date.now()
    };

    await db.collection("tickets").add(nuevoTicket);
    mostrarAlertaInApp("¡Ticket enviado con éxito!", "Solicitud Enviada");
    cerrarModal('modal-ticket');
}

function renderizarTicketsNacho() {
    const contenedor = document.getElementById('lista-tickets-contenedor');
    const badge = document.getElementById('num-tickets-pendientes');
    if (badge) badge.textContent = `${listaTickets.length} Pendientes`;

    if (!contenedor) return;

    if (listaTickets.length === 0) {
        contenedor.innerHTML = '<p style="color: #6c757d; font-size: 14px;">No hay tickets pendientes actualmente.</p>';
        return;
    }

    contenedor.innerHTML = '';

    listaTickets.forEach((t) => {
        const card = document.createElement('div');
        card.className = 'card-ticket-item';

        const btnAtender = `<button class="btn-huf" style="margin-top: 10px; font-size: 11px; padding: 6px;" onclick="completarTicket('${t.firestoreId}', '${t.material}', ${t.cant})">Marcar como Entregado / Cerrar</button>`;

        card.innerHTML = `
            <div>
                <h5>${t.material} (x${t.cant})</h5>
                <p><strong>Solicita:</strong> ${t.solicitante}</p>
                <p><strong>Uso:</strong> ${t.motivo}</p>
                <p style="font-size: 10px; color: #868e96; margin-top: 4px;">${t.fecha}</p>
            </div>
            ${btnAtender}
        `;
        contenedor.appendChild(card);
    });
}

async function completarTicket(firestoreId, materialNombre, cantidadSolicitada) {
    const matDoc = listaNacho.find(m => m.nombre === materialNombre);
    if (matDoc && cantidadSolicitada) {
        const nuevaCant = Math.max(0, matDoc.cant - parseInt(cantidadSolicitada));
        await db.collection("catalogo_nacho").doc(matDoc.firestoreId).update({ cant: nuevaCant });
    }

    await db.collection("tickets").doc(firestoreId).delete();
    registrarAuditLog("Complete Ticket", `Ticket fulfilled for ${materialNombre || 'item'} (${cantidadSolicitada || 1} pcs).`);
    mostrarAlertaInApp("Ticket fulfilled and inventory updated automatically.", "Ticket Resolved");
}

async function guardarMaterialNacho(event) {
    if (event) event.preventDefault();
    const nuevoMat = {
        nombre: document.getElementById('nacho-mat-nombre').value,
        desc: document.getElementById('nacho-mat-desc').value,
        cant: parseInt(document.getElementById('nacho-mat-cant').value) || 0
    };

    await db.collection("catalogo_nacho").add(nuevoMat);
    registrarAuditLog("Add Material", `New material added: ${nuevoMat.nombre} (${nuevoMat.cant} pcs)`);

    cerrarModal('modal-nuevo-material-nacho');
    document.getElementById('nacho-mat-nombre').value = '';
    document.getElementById('nacho-mat-desc').value = '';
    document.getElementById('nacho-mat-cant').value = '';
}

// -------------------------------------------------------------
// DASHBOARD DE ANALÍTICAS (CHART.JS)
// -------------------------------------------------------------
function inicializarGraficas() {
    const elBusquedas = document.getElementById('chartBusquedas');
    const elMateriales = document.getElementById('chartMateriales');

    if (elBusquedas && typeof Chart !== "undefined") {
        const ctxBusquedas = elBusquedas.getContext('2d');
        if (chartBusquedasInstancia) chartBusquedasInstancia.destroy();
        chartBusquedasInstancia = new Chart(ctxBusquedas, {
            type: 'line',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                datasets: [{
                    label: 'Search Frequency',
                    data: [12, 19, 3, 15, 8],
                    borderColor: '#e30613',
                    tension: 0.1
                }]
            }
        });
    }

    if (elMateriales && typeof Chart !== "undefined") {
        const ctxMateriales = elMateriales.getContext('2d');
        if (chartMaterialesInstancia) chartMaterialesInstancia.destroy();
        chartMaterialesInstancia = new Chart(ctxMateriales, {
            type: 'bar',
            data: {
                labels: ['Screws M6', 'Isolating Tape', 'Relays', 'Fuses'],
                datasets: [{
                    label: 'Units Consumed',
                    data: [65, 40, 80, 20],
                    backgroundColor: '#1a1d20'
                }]
            }
        });
    }
}

// -------------------------------------------------------------
// AUDITORÍA MENSUAL ALEATORIA
// -------------------------------------------------------------
async function generarSorteoAnualAuditoria() {
    const usersSnapshot = await db.collection("users").get();
    let usuarios = [];
    usersSnapshot.forEach(doc => {
        if (doc.data().status === "Active") usuarios.push(doc.data().name);
    });

    if (usuarios.length === 0) usuarios = ["Jandry", "Nacho", "Usuario Test"];

    usuarios.sort(() => Math.random() - 0.5);

    const meses = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    let planAnual = {};

    meses.forEach((mes) => {
        let parejasMes = [];
        let copiaUsers = [...usuarios];
        
        while (copiaUsers.length > 1) {
            const p1 = copiaUsers.pop();
            const p2 = copiaUsers.pop();
            parejasMes.push({ pair: [p1, p2], status: 'Pending', ticket: null });
        }
        
        if (copiaUsers.length === 1) {
            if (parejasMes.length > 0) {
                parejasMes[0].pair.push(copiaUsers.pop());
            } else {
                parejasMes.push({ pair: [copiaUsers.pop()], status: 'Pending', ticket: null });
            }
        }
        planAnual[mes] = parejasMes;
    });

    const currentYear = new Date().getFullYear();
    await db.collection("monthly_audits").doc(String(currentYear)).set(planAnual);
    registrarAuditLog("Generate Annual Audit", `Annual audit pairs generated for year ${currentYear}.`);
    mostrarAlertaInApp("Annual audit pairs successfully distributed for all months.", "Audit Plan Created");
}