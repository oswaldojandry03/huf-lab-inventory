console.log("Huf Mexico Lab System Initialized with Firebase, SweetAlert2 and EmailJS");

// =============================================================
// FIREBASE INITIALIZATION
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

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// =============================================================
// EMAILJS CONFIGURATION
// =============================================================
const EMAILJS_PUBLIC_KEY = "Yv_g3vbmg4Fal-ifm";
const EMAILJS_SERVICE_ID = "service_8kmroui";
const EMAILJS_TEMPLATE_MASTER = "template_2jadani";
const EMAILJS_TEMPLATE_APPROVED = "template_2es794q";
const MASTER_EMAIL = "oswaldojandry03@gmail.com";

let emailjsEnabled = false;

// Initialize EmailJS
if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY) {
    try {
        emailjs.init(EMAILJS_PUBLIC_KEY);
        emailjsEnabled = true;
        console.log("✅ EmailJS initialized");
    } catch (e) {
        console.warn("⚠️ EmailJS init failed:", e);
    }
} else {
    console.log("⚠️ EmailJS not configured - emails will be skipped");
}

async function sendEmailNotification(type, params) {
    if (!emailjsEnabled) {
        console.log("📧 Email skipped (EmailJS not configured):", type, params);
        return;
    }
    try {
        let templateId, payload;
        if (type === 'master') {
            templateId = EMAILJS_TEMPLATE_MASTER;
            // Template master expects: username, user_email, location
            payload = {
                to_email: MASTER_EMAIL,
                username: params.username,
                user_email: params.user_email,
                location: params.location,
                // Also provide name & email & message so the default template works
                name: params.username,
                email: params.user_email,
                message: `New user registration request from ${params.username} (${params.user_email}) at ${params.location}.`
            };
        } else if (type === 'approved') {
            templateId = EMAILJS_TEMPLATE_APPROVED;
            payload = {
                to_email: params.to_email,
                username: params.username,
                role: params.role,
                name: params.username,
                email: params.to_email,
                message: `Your account has been approved with role: ${params.role}. You can now log in.`
            };
        } else {
            return;
        }
        await emailjs.send(EMAILJS_SERVICE_ID, templateId, payload);
        console.log("📧 Email sent:", type);
    } catch (error) {
        console.error("📧 Email error:", error);
    }
}

// =============================================================
// SWEETALERT TOAST
// =============================================================
const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true
});

// =============================================================
// LOCAL DATA STRUCTURES
// =============================================================
let inventarioGabinetes = {};
let listaEstructuraGabinetes = [];
let inventarioLockers = {};
let listaNacho = [];
let listaTickets = [];
let historialTicketsGrafica = [];
let listaUsuariosFirebase = {};
let listaClientesFirebase = [];
let historialModificaciones = [];
let listaFixturesGlobales = [];

let historialBusquedasGabinetes = {};
let fechaInicioGrafica = new Date().toISOString();
let historialGraficasGuardado = [];

let chartBusquedasInstance = null;
let chartMaterialesInstance = null;

let usuarioActual = null;
let rolActual = null;

let indiceEdicionMaterial = null;
let indiceEliminarMaterial = null;

let temporizadorLimpiezaBusqueda = null;
let terminoBusquedaFixtureGlobal = '';
let contextoFixtureGlobalDesdeLocker = null;

function reiniciarTemporizadorInactividadBusqueda() {
    if (temporizadorLimpiezaBusqueda) clearTimeout(temporizadorLimpiezaBusqueda);
    temporizadorLimpiezaBusqueda = setTimeout(() => {
        document.querySelectorAll('.cajon.resaltado, .card-material.resaltado').forEach(el => {
            el.classList.remove('resaltado');
        });
    }, 60000);
}

// =============================================================
// PASSWORD HASHING (SHA-256)
// =============================================================
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// =============================================================
// SESSION PERSISTENCE
// =============================================================
const CLAVE_SESION = 'huf_session_active';

function guardarSesionLocal() {
    try {
        localStorage.setItem(CLAVE_SESION, JSON.stringify({
            usuario: usuarioActual,
            rol: rolActual,
            timestamp: Date.now()
        }));
    } catch (e) { console.warn(e); }
}

function limpiarSesionLocal() {
    try { localStorage.removeItem(CLAVE_SESION); } catch (e) { console.warn(e); }
}

function leerSesionLocal() {
    try {
        const raw = localStorage.getItem(CLAVE_SESION);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

// =============================================================
// REGISTER MODIFICATION (AUDIT LOG)
// =============================================================
async function registrarModificacion(tipo, accion, descripcion, datosAntes, datosDespues, refColeccion, refDocId) {
    try {
        if (!usuarioActual) return;
        const registro = {
            tipo, accion, descripcion,
            usuario: usuarioActual,
            rol: rolActual || 'GUEST',
            fecha: new Date().toISOString(),
            fechaLegible: new Date().toLocaleString(),
            datosAntes: datosAntes ? JSON.stringify(datosAntes) : null,
            datosDespues: datosDespues ? JSON.stringify(datosDespues) : null,
            refColeccion: refColeccion || null,
            refDocId: refDocId || null,
            revertido: false
        };
        await db.collection("historial_modificaciones").add(registro);
    } catch (error) {
        console.error("Error registering modification:", error);
    }
}

// =============================================================
// FIRESTORE LISTENERS
// =============================================================
document.addEventListener("DOMContentLoaded", () => {
    escucharFirestore();
    intentarRestaurarSesion();
});

async function migrateExistingUsers(snapshot) {
    const users = {};
    snapshot.forEach(doc => { users[doc.id] = doc.data(); });

    if (users["Jandry"] && !users["Jandry"].passwordHash) {
        const hash = await hashPassword("Jandrik.21");
        await db.collection("usuarios").doc("Jandry").set({
            email: users["Jandry"].email || "jandry@huf.com",
            username: "Jandry",
            location: users["Jandry"].location || "Huf Mexico - Puebla",
            passwordHash: hash,
            role: "SUPER_ADMIN",
            status: "active",
            createdAt: new Date().toISOString(),
            approvedAt: new Date().toISOString(),
            approvedBy: "SYSTEM"
        });
        console.log("✅ Jandry migrated to encrypted password");
    }

    if (users["Nacho"] && !users["Nacho"].passwordHash) {
        const hash = await hashPassword("Nacho.2026");
        await db.collection("usuarios").doc("Nacho").set({
            email: users["Nacho"].email || "nacho@huf.com",
            username: "Nacho",
            location: users["Nacho"].location || "Huf Mexico - Poblacion",
            passwordHash: hash,
            role: "ADMIN",
            status: "active",
            createdAt: new Date().toISOString(),
            approvedAt: new Date().toISOString(),
            approvedBy: "SYSTEM"
        });
        console.log("✅ Nacho migrated to encrypted password");
    }
}

function escucharFirestore() {
    db.collection("usuarios").onSnapshot(async (snapshot) => {
        listaUsuariosFirebase = {};
        snapshot.forEach((doc) => { listaUsuariosFirebase[doc.id] = doc.data(); });

        if (Object.keys(listaUsuariosFirebase).length > 0 && 
            (listaUsuariosFirebase["Jandry"]?.pass || listaUsuariosFirebase["Nacho"]?.pass)) {
            await migrateExistingUsers(snapshot);
            return;
        }

        renderUserTables();
    });

    db.collection("config_gabinetes").onSnapshot((snapshot) => {
        listaEstructuraGabinetes = [];
        snapshot.forEach((doc) => { listaEstructuraGabinetes.push({ id: doc.id, ...doc.data() }); });
        if (listaEstructuraGabinetes.length === 0) crearGabinetesPorDefecto();
        else generarGabinetes();
    });

    db.collection("gabinetes").onSnapshot((snapshot) => {
        inventarioGabinetes = {};
        snapshot.forEach((doc) => { inventarioGabinetes[doc.id] = doc.data(); });
        generarGabinetes();
    });

    db.collection("lockers").onSnapshot((snapshot) => {
        inventarioLockers = {};
        snapshot.forEach((doc) => { inventarioLockers[doc.id] = doc.data().items || []; });
        generarTarjetasLockers();
    });

    db.collection("catalogo_nacho").onSnapshot((snapshot) => {
        listaNacho = [];
        snapshot.forEach((doc) => { listaNacho.push({ firestoreId: doc.id, ...doc.data() }); });
        renderizarCatalogoNacho();
        actualizarGraficas();
    });

    db.collection("tickets").orderBy("fechaSort", "desc").onSnapshot((snapshot) => {
        listaTickets = [];
        snapshot.forEach((doc) => {
            let data = doc.data();
            if (!data.fechaInicio) data.fechaInicio = new Date().toISOString();
            listaTickets.push({ firestoreId: doc.id, ...data });
        });
        renderizarTicketsNacho();
    });

    db.collection("historial_tickets_grafica").onSnapshot((snapshot) => {
        historialTicketsGrafica = [];
        snapshot.forEach((doc) => { historialTicketsGrafica.push({ firestoreId: doc.id, ...doc.data() }); });
        actualizarGraficas();
    });

    db.collection("clientes").onSnapshot((snapshot) => {
        listaClientesFirebase = [];
        snapshot.forEach((doc) => { listaClientesFirebase.push({ id: doc.id, ...doc.data() }); });
        poblarSelectClientes();
        renderizarTablaClientes();
    });

    db.collection("historial_graficas").orderBy("iso", "desc").onSnapshot((snapshot) => {
        historialGraficasGuardado = [];
        snapshot.forEach((doc) => { historialGraficasGuardado.push({ id: doc.id, ...doc.data() }); });
        renderizarHistorialGraficas();
    });

    db.collection("historial_modificaciones").orderBy("fecha", "desc").limit(500).onSnapshot((snapshot) => {
        historialModificaciones = [];
        snapshot.forEach((doc) => { historialModificaciones.push({ id: doc.id, ...doc.data() }); });
        renderizarHistorialModificaciones();
    });

    db.collection("lista_fixtures_global").orderBy("cliente", "asc").onSnapshot((snapshot) => {
        listaFixturesGlobales = [];
        snapshot.forEach((doc) => { listaFixturesGlobales.push({ firestoreId: doc.id, ...doc.data() }); });
        renderizarListaFixturesGlobal();
    });
}

// =============================================================
// SESSION RESTORE
// =============================================================
function intentarRestaurarSesion() {
    const sesion = leerSesionLocal();
    if (!sesion || !sesion.usuario || !sesion.rol) return;

    let intentos = 0;
    const maxIntentos = 20;
    const intervalo = setInterval(() => {
        intentos++;
        const user = listaUsuariosFirebase[sesion.usuario];
        if (user) {
            usuarioActual = sesion.usuario;
            rolActual = user.role || sesion.rol;
            guardarSesionLocal();
            aplicarInterfazSesionIniciada();
            clearInterval(intervalo);
        } else if (intentos >= maxIntentos) {
            clearInterval(intervalo);
            limpiarSesionLocal();
        }
    }, 100);
}

function aplicarInterfazSesionIniciada() {
    const roleDisplay = rolActual === 'SUPER_ADMIN' ? 'Master' : rolActual;
    document.getElementById('usuario-login').textContent = `${usuarioActual} (${roleDisplay})`;
    document.getElementById('btn-login-trigger').style.display = 'none';
    document.getElementById('btn-logout-trigger').style.display = 'inline-block';

    document.getElementById('bloqueo-pantalla').style.display = 'none';
    document.getElementById('contenido-protegido').style.display = 'block';
    document.getElementById('nav-tabs-container').style.display = 'none';

    document.getElementById('seccion-inventario-completa').style.display = 'none';
    document.getElementById('seccion-lista-fixtures').style.display = 'none';
    document.getElementById('tab-seleccion-inicial').style.display = 'block';

    // Master panel
    if (rolActual === "SUPER_ADMIN") {
        document.getElementById('panel-master-acciones').style.display = 'flex';
    } else {
        document.getElementById('panel-master-acciones').style.display = 'none';
    }

    document.getElementById('panel-admin-clientes').style.display = 'block';

    // Show/hide "Add Client" button based on role (only admin/master)
    const btnAddClient = document.getElementById('btn-agregar-cliente');
    if (btnAddClient) {
        btnAddClient.style.display = (rolActual === "SUPER_ADMIN" || rolActual === "ADMIN") ? 'inline-block' : 'none';
    }

    if (rolActual === "SUPER_ADMIN" || rolActual === "ADMIN") {
        document.getElementById('panel-admin-nacho').style.display = 'block';
        document.getElementById('panel-admin-gabinetes').style.display = 'block';
    } else {
        document.getElementById('panel-admin-nacho').style.display = 'none';
        document.getElementById('panel-admin-gabinetes').style.display = 'none';
    }

    // EXTERNAL users: hide inventory card, redirect to fixtures
    const cardInv = document.getElementById('card-inventario-acceso');
    if (rolActual === "EXTERNAL") {
        cardInv.style.display = 'none';
        setTimeout(() => showSection('fixtures'), 300);
    } else {
        cardInv.style.display = 'block';
    }

    renderizarTicketsNacho();
    generarTarjetasLockers();
    renderizarCatalogoNacho();
    generarGabinetes();
    actualizarGraficas();
    renderizarHistorialGraficas();
    renderizarHistorialModificaciones();
    renderizarTablaClientes();
    renderizarListaFixturesGlobal();
}

async function crearGabinetesPorDefecto() {
    const batch = db.batch();
    batch.set(db.collection("config_gabinetes").doc("G1"), { nombre: "Cabinet 1: Electronic Components (8 x 8)", tipo: "GRID", filas: 8, cols: 8, esEspecial: false, color: "#ffffff" });
    batch.set(db.collection("config_gabinetes").doc("G2"), { nombre: "Cabinet 2: Standard Screws (6 x 10)", tipo: "GRID", filas: 6, cols: 10, esEspecial: false, color: "#ffffff" });
    batch.set(db.collection("config_gabinetes").doc("G3"), { nombre: "Cabinet 3: Electrical Material (Special Red)", tipo: "CUSTOM", colIzqFilas: 3, colCentroCols: 4, colCentroFilas: 5, colDerFilas: 3, color: "#fff5f5", esEspecial: true });
    await batch.commit();
}

// =============================================================
// NAVIGATION
// =============================================================
function changeTab(event, idTab) {
    document.querySelectorAll('#seccion-inventario-completa .tab-content').forEach(tab => tab.classList.remove('activo'));
    document.querySelectorAll('.btn-tab').forEach(btn => btn.classList.remove('activo'));
    document.getElementById(idTab).classList.add('activo');
    event.currentTarget.classList.add('activo');
}

function openModal(id) { document.getElementById(id).style.display = 'block'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// =============================================================
// LOGIN / LOGOUT / REGISTRATION
// =============================================================
async function login(event) {
    event.preventDefault();
    const u = document.getElementById('usuario').value.trim();
    const p = document.getElementById('password').value.trim();
    const err = document.getElementById('mensaje-error-login');

    const user = listaUsuariosFirebase[u];
    if (!user) {
        err.textContent = "User not found.";
        err.style.display = 'block';
        return;
    }

    if (user.status === "pending") {
        err.textContent = "Your account is pending approval by a Master.";
        err.style.display = 'block';
        return;
    }
    if (user.status === "rejected") {
        err.textContent = "Your account has been rejected.";
        err.style.display = 'block';
        return;
    }

    const hash = await hashPassword(p);
    if (user.passwordHash === hash) {
        usuarioActual = u;
        rolActual = user.role;
        guardarSesionLocal();
        err.style.display = 'none';
        closeModal('modal-login');
        aplicarInterfazSesionIniciada();
        Toast.fire({ icon: 'success', title: `Welcome, ${u}!` });
    } else {
        err.textContent = "Incorrect password.";
        err.style.display = 'block';
    }
}

async function registerNewUser(event) {
    event.preventDefault();
    const email = document.getElementById('reg-email').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const location = document.getElementById('reg-location').value.trim();
    const p1 = document.getElementById('reg-password').value;
    const p2 = document.getElementById('reg-password2').value;
    const err = document.getElementById('mensaje-error-registro');

    if (p1 !== p2) {
        err.textContent = "Passwords do not match.";
        err.style.display = 'block';
        return;
    }

    if (listaUsuariosFirebase[username]) {
        err.textContent = "That username is already taken.";
        err.style.display = 'block';
        return;
    }

    for (const k in listaUsuariosFirebase) {
        if (listaUsuariosFirebase[k].email === email) {
            err.textContent = "That email is already registered.";
            err.style.display = 'block';
            return;
        }
    }

    const hash = await hashPassword(p1);

    await db.collection("usuarios").doc(username).set({
        email: email,
        username: username,
        location: location,
        passwordHash: hash,
        role: "EXTERNAL",
        status: "pending",
        createdAt: new Date().toISOString()
    });

    await registrarModificacion(
        'USUARIO',
        'CREAR',
        `New registration request: "${username}" (${email}) from ${location}`,
        null,
        { username, email, location, role: 'EXTERNAL', status: 'pending' },
        'usuarios',
        username
    );

    // Send email notification to Master
    await sendEmailNotification('master', {
        username: username,
        user_email: email,
        location: location
    });

    closeModal('modal-registro');
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-username').value = '';
    document.getElementById('reg-location').value = '';
    document.getElementById('reg-password').value = '';
    document.getElementById('reg-password2').value = '';

    Swal.fire({
        icon: 'success',
        title: 'Registration Sent!',
        html: `Your account request has been sent.<br>A Master will review and approve it soon.`,
        confirmButtonColor: '#e30613'
    });
}

function logout() {
    usuarioActual = null;
    rolActual = null;
    limpiarSesionLocal();

    document.getElementById('usuario-login').textContent = "Guest";
    document.getElementById('btn-login-trigger').style.display = 'inline-block';
    document.getElementById('btn-logout-trigger').style.display = 'none';
    document.getElementById('panel-master-acciones').style.display = 'none';
    document.getElementById('panel-admin-nacho').style.display = 'none';
    document.getElementById('panel-admin-clientes').style.display = 'none';
    document.getElementById('panel-admin-gabinetes').style.display = 'none';

    document.getElementById('bloqueo-pantalla').style.display = 'block';
    document.getElementById('contenido-protegido').style.display = 'none';
    document.getElementById('nav-tabs-container').style.display = 'none';

    Toast.fire({ icon: 'info', title: 'Session closed successfully' });
}

// =============================================================
// USER MANAGEMENT (MASTER)
// =============================================================
function renderUserTables() {
    const pendientes = document.getElementById('lista-usuarios-pendientes');
    const activos = document.getElementById('lista-usuarios-sistema');
    if (!pendientes || !activos) return;

    pendientes.innerHTML = '';
    activos.innerHTML = '';

    let countPending = 0;
    let countActive = 0;

    for (const u in listaUsuariosFirebase) {
        const info = listaUsuariosFirebase[u];

        if (info.status === "pending") {
            countPending++;
            const item = document.createElement('div');
            item.style.cssText = "background: #fff3cd; border: 1px solid #ffeeba; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;";
            item.innerHTML = `
                <div>
                    <strong style="color: #856404;">${info.username || u}</strong>
                    <p style="margin: 2px 0 0 0; font-size: 12px; color: #495057;">📧 ${info.email || 'N/A'}</p>
                    <p style="margin: 0; font-size: 12px; color: #495057;">📍 ${info.location || 'N/A'}</p>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button class="btn-huf" style="padding: 6px 12px; font-size: 12px;" onclick="approveUser('${u}')">✓ Approve</button>
                    <button class="btn-huf-secundario" style="padding: 6px 12px; font-size: 12px; background-color: #e30613;" onclick="rejectUser('${u}')">✕ Reject</button>
                </div>
            `;
            pendientes.appendChild(item);
        } else if (info.status === "active") {
            countActive++;
            const item = document.createElement('div');
            item.style.cssText = "background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;";
            const esMaster = info.role === "SUPER_ADMIN";
            
            const roleOptions = `
                <select onchange="changeUserRole('${u}', this.value)" style="padding: 4px 8px; border-radius: 4px; border: 1px solid #ced4da; font-size: 12px; background: #fff;" ${esMaster ? 'disabled' : ''}>
                    <option value="EXTERNAL" ${info.role === 'EXTERNAL' ? 'selected' : ''}>EXTERNAL</option>
                    <option value="USER" ${info.role === 'USER' ? 'selected' : ''}>USER</option>
                    <option value="ADMIN" ${info.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
                    ${esMaster ? '<option value="SUPER_ADMIN" selected>SUPER_ADMIN</option>' : ''}
                </select>
            `;

            const btnEliminar = esMaster ? '' : `<button onclick="deleteUser('${u}')" style="background: none; border: none; color: #e30613; cursor: pointer; font-weight: bold; font-size: 18px;">&times;</button>`;

            item.innerHTML = `
                <div>
                    <strong>${info.username || u}</strong> <span style="font-size: 11px; color: #6c757d;">(${info.role})</span>
                    <p style="margin: 2px 0 0 0; font-size: 11px; color: #6c757d;">📧 ${info.email || 'N/A'} · 📍 ${info.location || 'N/A'}</p>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    ${roleOptions}
                    ${btnEliminar}
                </div>
            `;
            activos.appendChild(item);
        }
    }

    if (countPending === 0) {
        pendientes.innerHTML = '<p style="font-size: 13px; color: #6c757d;">No pending users.</p>';
    }
    if (countActive === 0) {
        activos.innerHTML = '<p style="font-size: 13px; color: #6c757d;">No active users.</p>';
    }
}

async function approveUser(username) {
    if (rolActual !== "SUPER_ADMIN") return;

    const user = listaUsuariosFirebase[username];
    if (!user) return;

    const { value: role } = await Swal.fire({
        title: `Approve "${username}"`,
        html: `<p style="font-size: 13px; color: #495057; text-align: left; margin-bottom: 10px;">📧 ${user.email || 'N/A'}<br>📍 ${user.location || 'N/A'}</p><p style="font-size: 13px; text-align: left;">Select the role for this user:</p>`,
        input: 'select',
        inputOptions: {
            'EXTERNAL': 'EXTERNAL - Fixtures List only',
            'USER': 'USER - Inventory (view + tickets)',
            'ADMIN': 'ADMIN - Full Inventory management'
        },
        inputValue: 'EXTERNAL',
        showCancelButton: true,
        confirmButtonColor: '#2b8a3e',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Approve',
        cancelButtonText: 'Cancel'
    });

    if (!role) return;

    await db.collection("usuarios").doc(username).update({
        status: "active",
        role: role,
        approvedAt: new Date().toISOString(),
        approvedBy: usuarioActual
    });

    await registrarModificacion(
        'USUARIO',
        'EDITAR',
        `User "${username}" approved with role ${role}`,
        { status: 'pending', role: 'EXTERNAL' },
        { status: 'active', role: role },
        'usuarios',
        username
    );

    // Send email notification to the approved user
    if (user.email) {
        await sendEmailNotification('approved', {
            username: username,
            to_email: user.email,
            role: role
        });
    }

    Toast.fire({ icon: 'success', title: `User "${username}" approved as ${role}` });
}

async function rejectUser(username) {
    if (rolActual !== "SUPER_ADMIN") return;

    const res = await Swal.fire({
        title: `Reject "${username}"?`,
        text: "The account will be marked as rejected and cannot log in.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e30613',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, reject',
        cancelButtonText: 'Cancel'
    });

    if (!res.isConfirmed) return;

    await db.collection("usuarios").doc(username).update({
        status: "rejected",
        rejectedAt: new Date().toISOString(),
        rejectedBy: usuarioActual
    });

    await registrarModificacion(
        'USUARIO',
        'EDITAR',
        `User "${username}" registration rejected`,
        { status: 'pending' },
        { status: 'rejected' },
        'usuarios',
        username
    );

    Toast.fire({ icon: 'success', title: `User "${username}" rejected` });
}

async function changeUserRole(username, newRole) {
    if (rolActual !== "SUPER_ADMIN") return;
    const user = listaUsuariosFirebase[username];
    if (!user || user.role === "SUPER_ADMIN") return;

    await db.collection("usuarios").doc(username).update({ role: newRole });

    await registrarModificacion(
        'USUARIO',
        'EDITAR',
        `User "${username}" role changed from ${user.role} to ${newRole}`,
        { role: user.role },
        { role: newRole },
        'usuarios',
        username
    );

    Toast.fire({ icon: 'success', title: `Role updated to ${newRole}` });
}

async function deleteUser(username) {
    if (rolActual !== "SUPER_ADMIN") return;
    const user = listaUsuariosFirebase[username];
    if (!user || user.role === "SUPER_ADMIN") return;

    const res = await Swal.fire({
        title: `Delete "${username}"?`,
        text: "The user account will be permanently removed.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e30613',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, delete',
        cancelButtonText: 'Cancel'
    });

    if (res.isConfirmed) {
        await db.collection("usuarios").doc(username).delete();
        await registrarModificacion('USUARIO', 'ELIMINAR', `User "${username}" deleted`, { username }, null, 'usuarios', username);
        Toast.fire({ icon: 'success', title: 'User deleted' });
    }
}

// =============================================================
// CLIENT MANAGEMENT
// =============================================================
function poblarSelectClientes() {
    const select = document.getElementById('input-pieza-cliente');
    if (!select) return;
    select.innerHTML = '<option value="">-- Select a client --</option>';
    listaClientesFirebase.forEach((c) => {
        const option = document.createElement('option');
        option.value = c.nombre;
        option.textContent = c.nombre;
        select.appendChild(option);
    });
}

function renderizarTablaClientes() {
    const contenedor = document.getElementById('lista-clientes-sistema');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    if (listaClientesFirebase.length === 0) {
        contenedor.innerHTML = '<p style="font-size: 13px; color: #6c757d; grid-column: 1/-1;">No clients registered.</p>';
        return;
    }

    const esAdmin = (rolActual === "SUPER_ADMIN" || rolActual === "ADMIN");

    listaClientesFirebase.forEach((c) => {
        const tarjeta = document.createElement('div');
        tarjeta.className = 'tarjeta-cliente-item';

        let botonesHTML = '';
        if (esAdmin) {
            botonesHTML = `
                <div style="display: flex; gap: 6px; align-items: center;">
                    <button class="btn-editar-pieza" onclick="editClientName('${c.id}', '${c.nombre}')" title="Edit Client">✏️</button>
                    <button class="btn-eliminar-cliente" onclick="confirmDeleteClient('${c.id}', '${c.nombre}')" title="Delete Client">&times;</button>
                </div>
            `;
        } else {
            botonesHTML = `<span style="font-size: 11px; color: #adb5bd; font-style: italic;">Read only</span>`;
        }

        tarjeta.innerHTML = `<span>${c.nombre}</span>${botonesHTML}`;
        contenedor.appendChild(tarjeta);
    });
}

async function saveNewClient(event) {
    event.preventDefault();
    
    // Security check: only admins can add clients
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ 
            icon: 'error', 
            title: 'Insufficient permissions', 
            text: 'Only administrators can add new clients.', 
            confirmButtonColor: '#e30613' 
        });
        return;
    }
    
    const nombreInput = document.getElementById('input-nuevo-cliente-nombre');
    const nombreVal = nombreInput.value.trim();

    if (nombreVal) {
        try {
            const docRef = await db.collection("clientes").add({ nombre: nombreVal });
            await registrarModificacion('CLIENTE', 'CREAR', `Client "${nombreVal}" added`, null, { nombre: nombreVal }, 'clientes', docRef.id);
            nombreInput.value = '';
            closeModal('modal-nuevo-cliente');
            Toast.fire({ icon: 'success', title: `Client "${nombreVal}" added` });
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Could not save the client.' });
        }
    }
}

async function editClientName(id, nombreActual) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Insufficient permissions', text: 'Only administrators can edit existing clients.', confirmButtonColor: '#e30613' });
        return;
    }

    const { value: nuevoNombre } = await Swal.fire({
        title: 'Edit client name',
        input: 'text', inputValue: nombreActual,
        showCancelButton: true, confirmButtonText: 'Save', cancelButtonText: 'Cancel',
        confirmButtonColor: '#e30613',
        inputValidator: (value) => { if (!value || !value.trim()) return 'Name cannot be empty!'; }
    });

    if (nuevoNombre && nuevoNombre.trim() !== nombreActual) {
        try {
            await db.collection("clientes").doc(id).update({ nombre: nuevoNombre.trim() });
            await registrarModificacion('CLIENTE', 'EDITAR', `Client "${nombreActual}" → "${nuevoNombre.trim()}"`, { nombre: nombreActual }, { nombre: nuevoNombre.trim() }, 'clientes', id);
            Toast.fire({ icon: 'success', title: 'Client updated' });
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Could not update the client.' });
        }
    }
}

async function confirmDeleteClient(id, nombre) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Insufficient permissions', text: 'Only administrators can delete clients.', confirmButtonColor: '#e30613' });
        return;
    }

    const res = await Swal.fire({
        title: `Delete "${nombre}"?`, text: "This action cannot be undone.",
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, delete', cancelButtonText: 'Cancel'
    });

    if (res.isConfirmed) {
        try {
            await db.collection("clientes").doc(id).delete();
            await registrarModificacion('CLIENTE', 'ELIMINAR', `Client "${nombre}" deleted`, { nombre }, null, 'clientes', id);
            Toast.fire({ icon: 'success', title: `Client "${nombre}" deleted` });
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Could not delete the client.' });
        }
    }
}

// =============================================================
// BACKUP & RESTORE
// =============================================================
function exportData() {
    if (rolActual !== "SUPER_ADMIN") return;
    const dataBackup = {
        config_gabinetes: listaEstructuraGabinetes,
        inv_gabinetes: inventarioGabinetes,
        inv_lockers_v2: inventarioLockers,
        inv_nacho: listaNacho,
        inv_tickets: listaTickets,
        historial_busquedas: historialBusquedasGabinetes,
        historial_graficas: historialGraficasGuardado,
        lista_fixtures_global: listaFixturesGlobales
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataBackup, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Huf_Inventory_Backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    Toast.fire({ icon: 'success', title: 'Backup downloaded' });
}

function importData(event) {
    if (rolActual !== "SUPER_ADMIN") return;
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            const batch = db.batch();

            if (importedData.config_gabinetes) {
                importedData.config_gabinetes.forEach(g => {
                    const ref = db.collection("config_gabinetes").doc(g.id);
                    batch.set(ref, g);
                });
            }

            if (importedData.inv_gabinetes) {
                for (const key in importedData.inv_gabinetes) {
                    batch.set(db.collection("gabinetes").doc(key), importedData.inv_gabinetes[key]);
                }
            }

            if (importedData.historial_busquedas) {
                historialBusquedasGabinetes = importedData.historial_busquedas;
            }

            await batch.commit();
            actualizarGraficas();
            Swal.fire({ icon: 'success', title: 'Import Successful', text: 'Database loaded to Firebase successfully.', confirmButtonColor: '#e30613' });
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Import Error', text: 'The JSON file has an invalid format.', confirmButtonColor: '#e30613' });
        }
    };
    reader.readAsText(file);
}

// =============================================================
// 1. CABINETS & DRAWERS
// =============================================================
function generarGabinetes() {
    const contenedor = document.getElementById('contenedor-gabinetes-dinamicos');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    const esAdmin = rolActual === "SUPER_ADMIN" || rolActual === "ADMIN";

    listaEstructuraGabinetes.forEach((gab) => {
        const wrapper = document.createElement('div');
        wrapper.className = `gabinete-wrapper ${gab.esEspecial ? 'gabinete-rojo-border' : ''}`;

        const divAcciones = esAdmin ? `
            <div class="acciones-gabinete-header">
                <button class="btn-editar-pieza" onclick="openEditCabinetModal('${gab.id}')" title="Edit Cabinet">✏️ Edit</button>
                <button class="btn-eliminar-cliente" onclick="confirmDeleteCabinet('${gab.id}', '${gab.nombre}')" title="Delete Cabinet">&times; Delete</button>
            </div>
        ` : '';

        const colorTitulo = gab.esEspecial ? 'style="color: #e30613;"' : '';

        wrapper.innerHTML = `
            <div class="header-gabinete-flex">
                <h2 ${colorTitulo}>${gab.nombre}</h2>
                ${divAcciones}
            </div>
            <div id="cuerpo-gabinete-${gab.id}" class="gabinete-contenedor-dinamico"></div>
        `;

        contenedor.appendChild(wrapper);
        const cuerpo = document.getElementById(`cuerpo-gabinete-${gab.id}`);
        if (!cuerpo) return;

        if (gab.color) {
            cuerpo.style.backgroundColor = gab.color;
            cuerpo.style.border = `1px solid ${gab.color}`;
        }

        if (gab.tipo === "ESPECIAL_G3" || gab.tipo === "CUSTOM") {
            const filasIzq = gab.colIzqFilas || 3;
            const colsCentro = gab.colCentroCols || 4;
            const filasCentro = gab.colCentroFilas || 5;
            const filasDer = gab.colDerFilas || 3;

            cuerpo.style.display = "grid";
            cuerpo.style.gridTemplateColumns = "1.5fr 4fr 1.5fr";
            cuerpo.style.gap = "12px";

            cuerpo.innerHTML = `
                <div id="gab-izq-${gab.id}" class="col-grandes" style="display: grid; grid-template-rows: repeat(${filasIzq}, 1fr); gap: 10px;"></div>
                <div id="gab-centro-${gab.id}" class="col-centro" style="display: grid; grid-template-columns: repeat(${colsCentro}, 1fr); grid-template-rows: repeat(${filasCentro}, 1fr); gap: 8px;"></div>
                <div id="gab-der-${gab.id}" class="col-grandes" style="display: grid; grid-template-rows: repeat(${filasDer}, 1fr); gap: 10px;"></div>
            `;

            const izq = document.getElementById(`gab-izq-${gab.id}`);
            const centro = document.getElementById(`gab-centro-${gab.id}`);
            const der = document.getElementById(`gab-der-${gab.id}`);

            for (let i = 1; i <= filasIzq; i++) izq.appendChild(crearBotonCajon(gab.id, `I${i}`));
            const totalCentro = colsCentro * filasCentro;
            for (let i = 1; i <= totalCentro; i++) centro.appendChild(crearBotonCajon(gab.id, `C${String(i).padStart(2,'0')}`));
            for (let i = 1; i <= filasDer; i++) der.appendChild(crearBotonCajon(gab.id, `D${i}`));

        } else if (gab.tipo === "GRID") {
            const cols = gab.cols || 6;
            const filas = gab.filas || 6;
            const total = cols * filas;
            cuerpo.style.display = "grid";
            cuerpo.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
            cuerpo.style.gap = "8px";
            for (let i = 1; i <= total; i++) cuerpo.appendChild(crearBotonCajon(gab.id, String(i).padStart(2, '0')));

        } else if (gab.tipo === "CANTIDAD") {
            const cant = gab.cant || 30;
            cuerpo.style.display = "grid";
            cuerpo.style.gridTemplateColumns = "repeat(auto-fill, minmax(110px, 1fr))";
            cuerpo.style.gap = "8px";
            for (let i = 1; i <= cant; i++) cuerpo.appendChild(crearBotonCajon(gab.id, String(i).padStart(2, '0')));
        }
    });
}

function crearBotonCajon(gabId, num) {
    const key = `${gabId}-${num}`;
    const btn = document.createElement('button');
    btn.className = 'cajon';
    btn.setAttribute('data-key', key);
    btn.onclick = () => openDrawerEdit(gabId, num);

    const info = inventarioGabinetes[key] || { nombre: "Available", cant: "" };
    const esDisponible = !info.nombre || info.nombre.trim() === "" || info.nombre === "Disponible" || info.nombre === "Available";
    const cantidadNumerica = (info.cant !== "" && info.cant !== undefined) ? parseInt(info.cant) : null;
    const sinStock = !esDisponible && cantidadNumerica !== null && cantidadNumerica <= 0;

    if (sinStock) {
        btn.style.backgroundColor = '#fff3cd';
        btn.style.borderColor = '#ffeeba';
    } else {
        btn.style.backgroundColor = '';
        btn.style.borderColor = '';
    }

    const textoNombre = esDisponible ? "Available" : info.nombre;
    let textoCant = "";
    if (!esDisponible) {
        if (sinStock) textoCant = ` <span style="color: #856404; font-weight: bold; background: #ffe8a1; padding: 1px 4px; border-radius: 3px; font-size: 10px;">Out of stock</span>`;
        else if (cantidadNumerica !== null) textoCant = ` (${cantidadNumerica} pcs)`;
    }

    btn.innerHTML = `<span class="numero">${num}</span><span class="material">${textoNombre}${textoCant}</span>`;
    return btn;
}

function openDrawerEdit(gabId, num) {
    if (!usuarioActual || (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN")) {
        Swal.fire({ icon: 'error', title: 'Insufficient permissions', text: 'Only administrators can edit components.', confirmButtonColor: '#e30613' });
        return;
    }
    const key = `${gabId}-${num}`;
    document.getElementById('cajon-gab-id').value = gabId;
    document.getElementById('cajon-num-id').value = num;
    document.getElementById('titulo-modal-cajon').textContent = `Edit Drawer ${num} (${gabId})`;

    const info = inventarioGabinetes[key] || { nombre: "", cant: "" };
    document.getElementById('material-nombre').value = (info.nombre === "Disponible" || info.nombre === "Available") ? "" : (info.nombre || "");
    document.getElementById('material-cantidad').value = info.cant !== undefined ? info.cant : "";

    const modalForm = document.querySelector('#modal-cajon form');
    let btnReset = document.getElementById('btn-reset-cajon');
    if (!btnReset) {
        btnReset = document.createElement('button');
        btnReset.type = 'button';
        btnReset.id = 'btn-reset-cajon';
        btnReset.className = 'btn-huf-secundario';
        btnReset.style.cssText = "width: 100%; margin-top: 10px; background-color: #6c757d; color: white;";
        btnReset.textContent = "Empty / Reset Drawer";
        btnReset.onclick = emptyCurrentDrawer;
        modalForm.appendChild(btnReset);
    }
    openModal('modal-cajon');
}

async function emptyCurrentDrawer() {
    const gabId = document.getElementById('cajon-gab-id').value;
    const num = document.getElementById('cajon-num-id').value;
    const key = `${gabId}-${num}`;
    const infoAnterior = inventarioGabinetes[key] || { nombre: "Available", cant: "" };
    await db.collection("gabinetes").doc(key).set({ nombre: "Available", cant: "" });
    await registrarModificacion('GABINETE', 'EDITAR', `Drawer ${num} from cabinet ${gabId} emptied`, infoAnterior, { nombre: "Available", cant: "" }, 'gabinetes', key);
    closeModal('modal-cajon');
    Toast.fire({ icon: 'success', title: `Drawer ${num} emptied` });
}

async function saveDrawer(event) {
    event.preventDefault();
    const gabId = document.getElementById('cajon-gab-id').value;
    const num = document.getElementById('cajon-num-id').value;
    const nombre = document.getElementById('material-nombre').value.trim();
    const cant = document.getElementById('material-cantidad').value.trim();
    const key = `${gabId}-${num}`;
    const infoAnterior = inventarioGabinetes[key] || { nombre: "Available", cant: "" };

    let datosNuevos;
    if (nombre === "" || nombre === "Disponible" || nombre === "Available") {
        datosNuevos = { nombre: "Available", cant: "" };
    } else {
        datosNuevos = { nombre, cant };
    }
    await db.collection("gabinetes").doc(key).set(datosNuevos);
    await registrarModificacion('GABINETE', 'EDITAR', `Drawer ${num} from cabinet ${gabId} edited: "${nombre || 'Available'}" (${cant || 0} pcs)`, infoAnterior, datosNuevos, 'gabinetes', key);
    closeModal('modal-cajon');
    Toast.fire({ icon: 'success', title: 'Drawer saved' });
}

function openCreateCabinetModal() {
    document.getElementById('gabinete-id-editar').value = '';
    document.getElementById('titulo-modal-gabinete').textContent = 'Create New Cabinet';
    document.getElementById('gabinete-nombre-input').value = '';
    document.getElementById('gabinete-tipo-select').value = 'CANTIDAD';
    document.getElementById('gabinete-color-input').value = '#e30613';
    document.getElementById('gabinete-cant-input').value = '30';
    document.getElementById('gabinete-filas-input').value = '6';
    document.getElementById('gabinete-cols-input').value = '6';
    document.getElementById('custom-col-izq-filas').value = '3';
    document.getElementById('custom-col-centro-cols').value = '4';
    document.getElementById('custom-col-centro-filas').value = '5';
    document.getElementById('custom-col-der-filas').value = '3';
    changeCabinetFormType();
    openModal('modal-nuevo-gabinete');
}

function openEditCabinetModal(id) {
    const gab = listaEstructuraGabinetes.find(g => g.id === id);
    if (!gab) return;
    document.getElementById('gabinete-id-editar').value = gab.id;
    document.getElementById('titulo-modal-gabinete').textContent = `Edit Structure of ${gab.nombre}`;
    document.getElementById('gabinete-nombre-input').value = gab.nombre;
    document.getElementById('gabinete-tipo-select').value = gab.tipo === 'ESPECIAL_G3' ? 'CUSTOM' : gab.tipo;
    document.getElementById('gabinete-color-input').value = gab.color || '#e30613';
    document.getElementById('gabinete-cant-input').value = gab.cant || '30';
    document.getElementById('gabinete-filas-input').value = gab.filas || '6';
    document.getElementById('gabinete-cols-input').value = gab.cols || '6';
    document.getElementById('custom-col-izq-filas').value = gab.colIzqFilas || '3';
    document.getElementById('custom-col-centro-cols').value = gab.colCentroCols || '4';
    document.getElementById('custom-col-centro-filas').value = gab.colCentroFilas || '5';
    document.getElementById('custom-col-der-filas').value = gab.colDerFilas || '3';
    changeCabinetFormType();
    openModal('modal-nuevo-gabinete');
}

function changeCabinetFormType() {
    const tipo = document.getElementById('gabinete-tipo-select').value;
    document.getElementById('grupo-cant-cajones').style.display = (tipo === 'CANTIDAD') ? 'block' : 'none';
    document.getElementById('grupo-grid-cajones').style.display = (tipo === 'GRID') ? 'block' : 'none';
    document.getElementById('grupo-custom-cajones').style.display = (tipo === 'CUSTOM') ? 'block' : 'none';
}

async function saveCabinetStructure(event) {
    event.preventDefault();
    const idExistente = document.getElementById('gabinete-id-editar').value;
    const nombre = document.getElementById('gabinete-nombre-input').value.trim();
    const tipo = document.getElementById('gabinete-tipo-select').value;
    const color = document.getElementById('gabinete-color-input').value;
    const docId = idExistente ? idExistente : `G_${Date.now()}`;
    const gabAnterior = idExistente ? listaEstructuraGabinetes.find(g => g.id === idExistente) : null;

    let datosGabinete = { nombre, tipo, color, esEspecial: tipo === 'CUSTOM' };

    if (tipo === 'GRID') {
        datosGabinete.filas = parseInt(document.getElementById('gabinete-filas-input').value) || 6;
        datosGabinete.cols = parseInt(document.getElementById('gabinete-cols-input').value) || 6;
    } else if (tipo === 'CUSTOM') {
        datosGabinete.colIzqFilas = parseInt(document.getElementById('custom-col-izq-filas').value) || 3;
        datosGabinete.colCentroCols = parseInt(document.getElementById('custom-col-centro-cols').value) || 4;
        datosGabinete.colCentroFilas = parseInt(document.getElementById('custom-col-centro-filas').value) || 5;
        datosGabinete.colDerFilas = parseInt(document.getElementById('custom-col-der-filas').value) || 3;
    } else {
        datosGabinete.cant = parseInt(document.getElementById('gabinete-cant-input').value) || 30;
    }

    await db.collection("config_gabinetes").doc(docId).set(datosGabinete, { merge: true });
    await registrarModificacion('GABINETE', idExistente ? 'EDITAR' : 'CREAR', idExistente ? `Cabinet "${nombre}" structure edited` : `Cabinet "${nombre}" created`, gabAnterior, datosGabinete, 'config_gabinetes', docId);
    closeModal('modal-nuevo-gabinete');
    Toast.fire({ icon: 'success', title: idExistente ? 'Cabinet updated' : 'New cabinet created' });
}

async function confirmDeleteCabinet(id, nombre) {
    const res = await Swal.fire({
        title: `Delete "${nombre}"?`,
        text: "The cabinet will be removed. Drawer records will be kept in the database for safety.",
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, delete cabinet', cancelButtonText: 'Cancel'
    });

    if (res.isConfirmed) {
        const gabAnterior = listaEstructuraGabinetes.find(g => g.id === id);
        await db.collection("config_gabinetes").doc(id).delete();
        await registrarModificacion('GABINETE', 'ELIMINAR', `Cabinet "${nombre}" deleted`, gabAnterior, null, 'config_gabinetes', id);
        Toast.fire({ icon: 'success', title: 'Cabinet deleted' });
    }
}

function runSearch(event) {
    event.preventDefault();
    const termino = document.getElementById('buscar').value.toLowerCase().trim();
    if (!termino) return;
    let primerCoincidencia = null;

    document.querySelectorAll('.cajon').forEach(cajon => {
        const texto = cajon.textContent.toLowerCase();
        if (texto.includes(termino)) {
            cajon.classList.add('resaltado');
            if (!primerCoincidencia) primerCoincidencia = cajon;
            const spanMaterial = cajon.querySelector('.material');
            if (spanMaterial) {
                let nombreMaterial = spanMaterial.textContent.split('(')[0].trim();
                if (nombreMaterial && nombreMaterial !== "Disponible" && nombreMaterial !== "Available") {
                    historialBusquedasGabinetes[nombreMaterial] = (historialBusquedasGabinetes[nombreMaterial] || 0) + 1;
                }
            }
        } else cajon.classList.remove('resaltado');
    });

    actualizarGraficas();
    reiniciarTemporizadorInactividadBusqueda();
    if (primerCoincidencia) primerCoincidencia.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function searchMaterial(event) {
    event.preventDefault();
    const termino = document.getElementById('buscar-nacho').value.toLowerCase().trim();
    if (!termino) return;
    let primerCoincidencia = null;

    document.querySelectorAll('.card-material').forEach(card => {
        const texto = card.textContent.toLowerCase();
        if (texto.includes(termino)) {
            card.classList.add('resaltado');
            if (!primerCoincidencia) primerCoincidencia = card;
        } else card.classList.remove('resaltado');
    });

    reiniciarTemporizadorInactividadBusqueda();
    if (primerCoincidencia) primerCoincidencia.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function searchLockers(event) {
    event.preventDefault();
    const termino = document.getElementById('buscar-locker').value.toLowerCase().trim();
    if (!termino) return;
    let resultados = [];

    for (const letra of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
        for (let d = 1; d <= 5; d++) {
            const key = `${letra}-${d}`;
            const piezas = inventarioLockers[key] || [];
            piezas.forEach(p => {
                const textoCompleto = `${p.nombre} ${p.cliente} ${p.localidad} ${p.proyecto} ${p.desc}`.toLowerCase();
                if (textoCompleto.includes(termino)) resultados.push({ locker: letra, estante: d, ...p });
            });
        }
    }

    const contResultados = document.getElementById('contenedor-resultados-busqueda-lockers');
    contResultados.innerHTML = '';

    if (resultados.length === 0) {
        contResultados.innerHTML = `<p style="font-size:13px; color:#6c757d; text-align:center; padding:15px;">No fixtures or equipment found for "${termino}".</p>`;
    } else {
        resultados.forEach(r => {
            const item = document.createElement('div');
            item.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:12px; background:#f8f9fa; border:1px solid #dee2e6; border-radius:8px; margin-bottom:10px;";
            item.innerHTML = `
                <div>
                    <h5 style="margin:0 0 4px 0; color:#e30613; font-size:14px;">${r.nombre}</h5>
                    <p style="margin:0; font-size:12px; color:#495057;"><strong>Client:</strong> ${r.cliente || 'N/A'} | <strong>Project:</strong> ${r.proyecto || 'N/A'}</p>
                    <p style="margin:2px 0 0 0; font-size:11px; color:#6c757d;">${r.localidad || 'No location'}</p>
                </div>
                <div style="background:#1a1d20; color:#ffffff; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:bold; white-space:nowrap;">Locker ${r.locker} - Div ${r.estante}</div>
            `;
            contResultados.appendChild(item);
        });
    }
    openModal('modal-resultados-lockers');
}

// =============================================================
// 2. LOCKERS & FIXTURES
// =============================================================
function generarTarjetasLockers() {
    const contenedor = document.getElementById('contenedor-lockers');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    contenedor.style.display = "grid";
    contenedor.style.gridTemplateColumns = "repeat(auto-fill, minmax(180px, 1fr))";
    contenedor.style.gap = "15px";

    const letras = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

    letras.forEach(letra => {
        let totalPiezas = 0;
        for (let d = 1; d <= 5; d++) {
            const key = `${letra}-${d}`;
            if (inventarioLockers[key]) totalPiezas += inventarioLockers[key].length;
        }

        const card = document.createElement('div');
        card.style.cssText = "background: #ffffff; border: 2px solid #e9ecef; border-radius: 10px; padding: 20px; text-align: center; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 2px 6px rgba(0,0,0,0.03);";
        card.onmouseover = () => { card.style.borderColor = "#e30613"; card.style.transform = "translateY(-2px)"; };
        card.onmouseout = () => { card.style.borderColor = "#e9ecef"; card.style.transform = "none"; };
        card.onclick = () => openLockerDetail(letra);
        card.innerHTML = `
            <h3 style="color: #e30613; margin-bottom: 5px; font-size: 18px;">Locker ${letra}</h3>
            <p style="font-size: 12px; color: #6c757d; margin-bottom: 8px;">5 Compartments</p>
            <p style="margin-top: 8px; font-weight: bold; color: #212529; font-size: 13px; background: #f8f9fa; padding: 6px; border-radius: 6px;">${totalPiezas} Fixture(s) stored</p>
        `;
        contenedor.appendChild(card);
    });
}

function openLockerDetail(letra) {
    document.getElementById('titulo-modal-locker-detalle').textContent = `Locker ${letra} - Shelves & Pieces`;
    const cont = document.getElementById('contenido-estantes-locker');
    cont.innerHTML = '';
    const esAdmin = rolActual === "SUPER_ADMIN" || rolActual === "ADMIN";

    for (let d = 1; d <= 5; d++) {
        const key = `${letra}-${d}`;
        const piezas = inventarioLockers[key] || [];
        const bloque = document.createElement('div');
        bloque.style.cssText = "background:#ffffff; border:1px solid #dee2e6; border-radius:8px; padding:15px; margin-bottom:15px;";

        let htmlPiezas = '';
        if (piezas.length === 0) {
            htmlPiezas = `<p style="font-size: 12px; color: #adb5bd; grid-column: 1/-1;">No pieces registered on this shelf.</p>`;
        } else {
            piezas.forEach((p, idx) => {
                const imgTag = p.foto ? `<img src="${p.foto}" style="width:70px; height:70px; object-fit:cover; border-radius:6px; cursor:pointer;" onclick="enlargePhoto('${p.foto}')" title="Click to enlarge">` : '';
                const btnAcciones = esAdmin ? `
                    <div style="display:flex; gap:4px; margin-top:8px;">
                        <button class="btn-editar-pieza" style="background:#e9ecef; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="openEditPieceModal('${letra}', ${d}, ${idx})" title="Edit Fixture">✏️</button>
                        <button class="btn-borrar-pieza" style="background:#fff3cd; border:none; color:#e30613; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:bold;" onclick="deleteLockerPiece('${letra}', ${d}, ${idx})" title="Delete">&times;</button>
                    </div>
                ` : '';

                const fixtureJSON = JSON.stringify(p).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

                htmlPiezas += `
                    <div style="background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; padding:12px; display:flex; gap:12px; align-items:flex-start; position:relative;">
                        ${imgTag}
                        <div style="flex:1;">
                            <h5 style="margin:0 0 5px 0; font-size:14px; color:#1a1d20;">${p.nombre}</h5>
                            <p style="margin:0; font-size:11px; color:#495057;"><strong>Client:</strong> ${p.cliente || 'N/A'}</p>
                            <p style="margin:0; font-size:11px; color:#495057;"><strong>Location:</strong> ${p.localidad || 'N/A'}</p>
                            <p style="margin:0; font-size:11px; color:#495057;"><strong>Project:</strong> ${p.proyecto || 'N/A'}</p>
                            <button style="margin-top:6px; background:none; border:none; color:#e30613; font-size:11px; font-weight:bold; padding:0; cursor:pointer; text-decoration:underline;" onclick='viewFullFixtureDetail(${fixtureJSON})'>View more / Details</button>
                            ${btnAcciones}
                        </div>
                    </div>
                `;
            });
        }

        const btnAgregar = usuarioActual ? `<button class="btn-huf-secundario" style="font-size: 11px; padding: 4px 8px;" onclick="openAddPieceModal('${letra}', ${d})">+ Add Fixture</button>` : '';

        bloque.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #f1f3f5; padding-bottom:8px; margin-bottom:12px;">
                <h4 style="margin:0; font-size:14px; color:#343a40;">Shelf / Compartment ${d}</h4>
                ${btnAgregar}
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:12px;">
                ${htmlPiezas}
            </div>
        `;
        cont.appendChild(bloque);
    }
    openModal('modal-locker-detalle');
}

function viewFullFixtureDetail(fixture) {
    const imagenHTML = fixture.foto 
        ? `<img src="${fixture.foto}" style="max-width: 100%; max-height: 250px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #dee2e6;">` 
        : '<p style="color: #6c757d; font-style: italic; margin-bottom: 15px;">No photo attached</p>';

    Swal.fire({
        title: fixture.nombre,
        html: `
            <div style="text-align: left; font-size: 14px;">
                <div style="text-align: center;">${imagenHTML}</div>
                <p><strong>Client:</strong> ${fixture.cliente || 'N/A'}</p>
                <p><strong>Location:</strong> ${fixture.localidad || 'N/A'}</p>
                <p><strong>Project:</strong> ${fixture.proyecto || 'N/A'}</p>
                <hr style="margin: 10px 0;">
                <p><strong>Full description:</strong></p>
                <div style="background: #f8f9fa; padding: 10px; border-radius: 6px; border: 1px solid #e9ecef; max-height: 200px; overflow-y: auto; white-space: pre-wrap; word-break: break-word;">
                    ${fixture.desc || 'No additional description.'}
                </div>
            </div>
        `,
        confirmButtonText: 'Close', confirmButtonColor: '#e30613'
    });
}

function openAddPieceModal(letra, divNum) {
    document.getElementById('pieza-locker-id').value = letra;
    document.getElementById('pieza-div-id').value = divNum;
    document.getElementById('pieza-index').value = '';
    document.getElementById('titulo-modal-pieza').textContent = `Add Fixture to Locker ${letra} (Compartment ${divNum})`;
    document.getElementById('input-pieza-nombre').value = '';
    document.getElementById('input-pieza-cliente').value = '';
    document.getElementById('input-pieza-localidad').value = '';
    const proj1 = document.getElementById('proj-part1');
    const proj2 = document.getElementById('proj-part2');
    if (proj1) proj1.value = '';
    if (proj2) proj2.value = '';
    document.getElementById('input-pieza-proyecto').value = '';
    document.getElementById('input-pieza-desc').value = '';
    document.getElementById('input-pieza-foto-file').value = '';
    document.getElementById('input-pieza-foto-base64').value = '';
    document.getElementById('preview-foto-miniatura').style.display = 'none';
    const check = document.getElementById('check-agregar-a-lista-global');
    if (check) check.checked = false;

    poblarSelectClientes();
    openModal('modal-editar-pieza');
}

function openEditPieceModal(letra, divNum, index) {
    const key = `${letra}-${divNum}`;
    const pieza = inventarioLockers[key][index];
    if (!pieza) return;
    poblarSelectClientes();

    document.getElementById('pieza-locker-id').value = letra;
    document.getElementById('pieza-div-id').value = divNum;
    document.getElementById('pieza-index').value = index;
    document.getElementById('titulo-modal-pieza').textContent = `Edit Fixture: ${pieza.nombre}`;
    document.getElementById('input-pieza-nombre').value = pieza.nombre || '';
    document.getElementById('input-pieza-cliente').value = pieza.cliente || '';
    document.getElementById('input-pieza-localidad').value = pieza.localidad || '';

    if (pieza.proyecto && pieza.proyecto.includes('.')) {
        const partes = pieza.proyecto.split('.');
        document.getElementById('proj-part1').value = partes[0] || '';
        document.getElementById('proj-part2').value = partes[1] || '';
    } else {
        document.getElementById('proj-part1').value = '';
        document.getElementById('proj-part2').value = '';
    }

    document.getElementById('input-pieza-desc').value = pieza.desc || '';
    document.getElementById('input-pieza-foto-base64').value = pieza.foto || '';

    if (pieza.foto) {
        document.getElementById('img-pieza-miniatura-prev').src = pieza.foto;
        document.getElementById('preview-foto-miniatura').style.display = 'block';
    } else {
        document.getElementById('preview-foto-miniatura').style.display = 'none';
    }

    const check = document.getElementById('check-agregar-a-lista-global');
    if (check) check.checked = false;

    closeModal('modal-locker-detalle');
    openModal('modal-editar-pieza');
}

function autotab(actual, siguienteId) {
    if (actual.value.length >= actual.maxLength) document.getElementById(siguienteId).focus();
}

function convertImageToBase64(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64String = e.target.result;
            document.getElementById('input-pieza-foto-base64').value = base64String;
            document.getElementById('img-pieza-miniatura-prev').src = base64String;
            document.getElementById('preview-foto-miniatura').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

async function saveLockerPiece(event) {
    event.preventDefault();
    const letra = document.getElementById('pieza-locker-id').value;
    const divNum = document.getElementById('pieza-div-id').value;
    const index = document.getElementById('pieza-index').value;
    const key = `${letra}-${divNum}`;

    const part1 = document.getElementById('proj-part1').value.trim();
    const part2 = document.getElementById('proj-part2').value.trim();
    const proyectoCompleto = `${part1}.${part2}`;

    const piezaData = {
        nombre: document.getElementById('input-pieza-nombre').value.trim(),
        cliente: document.getElementById('input-pieza-cliente').value,
        localidad: document.getElementById('input-pieza-localidad').value.trim(),
        proyecto: proyectoCompleto,
        desc: document.getElementById('input-pieza-desc').value.trim(),
        foto: document.getElementById('input-pieza-foto-base64').value || ''
    };

    if (!inventarioLockers[key]) inventarioLockers[key] = [];
    const piezaAnterior = (index !== "" && inventarioLockers[key][parseInt(index)]) ? inventarioLockers[key][parseInt(index)] : null;

    if (index === "") inventarioLockers[key].push(piezaData);
    else inventarioLockers[key][parseInt(index)] = piezaData;

    await db.collection("lockers").doc(key).set({ items: inventarioLockers[key] });

    await registrarModificacion(
        'LOCKER',
        index === "" ? 'CREAR' : 'EDITAR',
        index === "" 
            ? `Fixture "${piezaData.nombre}" added to Locker ${letra} (Compartment ${divNum})`
            : `Fixture "${piezaData.nombre}" edited in Locker ${letra} (Compartment ${divNum})`,
        piezaAnterior, piezaData, 'lockers', key
    );

    const checkGlobal = document.getElementById('check-agregar-a-lista-global');
    const quiereAgregarGlobal = checkGlobal && checkGlobal.checked;

    closeModal('modal-editar-pieza');
    Toast.fire({ icon: 'success', title: 'Fixture saved successfully' });
    openLockerDetail(letra);

    if (quiereAgregarGlobal) {
        setTimeout(() => {
            openNewGlobalFixtureFromLocker(piezaData, letra, divNum);
        }, 400);
    }
}

async function deleteLockerPiece(letra, divNum, index) {
    const res = await Swal.fire({
        title: 'Delete fixture?', text: "This element will be removed from the locker.",
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, delete', cancelButtonText: 'Cancel'
    });

    if (res.isConfirmed) {
        const key = `${letra}-${divNum}`;
        if (inventarioLockers[key]) {
            const piezaEliminada = inventarioLockers[key][index];
            inventarioLockers[key].splice(index, 1);
            await db.collection("lockers").doc(key).set({ items: inventarioLockers[key] });
            await registrarModificacion('LOCKER', 'ELIMINAR', `Fixture "${piezaEliminada.nombre}" removed from Locker ${letra} (Compartment ${divNum})`, piezaEliminada, null, 'lockers', key);
            Toast.fire({ icon: 'success', title: 'Fixture deleted' });
            openLockerDetail(letra);
        }
    }
}

function enlargePhoto(src) {
    document.getElementById('foto-ampliada-src').src = src;
    openModal('modal-visor-foto');
}

// =============================================================
// 3. MATERIALS & TICKETS
// =============================================================
function renderizarCatalogoNacho() {
    const contenedor = document.getElementById('catalogo-nacho');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    const esAdmin = rolActual === "SUPER_ADMIN" || rolActual === "ADMIN";

    listaNacho.forEach((mat, idx) => {
        const card = document.createElement('div');
        const cantidadNum = parseInt(mat.cant) || 0;
        const sinStock = cantidadNum <= 0;
        card.className = `card-material ${sinStock ? 'card-sin-stock' : ''}`;
        if (sinStock) {
            card.style.backgroundColor = '#fff3cd';
            card.style.borderColor = '#ffeeba';
        }

        let adminAccionesHTML = '';
        if (esAdmin) {
            adminAccionesHTML = `
                <div class="acciones-admin-material">
                    <button class="btn-admin-edit" onclick="openEditQuantityModal(${idx})">✏️ Adjust</button>
                    <button class="btn-admin-delete" onclick="openDeleteMaterialModal(${idx})">🗑️ Delete</button>
                </div>
            `;
        }

        let botonSolicitarHtml = '';
        if (sinStock) botonSolicitarHtml = `<button class="btn-huf" style="width: 100%; margin-top: 10px; background-color: #ffc107; color: #856404; cursor: not-allowed;" disabled>Out of Stock</button>`;
        else botonSolicitarHtml = `<button class="btn-huf" style="width: 100%; margin-top: 10px;" onclick="openTicketModal('${mat.nombre}')">Request</button>`;

        card.innerHTML = `
            <div>
                <h4>${mat.nombre}</h4>
                <p>${mat.desc}</p>
                ${mat.ubicacion ? `<p style="font-size: 12px; color: #1971c2; background: #e7f5ff; padding: 4px 8px; border-radius: 4px; display: inline-block;">📍 ${mat.ubicacion}</p>` : ''}
                <p style="font-weight: bold; color: ${sinStock ? '#856404' : '#212529'}; font-size: 13px; margin-top: 8px;">Stock: ${cantidadNum} pcs ${sinStock ? '(Out of stock)' : ''}</p>
            </div>
            <div>${botonSolicitarHtml}${adminAccionesHTML}</div>
        `;
        contenedor.appendChild(card);
    });
}

function openTicketModal(nombreMaterial) {
    if (!usuarioActual) {
        Swal.fire({ icon: 'warning', title: 'Login required', text: 'You must log in to request materials.', confirmButtonColor: '#e30613' });
        return;
    }
    const materialEncontrado = listaNacho.find(m => m.nombre === nombreMaterial);
    if (!materialEncontrado || (parseInt(materialEncontrado.cant) || 0) <= 0) {
        Swal.fire({ icon: 'error', title: 'No stock available', text: 'This material is out of stock and cannot be requested.', confirmButtonColor: '#e30613' });
        return;
    }
    document.getElementById('ticket-material-nombre').value = nombreMaterial;
    document.getElementById('ticket-material-mostrar').value = `${nombreMaterial} (Available: ${materialEncontrado.cant} pcs)`;
    document.getElementById('ticket-material-ubicacion').value = materialEncontrado.ubicacion || 'Not specified';
    document.getElementById('ticket-solicitante-display').value = usuarioActual;
    document.getElementById('ticket-cantidad').value = 1;
    document.getElementById('ticket-cantidad').max = materialEncontrado.cant;
    document.getElementById('ticket-motivo').value = '';
    openModal('modal-ticket');
}

async function sendInternalTicketRequest(event) {
    event.preventDefault();
    const materialNombre = document.getElementById('ticket-material-nombre').value;
    const solicitante = usuarioActual;
    const cantidadRequerida = parseInt(document.getElementById('ticket-cantidad').value) || 1;
    const motivo = document.getElementById('ticket-motivo').value.trim();

    const matObj = listaNacho.find(m => m.nombre === materialNombre);
    if (!matObj) return Swal.fire({ icon: 'error', title: 'Error', text: 'Material no longer exists in catalog.' });

    const stockActual = parseInt(matObj.cant) || 0;
    if (cantidadRequerida > stockActual) {
        return Swal.fire({ icon: 'error', title: 'Quantity exceeded', text: `Only ${stockActual} pieces available in stock.`, confirmButtonColor: '#e30613' });
    }

    const nuevoTicket = {
        material: materialNombre,
        materialUbicacion: matObj.ubicacion || 'Not specified',
        solicitante: solicitante,
        cantidad: cantidadRequerida,
        motivo: motivo,
        estado: 'Pending',
        firestoreIdMaterial: matObj.firestoreId,
        fechaSort: firebase.firestore.FieldValue.serverTimestamp(),
        fechaInicio: new Date().toISOString()
    };

    const docRef = await db.collection("tickets").add(nuevoTicket);
    await db.collection("historial_tickets_grafica").add({ material: materialNombre, cantidad: cantidadRequerida, fecha: new Date().toISOString() });
    await registrarModificacion('TICKET', 'CREAR', `${cantidadRequerida} pcs of "${materialNombre}" requested for: ${motivo}`, null, nuevoTicket, 'tickets', docRef.id);
    closeModal('modal-ticket');
    Toast.fire({ icon: 'success', title: 'Ticket sent to Tooling' });
}

function renderizarTicketsNacho() {
    const contenedor = document.getElementById('lista-tickets-contenedor');
    const badge = document.getElementById('num-tickets-pendientes');
    if (!contenedor || !badge) return;
    contenedor.innerHTML = '';
    badge.textContent = `${listaTickets.length} Pending`;

    if (listaTickets.length === 0) {
        contenedor.innerHTML = '<p style="color: #6c757d; font-size: 14px;">No pending tickets at the moment.</p>';
        return;
    }

    const esAdmin = rolActual === "SUPER_ADMIN" || rolActual === "ADMIN";
    listaTickets.forEach((t) => {
        const card = document.createElement('div');
        card.className = 'card-ticket-item';
        const btnCerrar = esAdmin ? `<button class="btn-huf" style="padding: 6px 12px; font-size: 12px; margin-top: 10px; width: 100%;" onclick="closeTicket('${t.firestoreId}', '${t.material}', ${t.cantidad}, '${t.firestoreIdMaterial || ''}')">Close / Deliver Ticket</button>` : '';
        card.innerHTML = `
            <div>
                <h5>${t.material} (Qty: ${t.cantidad})</h5>
                ${t.materialUbicacion ? `<p style="font-size: 11px; color: #1971c2; background: #e7f5ff; padding: 3px 6px; border-radius: 4px; display: inline-block; margin-bottom: 5px;">📍 ${t.materialUbicacion}</p>` : ''}
                <p><strong>Requested by:</strong> ${t.solicitante}</p>
                <p><strong>Reason/Area:</strong> ${t.motivo}</p>
            </div>
            ${btnCerrar}
        `;
        contenedor.appendChild(card);
    });
}

async function closeTicket(firestoreId, nombreMaterial, cantidadSolicitada, matFirestoreId) {
    const res = await Swal.fire({
        title: 'Close ticket and deduct material?',
        text: `The ticket will be delivered and ${cantidadSolicitada} piece(s) will be deducted from "${nombreMaterial}" stock.`,
        icon: 'question', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, close and deduct', cancelButtonText: 'Cancel'
    });

    if (res.isConfirmed) {
        try {
            let materialRef = null;
            let materialEncontrado = null;
            if (matFirestoreId) {
                const docSnap = await db.collection("catalogo_nacho").doc(matFirestoreId).get();
                if (docSnap.exists) {
                    materialRef = db.collection("catalogo_nacho").doc(matFirestoreId);
                    materialEncontrado = docSnap.data();
                }
            }
            if (!materialEncontrado) {
                const snapshot = await db.collection("catalogo_nacho").where("nombre", "==", nombreMaterial).get();
                if (!snapshot.empty) {
                    materialRef = snapshot.docs[0].ref;
                    materialEncontrado = snapshot.docs[0].data();
                }
            }
            if (materialEncontrado && materialRef) {
                const stockActual = parseInt(materialEncontrado.cant) || 0;
                const nuevoStock = Math.max(0, stockActual - cantidadSolicitada);
                await materialRef.update({ cant: nuevoStock });
            }
            await db.collection("tickets").doc(firestoreId).delete();
            await registrarModificacion('TICKET', 'ELIMINAR', `Ticket for "${nombreMaterial}" closed (${cantidadSolicitada} pcs)`, { material: nombreMaterial, cantidad: cantidadSolicitada }, null, 'tickets', firestoreId);
            Toast.fire({ icon: 'success', title: 'Ticket closed and stock updated' });
        } catch (error) {
            console.error(error);
            Swal.fire({ icon: 'error', title: 'Error', text: 'Could not update material stock.' });
        }
    }
}

async function saveMaterial(event) {
    event.preventDefault();
    const nombre = document.getElementById('nacho-mat-nombre').value.trim();
    const desc = document.getElementById('nacho-mat-desc').value.trim();
    const ubicacion = document.getElementById('nacho-mat-ubicacion').value.trim();
    const cant = parseInt(document.getElementById('nacho-mat-cant').value) || 0;
    
    const docRef = await db.collection("catalogo_nacho").add({ 
        nombre, desc, ubicacion, cant 
    });
    
    await registrarModificacion(
        'MATERIAL', 
        'CREAR', 
        `Material "${nombre}" added to Tooling catalog (Location: ${ubicacion})`, 
        null, 
        { nombre, desc, ubicacion, cant }, 
        'catalogo_nacho', 
        docRef.id
    );
    
    closeModal('modal-nuevo-material-nacho');
    document.getElementById('nacho-mat-nombre').value = '';
    document.getElementById('nacho-mat-desc').value = '';
    document.getElementById('nacho-mat-ubicacion').value = '';
    document.getElementById('nacho-mat-cant').value = '';
    Toast.fire({ icon: 'success', title: 'Material added to catalog' });
}

function openEditQuantityModal(index) {
    indiceEdicionMaterial = index;
    const mat = listaNacho[index];
    document.getElementById('edit-cant-material-nombre').textContent = mat.nombre;
    document.getElementById('edit-cant-material-ubicacion').textContent = mat.ubicacion || 'Not specified';
    document.getElementById('edit-cant-material-input').value = mat.cant;
    document.getElementById('edit-cant-material-ubicacion-input').value = mat.ubicacion || '';
    openModal('modal-editar-cantidad-nacho');
}

async function saveQuantityModal(event) {
    event.preventDefault();
    if (indiceEdicionMaterial === null) return;
    const nuevaCant = parseInt(document.getElementById('edit-cant-material-input').value) || 0;
    const nuevaUbicacion = document.getElementById('edit-cant-material-ubicacion-input').value.trim();
    const mat = listaNacho[indiceEdicionMaterial];
    const cantAnterior = mat.cant;
    const ubicacionAnterior = mat.ubicacion || '';
    
    await db.collection("catalogo_nacho").doc(mat.firestoreId).update({ 
        cant: nuevaCant, 
        ubicacion: nuevaUbicacion 
    });
    
    await registrarModificacion(
        'MATERIAL', 
        'EDITAR', 
        `Stock of "${mat.nombre}" adjusted: ${cantAnterior} → ${nuevaCant} pcs${nuevaUbicacion !== ubicacionAnterior ? ` | Location: ${ubicacionAnterior || 'N/A'} → ${nuevaUbicacion || 'N/A'}` : ''}`, 
        { cant: cantAnterior, ubicacion: ubicacionAnterior }, 
        { cant: nuevaCant, ubicacion: nuevaUbicacion }, 
        'catalogo_nacho', 
        mat.firestoreId
    );
    
    closeModal('modal-editar-cantidad-nacho');
    Toast.fire({ icon: 'success', title: 'Material updated' });
}

function openDeleteMaterialModal(index) {
    indiceEliminarMaterial = index;
    const mat = listaNacho[index];
    document.getElementById('nombre-eliminar-material').textContent = mat.nombre;
    openModal('modal-confirmar-eliminar-nacho');
}

async function confirmMaterialDeletion() {
    if (indiceEliminarMaterial === null) return;
    const mat = listaNacho[indiceEliminarMaterial];
    await db.collection("catalogo_nacho").doc(mat.firestoreId).delete();
    await registrarModificacion('MATERIAL', 'ELIMINAR', `Material "${mat.nombre}" removed from catalog`, { nombre: mat.nombre, desc: mat.desc, ubicacion: mat.ubicacion, cant: mat.cant }, null, 'catalogo_nacho', mat.firestoreId);
    closeModal('modal-confirmar-eliminar-nacho');
    Toast.fire({ icon: 'success', title: 'Material removed from catalog' });
}

// =============================================================
// 4. CHARTS
// =============================================================
function actualizarGraficas() {
    const ctxGab = document.getElementById('chartBusquedasGabinetes');
    if (ctxGab) {
        const labelsGab = Object.keys(historialBusquedasGabinetes);
        const dataGab = Object.values(historialBusquedasGabinetes);
        if (chartBusquedasInstance) chartBusquedasInstance.destroy();
        chartBusquedasInstance = new Chart(ctxGab, {
            type: 'bar',
            data: {
                labels: labelsGab.length > 0 ? labelsGab : ['No searches'],
                datasets: [{ label: 'Times searched', data: dataGab.length > 0 ? dataGab : [0], backgroundColor: '#e30613', borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
        });
    }

    const ctxMat = document.getElementById('chartMaterialesSolicitados');
    if (ctxMat) {
        let conteoMateriales = {};
        historialTicketsGrafica.forEach(t => {
            const mat = t.material || 'Unknown';
            const cant = parseInt(t.cantidad) || 1;
            conteoMateriales[mat] = (conteoMateriales[mat] || 0) + cant;
        });
        const labelsMat = Object.keys(conteoMateriales);
        const dataMat = Object.values(conteoMateriales);
        if (chartMaterialesInstance) chartMaterialesInstance.destroy();
        chartMaterialesInstance = new Chart(ctxMat, {
            type: 'doughnut',
            data: {
                labels: labelsMat.length > 0 ? labelsMat : ['No requests'],
                datasets: [{ data: dataMat.length > 0 ? dataMat : [1], backgroundColor: ['#e30613', '#1a1d20', '#495057', '#adb5bd', '#ffc9c9', '#003366'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }
}

async function clearChartData(type) {
    if (rolActual !== "SUPER_ADMIN") {
        Swal.fire({ icon: 'error', title: 'Access denied', text: 'Only the Master role can clear charts.' });
        return;
    }
    const res = await Swal.fire({
        title: `Clear ${type} data?`,
        text: "The current record will be saved in chart history and the counter will be reset.",
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, clear', cancelButtonText: 'Cancel'
    });

    if (res.isConfirmed) {
        const fechaActualStr = new Date().toLocaleString();
        if (type === 'cabinets') {
            await db.collection("historial_graficas").add({ tipo: 'Cabinets', fechaVaciado: fechaActualStr, datos: JSON.stringify(historialBusquedasGabinetes), iso: new Date().toISOString() });
            historialBusquedasGabinetes = {};
        } else if (type === 'materials') {
            let conteoMateriales = {};
            historialTicketsGrafica.forEach(t => {
                const mat = t.material || 'Unknown';
                const cant = parseInt(t.cantidad) || 1;
                conteoMateriales[mat] = (conteoMateriales[mat] || 0) + cant;
            });
            await db.collection("historial_graficas").add({ tipo: 'Tooling Materials', fechaVaciado: fechaActualStr, datos: JSON.stringify(conteoMateriales), iso: new Date().toISOString() });
            const snapshot = await db.collection("historial_tickets_grafica").get();
            const batch = db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
        actualizarGraficas();
        Toast.fire({ icon: 'success', title: 'Chart reset and saved to history' });
    }
}

function renderizarHistorialGraficas() {
    const contenedor = document.getElementById('lista-historial-graficas');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    if (!historialGraficasGuardado || historialGraficasGuardado.length === 0) {
        contenedor.innerHTML = '<p style="font-size: 13px; color: #6c757d;">No history records yet.</p>';
        return;
    }
    const esAdmin = (rolActual === "SUPER_ADMIN" || rolActual === "ADMIN");
    historialGraficasGuardado.forEach((h, index) => {
        const item = document.createElement('div');
        item.style.cssText = "background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;";
        const btnEliminar = esAdmin ? `<button class="btn-eliminar-cliente" style="background:#fff3cd; color:#e30613; border:1px solid #ffeeba; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;" onclick="deleteChartHistoryRecord('${h.id}')" title="Remove from history">&times; Delete</button>` : '';
        item.innerHTML = `
            <div><strong>${h.tipo}</strong> - <span style="font-size: 12px; color: #6c757d;">Reset on: ${h.fechaVaciado}</span></div>
            <div style="display:flex; gap:8px; align-items:center;">
                <button class="btn-huf-secundario" style="font-size: 11px; padding: 4px 8px;" onclick="viewChartHistoryDetail(${index})">View Data</button>
                ${btnEliminar}
            </div>
        `;
        contenedor.appendChild(item);
    });
}

function viewChartHistoryDetail(index) {
    const registro = historialGraficasGuardado[index];
    if (!registro) return;
    let datosObj = {};
    try { datosObj = typeof registro.datos === 'string' ? JSON.parse(registro.datos) : registro.datos; } catch(e) { datosObj = {}; }
    let htmlLista = '<ul style="text-align: left; max-height: 250px; overflow-y: auto; padding-left: 20px; font-size: 13px;">';
    let contador = 0;
    for (const key in datosObj) {
        contador++;
        htmlLista += `<li style="margin-bottom: 5px;"><strong>${key}:</strong> ${datosObj[key]} units/searches</li>`;
    }
    if (contador === 0) htmlLista += '<li style="color:#6c757d;">No items saved for this period.</li>';
    htmlLista += '</ul>';
    Swal.fire({ title: `Detail (${registro.tipo})`, html: `<p style="font-size: 12px; color: #6c757d; margin-bottom: 10px;">Date: ${registro.fechaVaciado}</p>${htmlLista}`, confirmButtonText: 'Accept', confirmButtonColor: '#e30613' });
}

async function deleteChartHistoryRecord(docId) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Access denied', text: 'Only administrators can delete records.' });
        return;
    }
    const res = await Swal.fire({
        title: 'Delete this record?', text: 'It will be permanently removed from the chart history.',
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, delete', cancelButtonText: 'Cancel'
    });
    if (res.isConfirmed) {
        try {
            await db.collection("historial_graficas").doc(docId).delete();
            Toast.fire({ icon: 'success', title: 'History record deleted' });
        } catch (error) { Swal.fire({ icon: 'error', title: 'Error', text: 'Could not delete the record.' }); }
    }
}

function selectCabinetMode(tipo) {
    document.getElementById('gabinete-tipo-select').value = tipo;
    ['CANTIDAD', 'GRID', 'CUSTOM'].forEach(m => {
        const card = document.getElementById(`card-mod-${m}`);
        if (card) {
            if (m === tipo) { card.style.border = '2px solid #e30613'; card.style.background = '#fff5f5'; }
            else { card.style.border = '1px solid #dee2e6'; card.style.background = '#ffffff'; }
        }
    });
    document.getElementById('grupo-cant-cajones').style.display = (tipo === 'CANTIDAD') ? 'block' : 'none';
    document.getElementById('grupo-grid-cajones').style.display = (tipo === 'GRID') ? 'block' : 'none';
    document.getElementById('grupo-custom-cajones').style.display = (tipo === 'CUSTOM') ? 'block' : 'none';
}

// =============================================================
// 5. MAIN NAVIGATION
// =============================================================
function showSection(section) {
    if (section === 'inventory' && rolActual === 'EXTERNAL') {
        Swal.fire({
            icon: 'error',
            title: 'Access restricted',
            text: 'External users can only access the Fixtures List.',
            confirmButtonColor: '#e30613'
        });
        return;
    }

    document.getElementById('tab-seleccion-inicial').style.display = 'none';

    if (section === 'inventory') {
        document.getElementById('seccion-inventario-completa').style.display = 'block';
        document.getElementById('nav-tabs-container').style.display = 'flex';
        document.querySelectorAll('#seccion-inventario-completa .tab-content').forEach(tab => tab.classList.remove('activo'));
        document.querySelectorAll('.btn-tab').forEach(btn => btn.classList.remove('activo'));
        document.getElementById('tab-cabinets').classList.add('activo');
        const btnCabinets = document.querySelector('.btn-tab[onclick*="tab-cabinets"]');
        if (btnCabinets) btnCabinets.classList.add('activo');
    } else if (section === 'fixtures') {
        document.getElementById('seccion-lista-fixtures').style.display = 'block';
        document.getElementById('nav-tabs-container').style.display = 'none';
        renderizarListaFixturesGlobal();
    }
}

function backToMainMenu() {
    document.getElementById('seccion-inventario-completa').style.display = 'none';
    document.getElementById('seccion-lista-fixtures').style.display = 'none';
    document.getElementById('tab-seleccion-inicial').style.display = 'block';
    document.getElementById('nav-tabs-container').style.display = 'none';
}

// =============================================================
// 6. MODIFICATION HISTORY
// =============================================================
function renderizarHistorialModificaciones() {
    const contenedor = document.getElementById('lista-historial-modificaciones');
    if (!contenedor) return;
    const filtroTipo = document.getElementById('filtro-historial-tipo')?.value || '';
    let listaFiltrada = historialModificaciones;
    if (filtroTipo) listaFiltrada = historialModificaciones.filter(h => h.tipo === filtroTipo);
    contenedor.innerHTML = '';

    if (listaFiltrada.length === 0) {
        contenedor.innerHTML = '<p style="font-size: 13px; color: #6c757d; text-align: center; padding: 20px;">No modifications registered' + (filtroTipo ? ' for this filter.' : ' yet.') + '</p>';
        return;
    }

    const esAdmin = (rolActual === "SUPER_ADMIN" || rolActual === "ADMIN");
    const coloresTipo = { 'GABINETE': '#003366', 'LOCKER': '#e30613', 'CLIENTE': '#2b8a3e', 'MATERIAL': '#856404', 'TICKET': '#6c757d', 'USUARIO': '#862e9c', 'FIXTURE_GLOBAL': '#0c8599' };
    const iconosAccion = { 'CREAR': '➕', 'EDITAR': '✏️', 'ELIMINAR': '🗑️', 'REVERTIR': '↩️' };

    listaFiltrada.forEach((h) => {
        const item = document.createElement('div');
        const colorTipo = coloresTipo[h.tipo] || '#495057';
        const icono = iconosAccion[h.accion] || '📝';
        item.style.cssText = `background: #ffffff; border: 1px solid #e9ecef; border-left: 5px solid ${colorTipo}; border-radius: 8px; padding: 12px 15px; display: flex; flex-direction: column; gap: 6px;`;

        const puedeRevertir = esAdmin && !h.revertido && h.datosAntes && h.refColeccion && h.refDocId && h.accion !== 'REVERTIR';
        const btnRevertir = puedeRevertir ? `<button class="btn-huf-secundario" style="font-size: 11px; padding: 4px 10px; background-color: #856404;" onclick="revertModification('${h.id}')" title="Revert this action">↩️ Revert</button>` : (h.revertido ? `<span style="font-size: 11px; color: #2b8a3e; font-weight: bold;">✔ Already reverted</span>` : '');

        const badgeAccion = `<span style="background: ${colorTipo}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold;">${icono} ${h.accion}</span>`;
        const badgeTipo = `<span style="background: #e9ecef; color: #495057; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold;">${h.tipo}</span>`;

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap;">
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    ${badgeTipo}${badgeAccion}
                    <span style="font-size: 11px; color: #6c757d;">${h.fechaLegible || h.fecha}</span>
                </div>
                <div style="display: flex; gap: 6px; align-items: center;">
                    <span style="font-size: 12px; color: #495057; font-weight: 600;">👤 ${h.usuario} <span style="color: #adb5bd; font-weight: normal;">(${h.rol})</span></span>
                    ${btnRevertir}
                </div>
            </div>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #212529;">${h.descripcion}</p>
        `;
        contenedor.appendChild(item);
    });
}

async function revertModification(historyId) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Access denied', text: 'Only administrators can revert changes.' });
        return;
    }
    const registro = historialModificaciones.find(h => h.id === historyId);
    if (!registro) return Swal.fire({ icon: 'error', title: 'Error', text: 'Record not found.' });
    if (registro.revertido) return Swal.fire({ icon: 'info', title: 'Already reverted', text: 'This modification was already reverted.' });

    const res = await Swal.fire({
        title: 'Revert this modification?',
        html: `<p style="font-size: 13px; text-align: left; margin-bottom: 10px;"><strong>Original action:</strong> ${registro.descripcion}</p><p style="font-size: 12px; color: #856404; text-align: left;">It will attempt to restore previous data.</p>`,
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#856404', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, revert', cancelButtonText: 'Cancel'
    });

    if (!res.isConfirmed) return;

    try {
        const col = registro.refColeccion;
        const docId = registro.refDocId;
        const datosAntes = registro.datosAntes ? JSON.parse(registro.datosAntes) : null;
        const datosDespues = registro.datosDespues ? JSON.parse(registro.datosDespues) : null;
        const accion = registro.accion;

        if (!col || !docId) throw new Error('No reference to revert.');

        let reversiónExitosa = false;

        if (accion === 'CREAR') {
            try {
                await db.collection(col).doc(docId).delete();
                reversiónExitosa = true;
            } catch (e) {
                console.warn("Delete failed:", e);
            }
        } else if (accion === 'ELIMINAR') {
            if (datosAntes) {
                await db.collection(col).doc(docId).set(datosAntes, { merge: false });
                reversiónExitosa = true;
            } else {
                throw new Error('No data to restore.');
            }
        } else if (accion === 'EDITAR') {
            if (datosAntes) {
                if (col === 'lockers' && Array.isArray(datosAntes)) {
                    await db.collection(col).doc(docId).set({ items: datosAntes });
                } else if (col === 'gabinetes' && datosAntes.nombre !== undefined) {
                    await db.collection(col).doc(docId).set(datosAntes, { merge: false });
                } else {
                    await db.collection(col).doc(docId).set(datosAntes, { merge: true });
                }
                reversiónExitosa = true;
            } else {
                throw new Error('No previous data to restore.');
            }
        }

        if (!reversiónExitosa) throw new Error('Could not apply the revert.');

        await db.collection("historial_modificaciones").doc(historyId).update({ revertido: true });

        await registrarModificacion(
            registro.tipo,
            'REVERTIR',
            `Action reverted: ${registro.descripcion}`,
            datosDespues,
            datosAntes,
            registro.refColeccion,
            registro.refDocId
        );

        Swal.fire({ 
            icon: 'success', 
            title: 'Modification Reverted', 
            text: 'Data has been restored successfully.', 
            confirmButtonColor: '#e30613' 
        });
    } catch (error) {
        console.error("Revert error:", error);
        Swal.fire({ 
            icon: 'error', 
            title: 'Could not revert', 
            text: error.message || 'An error occurred while trying to revert.', 
            confirmButtonColor: '#e30613' 
        });
    }
}

async function clearModificationHistory() {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Access denied', text: 'Only administrators can clear the history.' });
        return;
    }
    const res = await Swal.fire({
        title: 'Clear the entire history?', text: 'All modification records will be permanently removed.',
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, clear all', cancelButtonText: 'Cancel'
    });
    if (res.isConfirmed) {
        try {
            const snapshot = await db.collection("historial_modificaciones").get();
            const batch = db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            Toast.fire({ icon: 'success', title: 'History cleared' });
        } catch (error) { Swal.fire({ icon: 'error', title: 'Error', text: 'Could not clear the history.' }); }
    }
}

// =============================================================
// 7. GLOBAL FIXTURES LIST
// =============================================================
function openNewGlobalFixtureModal() {
    document.getElementById('fixture-global-id-editar').value = '';
    document.getElementById('titulo-modal-fixture-global').textContent = 'Add Fixture to Global List';
    document.getElementById('fg-nombre').value = '';
    document.getElementById('fg-cliente').value = '';
    document.getElementById('fg-pais').value = '';
    document.getElementById('fg-planta').value = '';
    document.getElementById('fg-ubicacion').value = '';
    document.getElementById('fg-proyecto').value = '';
    document.getElementById('fg-estado').value = 'Available';
    document.getElementById('fg-desc').value = '';
    document.getElementById('fg-contacto-nombre').value = '';
    document.getElementById('fg-contacto-info').value = '';
    document.getElementById('fg-foto-file').value = '';
    document.getElementById('fg-foto-base64').value = '';
    document.getElementById('fg-preview-foto').style.display = 'none';
    contextoFixtureGlobalDesdeLocker = null;
    openModal('modal-fixture-global');
}

function openNewGlobalFixtureFromLocker(piezaData, letra, divNum) {
    openNewGlobalFixtureModal();
    contextoFixtureGlobalDesdeLocker = { letra, divNum };
    
    document.getElementById('titulo-modal-fixture-global').textContent = `Add to Global List (from Locker ${letra})`;
    document.getElementById('fg-nombre').value = piezaData.nombre || '';
    document.getElementById('fg-cliente').value = piezaData.cliente || '';
    document.getElementById('fg-ubicacion').value = piezaData.localidad || '';
    document.getElementById('fg-proyecto').value = piezaData.proyecto || '';
    document.getElementById('fg-desc').value = piezaData.desc || '';
    document.getElementById('fg-foto-base64').value = piezaData.foto || '';
    
    if (piezaData.foto) {
        document.getElementById('fg-img-preview').src = piezaData.foto;
        document.getElementById('fg-preview-foto').style.display = 'block';
    }
}

function openEditGlobalFixtureModal(firestoreId) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Insufficient permissions', text: 'Only administrators can edit global fixtures.', confirmButtonColor: '#e30613' });
        return;
    }
    const fx = listaFixturesGlobales.find(f => f.firestoreId === firestoreId);
    if (!fx) return;

    document.getElementById('fixture-global-id-editar').value = fx.firestoreId;
    document.getElementById('titulo-modal-fixture-global').textContent = `Edit Global Fixture: ${fx.nombre}`;
    document.getElementById('fg-nombre').value = fx.nombre || '';
    document.getElementById('fg-cliente').value = fx.cliente || '';
    document.getElementById('fg-pais').value = fx.pais || '';
    document.getElementById('fg-planta').value = fx.planta || '';
    document.getElementById('fg-ubicacion').value = fx.ubicacion || '';
    document.getElementById('fg-proyecto').value = fx.proyecto || '';
    document.getElementById('fg-estado').value = fx.estado || 'Available';
    document.getElementById('fg-desc').value = fx.desc || '';
    document.getElementById('fg-contacto-nombre').value = fx.contactoNombre || '';
    document.getElementById('fg-contacto-info').value = fx.contactoInfo || '';
    document.getElementById('fg-foto-base64').value = fx.foto || '';
    
    if (fx.foto) {
        document.getElementById('fg-img-preview').src = fx.foto;
        document.getElementById('fg-preview-foto').style.display = 'block';
    } else {
        document.getElementById('fg-preview-foto').style.display = 'none';
    }
    
    contextoFixtureGlobalDesdeLocker = null;
    openModal('modal-fixture-global');
}

function convertGlobalFixtureImage(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64String = e.target.result;
            document.getElementById('fg-foto-base64').value = base64String;
            document.getElementById('fg-img-preview').src = base64String;
            document.getElementById('fg-preview-foto').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

async function saveGlobalFixture(event) {
    event.preventDefault();
    const idExistente = document.getElementById('fixture-global-id-editar').value;
    const docId = idExistente ? idExistente : `FG_${Date.now()}`;

    const datosFixture = {
        nombre: document.getElementById('fg-nombre').value.trim(),
        cliente: document.getElementById('fg-cliente').value.trim(),
        pais: document.getElementById('fg-pais').value.trim(),
        planta: document.getElementById('fg-planta').value.trim(),
        ubicacion: document.getElementById('fg-ubicacion').value.trim(),
        proyecto: document.getElementById('fg-proyecto').value.trim(),
        estado: document.getElementById('fg-estado').value,
        desc: document.getElementById('fg-desc').value.trim(),
        contactoNombre: document.getElementById('fg-contacto-nombre').value.trim(),
        contactoInfo: document.getElementById('fg-contacto-info').value.trim(),
        foto: document.getElementById('fg-foto-base64').value || '',
        ultimaActualizacion: new Date().toISOString(),
        actualizadoPor: usuarioActual || 'Anonymous'
    };

    if (contextoFixtureGlobalDesdeLocker) {
        datosFixture.origen = `Locker ${contextoFixtureGlobalDesdeLocker.letra} - Div ${contextoFixtureGlobalDesdeLocker.divNum}`;
    }

    const fxAnterior = idExistente ? listaFixturesGlobales.find(f => f.firestoreId === idExistente) : null;

    await db.collection("lista_fixtures_global").doc(docId).set(datosFixture, { merge: true });

    await registrarModificacion(
        'FIXTURE_GLOBAL',
        idExistente ? 'EDITAR' : 'CREAR',
        idExistente 
            ? `Global fixture "${datosFixture.nombre}" edited (${datosFixture.cliente})`
            : `Fixture "${datosFixture.nombre}" added to Global List (${datosFixture.cliente} - ${datosFixture.pais})`,
        fxAnterior, datosFixture, 'lista_fixtures_global', docId
    );

    closeModal('modal-fixture-global');
    contextoFixtureGlobalDesdeLocker = null;
    Toast.fire({ icon: 'success', title: idExistente ? 'Global fixture updated' : 'Fixture added to global list' });
}

async function deleteGlobalFixture(firestoreId) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Insufficient permissions', text: 'Only administrators can delete global fixtures.', confirmButtonColor: '#e30613' });
        return;
    }
    const fx = listaFixturesGlobales.find(f => f.firestoreId === firestoreId);
    if (!fx) return;

    const res = await Swal.fire({
        title: `Delete "${fx.nombre}" from global list?`,
        text: 'It will be removed from the global catalog. The fixture will remain in its locker if applicable.',
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, delete', cancelButtonText: 'Cancel'
    });

    if (res.isConfirmed) {
        await db.collection("lista_fixtures_global").doc(firestoreId).delete();
        await registrarModificacion('FIXTURE_GLOBAL', 'ELIMINAR', `Global fixture "${fx.nombre}" deleted`, fx, null, 'lista_fixtures_global', firestoreId);
        Toast.fire({ icon: 'success', title: 'Fixture removed from global list' });
    }
}

function searchGlobalFixture(event) {
    if (event) event.preventDefault();
    terminoBusquedaFixtureGlobal = document.getElementById('buscar-fixture-global').value.toLowerCase().trim();
    renderizarListaFixturesGlobal();
}

function clearGlobalFixtureSearch() {
    document.getElementById('buscar-fixture-global').value = '';
    terminoBusquedaFixtureGlobal = '';
    renderizarListaFixturesGlobal();
}

function renderizarListaFixturesGlobal() {
    const contenedor = document.getElementById('contenedor-fixtures-globales');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    let listaFiltrada = listaFixturesGlobales;
    if (terminoBusquedaFixtureGlobal) {
        const t = terminoBusquedaFixtureGlobal;
        listaFiltrada = listaFixturesGlobales.filter(f => {
            const textoCompleto = `${f.nombre} ${f.cliente} ${f.pais} ${f.planta} ${f.ubicacion} ${f.proyecto} ${f.desc} ${f.contactoNombre} ${f.contactoInfo}`.toLowerCase();
            return textoCompleto.includes(t);
        });
    }

    if (listaFiltrada.length === 0) {
        contenedor.innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
                <div style="font-size: 60px; margin-bottom: 15px;">📭</div>
                <p style="color: #6c757d; font-size: 16px;">${terminoBusquedaFixtureGlobal ? `No fixtures found for "${terminoBusquedaFixtureGlobal}".` : 'No fixtures registered in the global list yet.'}</p>
                ${!terminoBusquedaFixtureGlobal ? '<p style="color: #adb5bd; font-size: 13px; margin-top: 8px;">Use the "+ Add Fixture to List" button or check the box when saving a fixture in a locker.</p>' : ''}
            </div>
        `;
        return;
    }

    const esAdmin = (rolActual === "SUPER_ADMIN" || rolActual === "ADMIN");

    const grupos = {};
    listaFiltrada.forEach(f => {
        const cli = f.cliente || 'No Client';
        if (!grupos[cli]) grupos[cli] = [];
        grupos[cli].push(f);
    });

    const clientesOrdenados = Object.keys(grupos).sort();

    clientesOrdenados.forEach(cliente => {
        const bloqueCliente = document.createElement('div');
        bloqueCliente.style.cssText = "margin-bottom: 30px;";

        const headerCliente = document.createElement('div');
        headerCliente.style.cssText = "display: flex; align-items: center; gap: 10px; padding: 12px 18px; background: linear-gradient(90deg, #e30613 0%, #b8030e 100%); color: white; border-radius: 10px 10px 0 0; box-shadow: 0 2px 8px rgba(227,6,19,0.2);";
        headerCliente.innerHTML = `
            <span style="font-size: 20px;">🏢</span>
            <h3 style="margin: 0; font-size: 17px; font-weight: 700;">${cliente}</h3>
            <span style="background: rgba(255,255,255,0.25); padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;">${grupos[cliente].length} fixture(s)</span>
        `;
        bloqueCliente.appendChild(headerCliente);

        const gridFixtures = document.createElement('div');
        gridFixtures.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 15px; padding: 18px; background: #f8f9fa; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef; border-top: none;";

        const coloresEstado = {
            'Available': '#2b8a3e',
            'In use': '#1971c2',
            'Under repair': '#856404',
            'In transit': '#862e9c',
            'Out of service': '#6c757d'
        };

        grupos[cliente].forEach(fx => {
            const card = document.createElement('div');
            const colorEstado = coloresEstado[fx.estado] || '#6c757d';
            
            card.style.cssText = "background: #ffffff; border: 1px solid #e9ecef; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.04); transition: all 0.2s;";

            const imgHTML = fx.foto 
                ? `<img src="${fx.foto}" style="width: 100%; height: 140px; object-fit: cover; border-radius: 8px; cursor: pointer; margin-bottom: 8px;" onclick="enlargePhoto('${fx.foto}')" title="Click to enlarge">` 
                : `<div style="width: 100%; height: 100px; background: #f1f3f5; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #adb5bd; font-size: 32px; margin-bottom: 8px;">📷</div>`;

            const adminBotones = esAdmin ? `
                <div style="display: flex; gap: 6px; margin-top: auto; padding-top: 10px; border-top: 1px dashed #e9ecef;">
                    <button class="btn-admin-edit" style="flex: 1;" onclick="openEditGlobalFixtureModal('${fx.firestoreId}')">✏️ Edit</button>
                    <button class="btn-admin-delete" onclick="deleteGlobalFixture('${fx.firestoreId}')">🗑️</button>
                </div>
            ` : '';

            const origenHTML = fx.origen ? `<p style="margin: 0; font-size: 11px; color: #adb5bd;"><strong>Huf Origin:</strong> ${fx.origen}</p>` : '';
            const contactoHTML = fx.contactoNombre || fx.contactoInfo 
                ? `<div style="background: #e7f5ff; border-left: 3px solid #1971c2; padding: 8px 10px; border-radius: 6px; margin-top: 4px;">
                    <p style="margin: 0; font-size: 11px; color: #1971c2; font-weight: bold;">📞 Plant contact</p>
                    ${fx.contactoNombre ? `<p style="margin: 2px 0 0 0; font-size: 12px; color: #212529;">${fx.contactoNombre}</p>` : ''}
                    ${fx.contactoInfo ? `<p style="margin: 0; font-size: 11px; color: #495057;">${fx.contactoInfo}</p>` : ''}
                   </div>` 
                : '';

            const descHTML = fx.desc ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #495057; line-height: 1.4;">${fx.desc}</p>` : '';

            card.innerHTML = `
                ${imgHTML}
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
                        <h4 style="margin: 0; font-size: 15px; color: #1a1d20; font-weight: 700;">${fx.nombre}</h4>
                        <span style="background: ${colorEstado}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold; white-space: nowrap;">${fx.estado || 'Available'}</span>
                    </div>
                    <p style="margin: 0; font-size: 12px; color: #495057;"><strong>🌍 Country:</strong> ${fx.pais || 'N/A'}</p>
                    <p style="margin: 2px 0 0 0; font-size: 12px; color: #495057;"><strong>🏭 Plant:</strong> ${fx.planta || 'N/A'}</p>
                    ${fx.ubicacion ? `<p style="margin: 2px 0 0 0; font-size: 12px; color: #495057;"><strong>📍 Location:</strong> ${fx.ubicacion}</p>` : ''}
                    ${fx.proyecto ? `<p style="margin: 2px 0 0 0; font-size: 12px; color: #495057;"><strong>🔢 Project:</strong> ${fx.proyecto}</p>` : ''}
                    ${origenHTML}
                    ${descHTML}
                </div>
                ${contactoHTML}
                ${adminBotones}
            `;
            gridFixtures.appendChild(card);
        });

        bloqueCliente.appendChild(gridFixtures);
        contenedor.appendChild(bloqueCliente);
    });
}