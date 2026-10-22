console.log("Huf Mexico Lab System Initialized with Firebase Auth, Firestore, SweetAlert2 and EmailJS");

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
const auth = firebase.auth();

// =============================================================
// EMAILJS CONFIGURATION
// =============================================================
const EMAILJS_PUBLIC_KEY = "Yv_g3vbmg4Fal-ifm";
const EMAILJS_SERVICE_ID = "service_8kmroui";
const EMAILJS_TEMPLATE_MASTER = "template_2jadani";
const EMAILJS_TEMPLATE_APPROVED = "template_2es794q";
const MASTER_EMAIL = "oswaldojandry03@gmail.com";

let emailjsEnabled = false;

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
            payload = {
                to_email: MASTER_EMAIL,
                username: params.username,
                user_email: params.user_email,
                location: params.location,
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
// ESTADOS DISPONIBLES
// =============================================================
const ESTADOS_DISPONIBLES = {
    'Available': { color: '#2b8a3e', emoji: '🟢', label: 'Available' },
    'In use': { color: '#f59f00', emoji: '🟠', label: 'In use' },
    'Under repair': { color: '#856404', emoji: '🟡', label: 'Under repair' },
    'In transit': { color: '#862e9c', emoji: '🟣', label: 'In transit' },
    'Out of service': { color: '#6c757d', emoji: '⚫', label: 'Out of service' }
};

// =============================================================
// LOCAL DATA STRUCTURES
// =============================================================
let inventarioGabinetes = {};
let listaEstructuraGabinetes = [];
let inventarioLockers = {};
let listaEstructuraLockers = [];
let listaEstructuraRacks = [];
let inventarioRacks = {};
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
let chartCabinetsTopInstance = null;
let chartsSubtabActual = 'overview';

let usuarioActual = null;
let usuarioUID = null;
let rolActual = null;

let indiceEdicionMaterial = null;
let indiceEliminarMaterial = null;

let temporizadorLimpiezaBusqueda = null;
let terminoBusquedaFixtureGlobal = '';
let contextoFixtureGlobalDesdeLocker = null;
let contextoFixtureGlobalDesdeCoupon = null;

let registrandoUsuario = false;

let contadorPosicionesRack = 0;
let contadorPosicionesCouponGlobal = 0;

function reiniciarTemporizadorInactividadBusqueda() {
    if (temporizadorLimpiezaBusqueda) clearTimeout(temporizadorLimpiezaBusqueda);
    temporizadorLimpiezaBusqueda = setTimeout(() => {
        document.querySelectorAll('.cajon.resaltado, .card-material.resaltado').forEach(el => {
            el.classList.remove('resaltado');
        });
    }, 60000);
}

// =============================================================
// COMPRESIÓN DE IMÁGENES
// =============================================================
function comprimirImagen(file, maxWidth = 600, maxHeight = 600, calidad = 0.55) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }
                
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const base64Comprimido = canvas.toDataURL('image/jpeg', calidad);
                const pesoKB = (base64Comprimido.length / 1024).toFixed(2);
                console.log(`📸 Imagen comprimida: ${width}x${height} → ${pesoKB} KB`);
                resolve(base64Comprimido);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
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
            uid: usuarioUID || null,
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
});

async function crearLockersPorDefecto() {
    const batch = db.batch();
    const letras = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    letras.forEach(letra => {
        const ref = db.collection("config_lockers").doc(`L_${letra}`);
        batch.set(ref, { nombre: `Locker ${letra}`, niveles: 5 }, { merge: true });
    });
    await batch.commit();
    console.log("✅ Default lockers A-G created (5 compartments each)");
}

function escucharFirestore() {
    db.collection("usuarios").onSnapshot((snapshot) => {
        listaUsuariosFirebase = {};
        snapshot.forEach((doc) => { listaUsuariosFirebase[doc.id] = doc.data(); });
        renderUserTables();
    });

    db.collection("config_gabinetes").onSnapshot((snapshot) => {
        listaEstructuraGabinetes = [];
        snapshot.forEach((doc) => { listaEstructuraGabinetes.push({ id: doc.id, ...doc.data() }); });
        
        // ORDENAR POR EL CAMPO 'orden'
        listaEstructuraGabinetes.sort((a, b) => {
            if (a.orden !== undefined && b.orden !== undefined) return a.orden - b.orden;
            return (a.nombre || '').localeCompare(b.nombre || '');
        });

        if (listaEstructuraGabinetes.length === 0) crearGabinetesPorDefecto();
        else {
            generarGabinetes();
            refrescarChartsSiEsNecesario();
        }
    });

    db.collection("layout_puntos").onSnapshot((snapshot) => {
        puntosLayout = [];
        snapshot.forEach((doc) => { puntosLayout.push({ id: doc.id, ...doc.data() }); });
        renderizarPuntosLayout();
    });

    db.collection("gabinetes").onSnapshot((snapshot) => {
        inventarioGabinetes = {};
        snapshot.forEach((doc) => { inventarioGabinetes[doc.id] = doc.data(); });
        generarGabinetes();
        refrescarChartsSiEsNecesario();
    });

    db.collection("config_lockers").onSnapshot((snapshot) => {
        listaEstructuraLockers = [];
        snapshot.forEach((doc) => { listaEstructuraLockers.push({ id: doc.id, ...doc.data() }); });
        if (listaEstructuraLockers.length === 0) {
            crearLockersPorDefecto();
        } else {
            // ORDENAR POR EL CAMPO 'orden'
            listaEstructuraLockers.sort((a, b) => {
                if (a.orden !== undefined && b.orden !== undefined) return a.orden - b.orden;
                return (a.nombre || '').localeCompare(b.nombre || '');
            });
            generarTarjetasLockers();
            refrescarChartsSiEsNecesario();
        }
    });

    db.collection("lockers").onSnapshot((snapshot) => {
        inventarioLockers = {};
        snapshot.forEach((doc) => { inventarioLockers[doc.id] = doc.data().items || []; });
        generarTarjetasLockers();
        refrescarChartsSiEsNecesario();
    });

    db.collection("config_racks").onSnapshot((snapshot) => {
        listaEstructuraRacks = [];
        snapshot.forEach((doc) => { listaEstructuraRacks.push({ id: doc.id, ...doc.data() }); });
        
        // ORDENAR POR EL CAMPO 'orden'
        listaEstructuraRacks.sort((a, b) => {
            if (a.orden !== undefined && b.orden !== undefined) return a.orden - b.orden;
            return (a.nombre || '').localeCompare(b.nombre || '');
        });

        generarTarjetasRacks();
        refrescarChartsSiEsNecesario();
    });

    db.collection("racks").onSnapshot((snapshot) => {
        inventarioRacks = {};
        snapshot.forEach((doc) => { inventarioRacks[doc.id] = doc.data().items || []; });
        generarTarjetasRacks();
        refrescarChartsSiEsNecesario();
    });

    db.collection("catalogo_nacho").onSnapshot((snapshot) => {
        listaNacho = [];
        snapshot.forEach((doc) => { listaNacho.push({ firestoreId: doc.id, ...doc.data() }); });
        renderizarCatalogoNacho();
        actualizarGraficas();
        refrescarChartsSiEsNecesario();
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
// FIREBASE AUTH STATE LISTENER
// =============================================================
auth.onAuthStateChanged(async (user) => {
    if (registrandoUsuario) {
        console.log("⏸️ onAuthStateChanged bloqueado (registro en proceso)");
        return;
    }

    if (user) {
        usuarioUID = user.uid;
        console.log("⏱️ Auth detectado para UID:", user.uid);
        
        let perfil = null;
        
        for (let i = 0; i < 30; i++) {
            if (listaUsuariosFirebase[user.uid]) {
                perfil = listaUsuariosFirebase[user.uid];
                console.log(`✅ Perfil encontrado en cache local (intento ${i+1})`);
                break;
            }
            
            try {
                const docSnap = await db.collection("usuarios").doc(user.uid).get();
                if (docSnap.exists) {
                    perfil = docSnap.data();
                    listaUsuariosFirebase[user.uid] = perfil;
                    console.log(`✅ Perfil encontrado en Firestore (intento ${i+1})`);
                    break;
                }
            } catch (e) {
                console.warn(`⚠️ Error en intento ${i+1}:`, e);
            }
            
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        if (perfil) {
            usuarioActual = perfil.username || user.email;
            rolActual = perfil.role || 'USER';
            console.log("✅ Aplicando interfaz para:", usuarioActual, "(", rolActual, ")");
            aplicarInterfazSesionIniciada();
        } else {
            console.warn("❌ No profile found for UID:", user.uid);
            Swal.fire({
                icon: 'warning',
                title: 'Profile not found',
                text: 'Your account exists but no profile was found. Contact a Master.',
                confirmButtonColor: '#e30613'
            });
            await auth.signOut();
        }
        
    } else {
        usuarioActual = null;
        usuarioUID = null;
        rolActual = null;
        mostrarBloqueoPantalla();
    }
});

function mostrarBloqueoPantalla() {
    document.getElementById('bloqueo-pantalla').style.display = 'block';
    document.getElementById('contenido-protegido').style.display = 'none';
    document.getElementById('nav-tabs-container').style.display = 'none';
    document.getElementById('usuario-login').textContent = "Guest";
    document.getElementById('btn-login-trigger').style.display = 'inline-block';
    document.getElementById('btn-logout-trigger').style.display = 'none';
    document.getElementById('panel-master-acciones').style.display = 'none';
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

    if (rolActual === "SUPER_ADMIN") {
        document.getElementById('panel-master-acciones').style.display = 'flex';
    } else {
        document.getElementById('panel-master-acciones').style.display = 'none';
    }

    document.getElementById('panel-admin-clientes').style.display = 'block';

    const esAdmin = (rolActual === "SUPER_ADMIN" || rolActual === "ADMIN");

    const btnAddClient = document.getElementById('btn-agregar-cliente');
    if (btnAddClient) btnAddClient.style.display = esAdmin ? 'inline-block' : 'none';

    const btnAddClientList = document.getElementById('btn-agregar-cliente-lista-global');
    if (btnAddClientList) btnAddClientList.style.display = esAdmin ? 'inline-block' : 'none';

    const btnHistory = document.getElementById('btn-tab-history');
    if (btnHistory) btnHistory.style.display = esAdmin ? 'inline-block' : 'none';

    const panelRacks = document.getElementById('panel-admin-racks');
    if (panelRacks) panelRacks.style.display = esAdmin ? 'block' : 'none';

    const panelLockers = document.getElementById('panel-admin-lockers');
    if (panelLockers) panelLockers.style.display = esAdmin ? 'block' : 'none';

    if (esAdmin) {
        document.getElementById('panel-admin-nacho').style.display = 'block';
        document.getElementById('panel-admin-gabinetes').style.display = 'block';
    } else {
        document.getElementById('panel-admin-nacho').style.display = 'none';
        document.getElementById('panel-admin-gabinetes').style.display = 'none';
    }

    const btnEditLayout = document.getElementById('btn-modo-edicion');
    if (btnEditLayout) {
        btnEditLayout.style.display = (rolActual === "SUPER_ADMIN") ? 'inline-block' : 'none';
    }

    const cardInv = document.getElementById('card-inventario-acceso');
    if (rolActual === "EXTERNAL") {
        cardInv.style.display = 'none';
        setTimeout(() => showSection('fixtures'), 300);
    } else {
        cardInv.style.display = 'block';
    }

    renderizarTicketsNacho();
    generarTarjetasLockers();
    generarTarjetasRacks();
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
    const emailInput = document.getElementById('usuario').value.trim();
    const password = document.getElementById('password').value;
    const err = document.getElementById('mensaje-error-login');

    let emailToUse = emailInput;

    if (!emailInput.includes('@')) {
        let foundUser = null;
        for (const uid in listaUsuariosFirebase) {
            const u = listaUsuariosFirebase[uid];
            if (u.username && u.username.toLowerCase() === emailInput.toLowerCase()) {
                foundUser = u;
                break;
            }
        }
        if (foundUser && foundUser.email) {
            emailToUse = foundUser.email;
        } else {
            err.textContent = "User not found. Please use your email.";
            err.style.display = 'block';
            return;
        }
    }

    try {
        const credential = await auth.signInWithEmailAndPassword(emailToUse, password);
        const uid = credential.user.uid;

        const profile = listaUsuariosFirebase[uid];
        if (!profile) {
            err.textContent = "Your account exists but no profile was found. Contact a Master.";
            err.style.display = 'block';
            await auth.signOut();
            return;
        }
        if (profile.status === "pending") {
            err.textContent = "Your account is pending approval by a Master.";
            err.style.display = 'block';
            await auth.signOut();
            return;
        }
        if (profile.status === "rejected") {
            err.textContent = "Your account has been rejected.";
            err.style.display = 'block';
            await auth.signOut();
            return;
        }

        err.style.display = 'none';
        closeModal('modal-login');
        Toast.fire({ icon: 'success', title: `Welcome, ${profile.username || emailToUse}!` });
    } catch (error) {
        console.error("Login error:", error);
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            err.textContent = "Incorrect email or password.";
        } else if (error.code === 'auth/invalid-email') {
            err.textContent = "Invalid email format.";
        } else if (error.code === 'auth/too-many-requests') {
            err.textContent = "Too many attempts. Please try again later.";
        } else {
            err.textContent = "Login failed. Please try again.";
        }
        err.style.display = 'block';
    }
}

async function registerNewUser(event) {
    event.preventDefault();
    
    registrandoUsuario = true;
    
    const email = document.getElementById('reg-email').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const location = document.getElementById('reg-location').value.trim();
    const p1 = document.getElementById('reg-password').value;
    const p2 = document.getElementById('reg-password2').value;
    const err = document.getElementById('mensaje-error-registro');

    if (p1 !== p2) {
        err.textContent = "Passwords do not match.";
        err.style.display = 'block';
        registrandoUsuario = false;
        return;
    }

    if (p1.length < 6) {
        err.textContent = "Password must be at least 6 characters.";
        err.style.display = 'block';
        registrandoUsuario = false;
        return;
    }

    for (const uid in listaUsuariosFirebase) {
        const u = listaUsuariosFirebase[uid];
        if (u.username && u.username.toLowerCase() === username.toLowerCase()) {
            err.textContent = "That username is already taken.";
            err.style.display = 'block';
            registrandoUsuario = false;
            return;
        }
    }

    try {
        const credential = await auth.createUserWithEmailAndPassword(email, p1);
        const uid = credential.user.uid;

        await db.collection("usuarios").doc(uid).set({
            email: email,
            username: username,
            location: location,
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
            uid
        );

        await sendEmailNotification('master', {
            username: username,
            user_email: email,
            location: location
        });

        await auth.signOut();

        closeModal('modal-registro');
        document.getElementById('reg-email').value = '';
        document.getElementById('reg-username').value = '';
        document.getElementById('reg-location').value = '';
        document.getElementById('reg-password').value = '';
        document.getElementById('reg-password2').value = '';

        setTimeout(() => {
            registrandoUsuario = false;
            console.log("🔓 Flag de registro liberado");
        }, 1500);

        Swal.fire({
            icon: 'success',
            title: 'Registration Sent!',
            html: `Your account request has been sent.<br>A Master will review and approve it soon.`,
            confirmButtonColor: '#e30613'
        });
    } catch (error) {
        console.error("Registration error:", error);
        registrandoUsuario = false;
        
        if (error.code === 'auth/email-already-in-use') {
            err.textContent = "That email is already registered.";
        } else if (error.code === 'auth/invalid-email') {
            err.textContent = "Invalid email format.";
        } else if (error.code === 'auth/weak-password') {
            err.textContent = "Password is too weak.";
        } else {
            err.textContent = "Registration failed. Please try again.";
        }
        err.style.display = 'block';
    }
}

async function logout() {
    try {
        await auth.signOut();
        Toast.fire({ icon: 'info', title: 'Session closed successfully' });
    } catch (error) {
        console.error("Logout error:", error);
    }
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

    for (const uid in listaUsuariosFirebase) {
        const info = listaUsuariosFirebase[uid];

        if (info.status === "pending") {
            countPending++;
            const item = document.createElement('div');
            item.style.cssText = "background: #fff3cd; border: 1px solid #ffeeba; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;";
            item.innerHTML = `
                <div>
                    <strong style="color: #856404;">${info.username || uid}</strong>
                    <p style="margin: 2px 0 0 0; font-size: 12px; color: #495057;">📧 ${info.email || 'N/A'}</p>
                    <p style="margin: 0; font-size: 12px; color: #495057;">📍 ${info.location || 'N/A'}</p>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button class="btn-huf" style="padding: 6px 12px; font-size: 12px;" onclick="approveUser('${uid}')">✓ Approve</button>
                    <button class="btn-huf-secundario" style="padding: 6px 12px; font-size: 12px; background-color: #e30613;" onclick="rejectUser('${uid}')">✕ Reject</button>
                </div>
            `;
            pendientes.appendChild(item);
        } else if (info.status === "active") {
            countActive++;
            const item = document.createElement('div');
            item.style.cssText = "background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;";
            const esMaster = info.role === "SUPER_ADMIN";

            const roleOptions = `
                <select onchange="changeUserRole('${uid}', this.value)" style="padding: 4px 8px; border-radius: 4px; border: 1px solid #ced4da; font-size: 12px; background: #fff;" ${esMaster ? 'disabled' : ''}>
                    <option value="EXTERNAL" ${info.role === 'EXTERNAL' ? 'selected' : ''}>EXTERNAL</option>
                    <option value="USER" ${info.role === 'USER' ? 'selected' : ''}>USER</option>
                    <option value="ADMIN" ${info.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
                    ${esMaster ? '<option value="SUPER_ADMIN" selected>SUPER_ADMIN</option>' : ''}
                </select>
            `;

            const btnEliminar = esMaster ? '' : `<button onclick="deleteUser('${uid}')" style="background: none; border: none; color: #e30613; cursor: pointer; font-weight: bold; font-size: 18px;">&times;</button>`;

            item.innerHTML = `
                <div>
                    <strong>${info.username || uid}</strong> <span style="font-size: 11px; color: #6c757d;">(${info.role})</span>
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

async function approveUser(uid) {
    if (rolActual !== "SUPER_ADMIN") return;

    const user = listaUsuariosFirebase[uid];
    if (!user) return;

    const { value: role } = await Swal.fire({
        title: `Approve "${user.username || uid}"`,
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

    await db.collection("usuarios").doc(uid).update({
        status: "active",
        role: role,
        approvedAt: new Date().toISOString(),
        approvedBy: usuarioActual
    });

    await registrarModificacion(
        'USUARIO',
        'EDITAR',
        `User "${user.username || uid}" approved with role ${role}`,
        { status: 'pending', role: 'EXTERNAL' },
        { status: 'active', role: role },
        'usuarios',
        uid
    );

    if (user.email) {
        await sendEmailNotification('approved', {
            username: user.username || uid,
            to_email: user.email,
            role: role
        });
    }

    Toast.fire({ icon: 'success', title: `User approved as ${role}` });
}

async function rejectUser(uid) {
    if (rolActual !== "SUPER_ADMIN") return;

    const user = listaUsuariosFirebase[uid];
    if (!user) return;

    const res = await Swal.fire({
        title: `Reject "${user.username || uid}"?`,
        text: "The account will be marked as rejected and cannot log in.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e30613',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, reject',
        cancelButtonText: 'Cancel'
    });

    if (!res.isConfirmed) return;

    await db.collection("usuarios").doc(uid).update({
        status: "rejected",
        rejectedAt: new Date().toISOString(),
        rejectedBy: usuarioActual
    });

    await registrarModificacion(
        'USUARIO',
        'EDITAR',
        `User "${user.username || uid}" registration rejected`,
        { status: 'pending' },
        { status: 'rejected' },
        'usuarios',
        uid
    );

    Toast.fire({ icon: 'success', title: `User rejected` });
}

async function changeUserRole(uid, newRole) {
    if (rolActual !== "SUPER_ADMIN") return;
    const user = listaUsuariosFirebase[uid];
    if (!user || user.role === "SUPER_ADMIN") return;

    await db.collection("usuarios").doc(uid).update({ role: newRole });

    await registrarModificacion(
        'USUARIO',
        'EDITAR',
        `User "${user.username || uid}" role changed from ${user.role} to ${newRole}`,
        { role: user.role },
        { role: newRole },
        'usuarios',
        uid
    );

    Toast.fire({ icon: 'success', title: `Role updated to ${newRole}` });
}

async function deleteUser(uid) {
    if (rolActual !== "SUPER_ADMIN") return;
    const user = listaUsuariosFirebase[uid];
    if (!user || user.role === "SUPER_ADMIN") return;

    const res = await Swal.fire({
        title: `Delete "${user.username || uid}"?`,
        text: "The user profile will be removed from Firestore. The Auth account must be deleted separately from Firebase Console.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e30613',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, delete',
        cancelButtonText: 'Cancel'
    });

    if (res.isConfirmed) {
        await db.collection("usuarios").doc(uid).delete();
        await registrarModificacion('USUARIO', 'ELIMINAR', `User profile "${user.username || uid}" deleted`, { username: user.username }, null, 'usuarios', uid);
        Toast.fire({ icon: 'success', title: 'User profile deleted' });
    }
}

// =============================================================
// CLIENT MANAGEMENT
// =============================================================
function poblarSelectClientes() {
    const select = document.getElementById('input-pieza-cliente');
    if (select) {
        select.innerHTML = '<option value="">-- Select a client --</option>';
        listaClientesFirebase.forEach((c) => {
            const option = document.createElement('option');
            option.value = c.nombre;
            option.textContent = c.nombre + (c.abreviatura ? ` (${c.abreviatura})` : '');
            select.appendChild(option);
        });
    }

    const selectGlobal = document.getElementById('fg-cliente');
    if (selectGlobal) {
        selectGlobal.innerHTML = '<option value="">-- Select a client --</option>';
        listaClientesFirebase.forEach((c) => {
            const option = document.createElement('option');
            option.value = c.nombre;
            option.textContent = c.nombre + (c.abreviatura ? ` (${c.abreviatura})` : '');
            selectGlobal.appendChild(option);
        });
    }

    const selectRack = document.getElementById('rack-pieza-cliente');
    if (selectRack) {
        selectRack.innerHTML = '<option value="">-- Select a client --</option>';
        listaClientesFirebase.forEach((c) => {
            const option = document.createElement('option');
            option.value = c.nombre;
            option.textContent = c.nombre + (c.abreviatura ? ` (${c.abreviatura})` : '');
            selectRack.appendChild(option);
        });
    }

    const selectCouponGlobal = document.getElementById('cg-cliente');
    if (selectCouponGlobal) {
        selectCouponGlobal.innerHTML = '<option value="">-- Select a client --</option>';
        listaClientesFirebase.forEach((c) => {
            const option = document.createElement('option');
            option.value = c.nombre;
            option.textContent = c.nombre + (c.abreviatura ? ` (${c.abreviatura})` : '');
            selectCouponGlobal.appendChild(option);
        });
    }
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
                    <button class="btn-editar-pieza" onclick="editClientName('${c.id}', '${c.nombre}', '${c.abreviatura || ''}')" title="Edit Client">✏️</button>
                    <button class="btn-eliminar-cliente" onclick="confirmDeleteClient('${c.id}', '${c.nombre}')" title="Delete Client">&times;</button>
                </div>
            `;
        } else {
            botonesHTML = `<span style="font-size: 11px; color: #adb5bd; font-style: italic;">Read only</span>`;
        }

        const abrevHTML = c.abreviatura ? `<span style="font-size: 11px; color: #6c757d; margin-left: 6px;">(${c.abreviatura})</span>` : '';
        tarjeta.innerHTML = `<span>${c.nombre}${abrevHTML}</span>${botonesHTML}`;
        contenedor.appendChild(tarjeta);
    });
}

async function saveNewClient(event) {
    event.preventDefault();

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
    const abrevInput = document.getElementById('input-nuevo-cliente-abrev');
    const nombreVal = nombreInput.value.trim();
    const abrevVal = abrevInput ? abrevInput.value.trim() : '';

    if (!nombreVal) return;

    for (const c of listaClientesFirebase) {
        if (c.nombre.toLowerCase() === nombreVal.toLowerCase()) {
            Swal.fire({
                icon: 'warning',
                title: 'Duplicate client',
                text: `A client named "${nombreVal}" already exists.`,
                confirmButtonColor: '#e30613'
            });
            return;
        }
    }

    if (abrevVal) {
        for (const c of listaClientesFirebase) {
            if (c.abreviatura && c.abreviatura.toLowerCase() === abrevVal.toLowerCase()) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Duplicate abbreviation',
                    text: `The abbreviation "${abrevVal}" is already in use by "${c.nombre}". Please choose a different one.`,
                    confirmButtonColor: '#e30613'
                });
                return;
            }
        }
    }

    try {
        const docRef = await db.collection("clientes").add({
            nombre: nombreVal,
            abreviatura: abrevVal
        });
        await registrarModificacion('CLIENTE', 'CREAR', `Client "${nombreVal}" added`, null, { nombre: nombreVal, abreviatura: abrevVal }, 'clientes', docRef.id);
        nombreInput.value = '';
        if (abrevInput) abrevInput.value = '';
        closeModal('modal-nuevo-cliente');
        Toast.fire({ icon: 'success', title: `Client "${nombreVal}" added` });
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Error', text: 'Could not save the client.' });
    }
}

async function editClientName(id, nombreActual, abrevActual) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Insufficient permissions', text: 'Only administrators can edit existing clients.', confirmButtonColor: '#e30613' });
        return;
    }

    const { value: formValues } = await Swal.fire({
        title: 'Edit client',
        html: `
            <input id="swal-nombre" class="swal2-input" placeholder="Client Name" value="${nombreActual.replace(/"/g, '&quot;')}">
            <input id="swal-abrev" class="swal2-input" placeholder="Abbreviation (max 6)" maxlength="6" value="${(abrevActual || '').replace(/"/g, '&quot;')}">
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Save',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#e30613',
        preConfirm: () => {
            const nombre = document.getElementById('swal-nombre').value.trim();
            const abrev = document.getElementById('swal-abrev').value.trim();
            if (!nombre) {
                Swal.showValidationMessage('Name cannot be empty!');
                return false;
            }
            return { nombre, abrev };
        }
    });

    if (formValues && formValues.nombre) {
        if (formValues.abrev) {
            for (const c of listaClientesFirebase) {
                if (c.id !== id && c.abreviatura && c.abreviatura.toLowerCase() === formValues.abrev.toLowerCase()) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Duplicate abbreviation',
                        text: `The abbreviation "${formValues.abrev}" is already in use by "${c.nombre}". Please choose a different one.`,
                        confirmButtonColor: '#e30613'
                    });
                    return;
                }
            }
        }

        try {
            await db.collection("clientes").doc(id).update({
                nombre: formValues.nombre,
                abreviatura: formValues.abrev
            });
            await registrarModificacion(
                'CLIENTE',
                'EDITAR',
                `Client "${nombreActual}" edited`,
                { nombre: nombreActual, abreviatura: abrevActual || '' },
                { nombre: formValues.nombre, abreviatura: formValues.abrev },
                'clientes',
                id
            );
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
        config_lockers: listaEstructuraLockers,
        inv_lockers_v2: inventarioLockers,
        config_racks: listaEstructuraRacks,
        inv_racks: inventarioRacks,
        inv_nacho: listaNacho,
        inv_tickets: listaTickets,
        historial_busquedas: historialBusquedasGabinetes,
        historial_graficas: historialGraficasGuardado,
        lista_fixtures_global: listaFixturesGlobales,
        clientes: listaClientesFirebase
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

            if (importedData.config_lockers) {
                importedData.config_lockers.forEach(l => {
                    const ref = db.collection("config_lockers").doc(l.id);
                    batch.set(ref, l);
                });
            }

            if (importedData.config_racks) {
                importedData.config_racks.forEach(r => {
                    const ref = db.collection("config_racks").doc(r.id);
                    batch.set(ref, r);
                });
            }

            if (importedData.inv_racks) {
                for (const key in importedData.inv_racks) {
                    batch.set(db.collection("racks").doc(key), importedData.inv_racks[key]);
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

        if (rolActual === "SUPER_ADMIN") {
            wrapper.setAttribute('draggable', 'true');
            wrapper.dataset.id = gab.id;
            wrapper.dataset.tipo = 'gabinete';
            wrapper.ondragstart = handleDragStart;
            wrapper.ondragover = handleDragOver;
            wrapper.ondrop = handleDrop;
        }

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
    if (!usuarioActual || (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN" && rolActual !== "USER")) {
        Swal.fire({ icon: 'error', title: 'Insufficient permissions', text: 'You must be logged in to edit components.', confirmButtonColor: '#e30613' });
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
    document.getElementById('gabinete-descripcion-input').value = '';
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
    document.getElementById('gabinete-descripcion-input').value = gab.descripcion || '';
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

    const descripcion = document.getElementById('gabinete-descripcion-input').value.trim();
    let datosGabinete = { nombre, tipo, color, descripcion, esEspecial: tipo === 'CUSTOM' };

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

    listaEstructuraLockers.forEach(locker => {
        for (let d = 1; d <= locker.niveles; d++) {
            const key = `${locker.id}-${d}`;
            const piezas = inventarioLockers[key] || [];
            piezas.forEach(p => {
                const textoCompleto = `${p.nombre} ${p.cliente} ${p.localidad} ${p.proyecto} ${p.desc}`.toLowerCase();
                if (textoCompleto.includes(termino)) {
                    resultados.push({ lockerNombre: locker.nombre, lockerId: locker.id, estante: d, ...p });
                }
            });
        }
    });

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
                <div style="background:#1a1d20; color:#ffffff; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:bold; white-space:nowrap;">${r.lockerNombre} - Div ${r.estante}</div>
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

    const esAdmin = rolActual === "SUPER_ADMIN" || rolActual === "ADMIN";

    if (listaEstructuraLockers.length === 0) {
        contenedor.innerHTML = `<p style="font-size: 13px; color: #6c757d; grid-column: 1/-1; text-align: center; padding: 20px;">No lockers registered. ${esAdmin ? 'Use "+ Create New Locker" to add one.' : ''}</p>`;
        return;
    }

    listaEstructuraLockers.forEach((locker) => {
        let totalPiezas = 0;
        for (let d = 1; d <= locker.niveles; d++) {
            const key = `${locker.id}-${d}`;
            if (inventarioLockers[key]) totalPiezas += inventarioLockers[key].length;
        }

        const card = document.createElement('div');
        card.className = 'locker-card';

        if (rolActual === "SUPER_ADMIN") {
            card.setAttribute('draggable', 'true');
            card.dataset.id = locker.id;
            card.dataset.tipo = 'locker';
            card.ondragstart = handleDragStart;
            card.ondragover = handleDragOver;
            card.ondrop = handleDrop;
        }

        card.onclick = (e) => {
            if (e.target.closest('.locker-actions')) return;
            openLockerDetail(locker.id);
        };


        const adminActions = esAdmin ? `
            <div class="locker-actions">
                <button onclick="openEditLockerModal('${locker.id}')" title="Edit Locker">✏️</button>
                <button onclick="confirmDeleteLocker('${locker.id}', '${locker.nombre}')" title="Delete Locker">&times;</button>
            </div>
        ` : '';

        card.innerHTML = `
            ${adminActions}
            <h3>${locker.nombre}</h3>
            <p class="locker-levels">${locker.niveles} Compartment(s)</p>
            <p class="locker-count">${totalPiezas} Fixture(s) stored</p>
        `;
        contenedor.appendChild(card);
    });
}

function openCreateLockerModal() {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Insufficient permissions', text: 'Only administrators can create lockers.', confirmButtonColor: '#e30613' });
        return;
    }
    document.getElementById('locker-id-editar').value = '';
    document.getElementById('titulo-modal-locker').textContent = 'Create New Locker';
    document.getElementById('locker-nombre-input').value = '';
    document.getElementById('locker-descripcion-input').value = '';
    document.getElementById('locker-niveles-input').value = '5';
    openModal('modal-nuevo-locker');
}

function openEditLockerModal(id) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Insufficient permissions', text: 'Only administrators can edit lockers.', confirmButtonColor: '#e30613' });
        return;
    }
    const locker = listaEstructuraLockers.find(l => l.id === id);
    if (!locker) return;

    document.getElementById('locker-id-editar').value = locker.id;
    document.getElementById('titulo-modal-locker').textContent = `Edit Locker: ${locker.nombre}`;
    document.getElementById('locker-nombre-input').value = locker.nombre;
    document.getElementById('locker-descripcion-input').value = locker.descripcion || '';
    document.getElementById('locker-niveles-input').value = locker.niveles || 5;
    openModal('modal-nuevo-locker');
}

async function saveLockerStructure(event) {
    event.preventDefault();
    const idExistente = document.getElementById('locker-id-editar').value;
    const nombre = document.getElementById('locker-nombre-input').value.trim();
    const descripcion = document.getElementById('locker-descripcion-input').value.trim();
    const niveles = parseInt(document.getElementById('locker-niveles-input').value) || 5;
    const docId = idExistente ? idExistente : `L_${Date.now()}`;
    const lockerAnterior = idExistente ? listaEstructuraLockers.find(l => l.id === idExistente) : null;

    const datosLocker = { nombre, niveles, descripcion };

    await db.collection("config_lockers").doc(docId).set(datosLocker, { merge: true });

    await registrarModificacion(
        'LOCKER',
        idExistente ? 'EDITAR' : 'CREAR',
        idExistente ? `Locker "${nombre}" edited (${niveles} compartments)` : `Locker "${nombre}" created (${niveles} compartments)`,
        lockerAnterior, datosLocker, 'config_lockers', docId
    );

    closeModal('modal-nuevo-locker');
    Toast.fire({ icon: 'success', title: idExistente ? 'Locker updated' : 'New locker created' });
}

async function confirmDeleteLocker(id, nombre) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Insufficient permissions', text: 'Only administrators can delete lockers.', confirmButtonColor: '#e30613' });
        return;
    }

    const res = await Swal.fire({
        title: `Delete "${nombre}"?`,
        text: "The locker will be removed. Its items will be kept in the database for safety.",
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, delete locker', cancelButtonText: 'Cancel'
    });

    if (res.isConfirmed) {
        const lockerAnterior = listaEstructuraLockers.find(l => l.id === id);
        await db.collection("config_lockers").doc(id).delete();
        await registrarModificacion('LOCKER', 'ELIMINAR', `Locker "${nombre}" deleted`, lockerAnterior, null, 'config_lockers', id);
        Toast.fire({ icon: 'success', title: 'Locker deleted' });
    }
}

function openLockerDetail(lockerId) {
    const locker = listaEstructuraLockers.find(l => l.id === lockerId);
    if (!locker) return;

    const tituloEl = document.getElementById('titulo-modal-locker-detalle');
    tituloEl.textContent = `${locker.nombre} - Compartments & Pieces`;
    tituloEl.dataset.id = lockerId;
    
    const cont = document.getElementById('contenido-estantes-locker');
    cont.innerHTML = '';
    const esAdmin = rolActual === "SUPER_ADMIN" || rolActual === "ADMIN";

    const btnRename = document.getElementById('btn-renombrar-niveles-locker');
    if (btnRename) {
        btnRename.style.display = esAdmin ? 'inline-block' : 'none';
    }

    generarContenidoLockerDetail(locker, cont);
    openModal('modal-locker-detalle');
}

function generarContenidoLockerDetail(locker, cont) {
    const lockerId = locker.id;
    const esAdmin = rolActual === "SUPER_ADMIN" || rolActual === "ADMIN";

    for (let d = 1; d <= locker.niveles; d++) {
        const key = `${lockerId}-${d}`;
        const piezas = inventarioLockers[key] || [];
        const bloque = document.createElement('div');
        bloque.style.cssText = "background:#ffffff; border:1px solid #dee2e6; border-radius:8px; padding:15px; margin-bottom:15px;";

        let htmlPiezas = '';
        if (piezas.length === 0) {
            htmlPiezas = `<p style="font-size: 12px; color: #adb5bd; grid-column: 1/-1;">No pieces registered on this compartment.</p>`;
        } else {
            piezas.forEach((p, idx) => {
                const imgTag = p.foto ? `<img src="${p.foto}" style="width:70px; height:70px; object-fit:cover; border-radius:6px; cursor:pointer;" onclick="enlargePhoto('${p.foto}')" title="Click to enlarge">` : '';
                const esCreador = p.creadoPor === usuarioActual;
                const puedeEditar = esAdmin || esCreador;
                
                const btnAcciones = puedeEditar ? `
                    <div style="display:flex; gap:4px; margin-top:8px;">
                        <button class="btn-editar-pieza" style="background:#e9ecef; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="openEditPieceModal('${lockerId}', ${d}, ${idx})" title="Edit Fixture">✏️</button>
                        ${esAdmin ? `<button class="btn-borrar-pieza" style="background:#fff3cd; border:none; color:#e30613; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:bold;" onclick="deleteLockerPiece('${lockerId}', ${d}, ${idx})" title="Delete">&times;</button>` : ''}
                    </div>
                ` : '';

                const fixtureJSON = JSON.stringify(p).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                const estadoInfo = ESTADOS_DISPONIBLES[p.estado] || ESTADOS_DISPONIBLES['Available'];
                const estadoBadge = `<button onclick="openEstadoSelector('locker', '${lockerId}', ${d}, ${idx}, event)" style="background: ${estadoInfo.color}; color: white; border: none; padding: 2px 10px; border-radius: 12px; font-size: 10px; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin-bottom: 6px;">${estadoInfo.emoji} ${estadoInfo.label} ▾</button>`;

                // Cantidad simple
                const cantidadHTML = (p.cantidad !== undefined && p.cantidad !== '' && p.cantidad !== null)
                    ? `<p style="margin:0; font-size:11px; color:#495057;"><strong>Quantity:</strong> ${p.cantidad} pcs</p>`
                    : '';

                // Códigos internos
                let codigosHTML = '';
                if (p.codigosInternos && p.codigosInternos.length > 0) {
                    codigosHTML = '<div style="margin: 6px 0; display: flex; flex-direction: column; gap: 3px;">';
                    p.codigosInternos.forEach(cod => {
                        codigosHTML += `<span style="font-family: monospace; font-size: 11px; color: #862e9c; font-weight: bold; background: #f3e8ff; padding: 3px 8px; border-radius: 4px; border: 1px solid #d0bfff; display: inline-block; width: fit-content;">🔢 ${cod.codigo} <span style="color: #495057; font-weight: normal;">→ Quantity: ${cod.cantidad}</span></span>`;
                    });
                    codigosHTML += '</div>';
                }

                // Posiciones
                let posicionesHTML = '';
                if (p.posiciones && p.posiciones.length > 0) {
                    posicionesHTML = '<div style="margin: 6px 0; display: flex; flex-wrap: wrap; gap: 4px;">';
                    p.posiciones.forEach(pos => {
                        posicionesHTML += `<span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; font-size: 10px; color: #495057;"><strong>${pos.abreviatura}</strong>: ${pos.cantidad}</span>`;
                    });
                    posicionesHTML += '</div>';
                }

                htmlPiezas += `
                    <div style="background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; padding:12px; display:flex; gap:12px; align-items:flex-start; position:relative;">
                        ${imgTag}
                        <div style="flex:1;">
                            ${estadoBadge}
                            <h5 style="margin:0 0 5px 0; font-size:14px; color:#1a1d20;">${p.nombre}</h5>
                            <p style="margin:0; font-size:11px; color:#495057;"><strong>Client:</strong> ${p.cliente || 'N/A'}</p>
                            <p style="margin:0; font-size:11px; color:#495057;"><strong>Location:</strong> ${p.localidad || 'N/A'}</p>
                            <p style="margin:0; font-size:11px; color:#495057;"><strong>Project:</strong> ${p.proyecto || 'N/A'}</p>
                            ${p.year ? `<p style="margin:0; font-size:11px; color:#495057;"><strong>Year:</strong> ${p.year}</p>` : ''}
                            ${cantidadHTML}
                            ${codigosHTML}
                            ${posicionesHTML}
                            <button style="margin-top:6px; background:none; border:none; color:#e30613; font-size:11px; font-weight:bold; padding:0; cursor:pointer; text-decoration:underline;" onclick='viewFullFixtureDetail(${fixtureJSON})'>View more / Details</button>
                            ${btnAcciones}
                        </div>
                    </div>
                `;
            });
        }

        const btnAgregar = usuarioActual ? `<button class="btn-huf-secundario" style="font-size: 11px; padding: 4px 8px;" onclick="openAddPieceModal('${lockerId}', ${d})">+ Add Fixture</button>` : '';
        const nombreNivel = (locker.nombresNiveles && locker.nombresNiveles[d]) ? locker.nombresNiveles[d] : `Compartment ${d}`;

        bloque.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #f1f3f5; padding-bottom:8px; margin-bottom:12px;">
                <h4 style="margin:0; font-size:14px; color:#343a40;">${nombreNivel}</h4>
                ${btnAgregar}
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:12px;">
                ${htmlPiezas}
            </div>
        `;
        cont.appendChild(bloque);
    }
}

function viewFullFixtureDetail(fixture) {
    const imagenHTML = fixture.foto
        ? `<img src="${fixture.foto}" style="max-width: 100%; max-height: 250px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #dee2e6;">`
        : '<p style="color: #6c757d; font-style: italic; margin-bottom: 15px;">No photo attached</p>';

    let codigosHTML = '';
    if (fixture.codigosInternos && fixture.codigosInternos.length > 0) {
        codigosHTML = `
            <hr style="margin: 15px 0; border: none; border-top: 1px solid #e9ecef;">
            <p style="margin: 0 0 8px 0;"><strong>🔢 Internal Recognition Codes:</strong></p>
            <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px;">
        `;
        fixture.codigosInternos.forEach(cod => {
            codigosHTML += `
                <div style="background: #f3e8ff; border: 1px solid #d0bfff; border-radius: 6px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                    <span style="font-family: monospace; font-weight: bold; color: #862e9c; font-size: 13px;">${cod.codigo}</span>
                    <span style="background: #862e9c; color: white; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; white-space: nowrap;">Quantity: ${cod.cantidad}</span>
                </div>
            `;
        });
        codigosHTML += `</div>`;
    }

    let posicionesHTML = '';
    if (fixture.posiciones && fixture.posiciones.length > 0) {
        posicionesHTML = `
            <p style="margin: 0 0 6px 0;"><strong>Positions & Quantities:</strong></p>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 15px;">
        `;
        fixture.posiciones.forEach(pos => {
            posicionesHTML += `<span style="background: #e9ecef; padding: 4px 10px; border-radius: 6px; font-size: 12px; color: #495057;"><strong>${pos.abreviatura}</strong>: ${pos.cantidad}</span>`;
        });
        posicionesHTML += `</div>`;
    }

    const estadoInfo = ESTADOS_DISPONIBLES[fixture.estado] || ESTADOS_DISPONIBLES['Available'];
    const estadoHTML = `<p><strong>Status:</strong> <span style="background: ${estadoInfo.color}; color: white; padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: bold;">${estadoInfo.emoji} ${estadoInfo.label}</span></p>`;

    const cantidadHTML = (fixture.cantidad !== undefined && fixture.cantidad !== '' && fixture.cantidad !== null)
        ? `<p><strong>Quantity:</strong> ${fixture.cantidad} pcs</p>`
        : '';

    Swal.fire({
        title: fixture.nombre,
        html: `
            <div style="text-align: left; font-size: 14px;">
                <div style="text-align: center;">${imagenHTML}</div>
                ${estadoHTML}
                <p><strong>Client:</strong> ${fixture.cliente || 'N/A'}</p>
                <p><strong>Location:</strong> ${fixture.localidad || 'N/A'}</p>
                <p><strong>Project:</strong> ${fixture.proyecto || 'N/A'}</p>
                ${fixture.year ? `<p><strong>Year:</strong> ${fixture.year}</p>` : ''}
                ${cantidadHTML}
                ${codigosHTML}
                ${posicionesHTML}
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

function openAddPieceModal(lockerId, divNum) {
    document.getElementById('pieza-locker-id').value = lockerId;
    document.getElementById('pieza-div-id').value = divNum;
    document.getElementById('pieza-index').value = '';
    document.getElementById('titulo-modal-pieza').textContent = `Add Fixture to Compartment ${divNum}`;
    document.getElementById('input-pieza-nombre').value = '';
    document.getElementById('input-pieza-cliente').value = '';
    document.getElementById('input-pieza-localidad').value = '';
    document.getElementById('input-pieza-cantidad').value = '';
    document.getElementById('input-pieza-desc').value = '';
    document.getElementById('input-pieza-foto-file').value = '';
    document.getElementById('input-pieza-foto-base64').value = '';
    document.getElementById('preview-foto-miniatura').style.display = 'none';

    // Reset More Data Options
    const checkMore = document.getElementById('check-more-data-options');
    if (checkMore) checkMore.checked = false;
    const seccion = document.getElementById('seccion-more-data-options');
    if (seccion) seccion.style.display = 'none';
    document.getElementById('pieza-abrev').value = '';
    document.getElementById('pieza-year').value = new Date().getFullYear();
    document.getElementById('pieza-proj-part1').value = '';
    document.getElementById('pieza-proj-part2').value = '';
    document.getElementById('contenedor-posiciones-locker').innerHTML = '';
    contadorPosicionesLocker = 0;
    document.getElementById('contenedor-codigos-locker').innerHTML = '<input type="text" readonly value="Fill all fields (project, year, client) to generate codes" style="background-color: #f3e8ff; color: #6c757d; font-family: monospace; letter-spacing: 1px; padding: 6px 10px; border: 1px solid #d0bfff; border-radius: 5px; font-size: 12px;">';

    const check = document.getElementById('check-agregar-a-lista-global');
    if (check) check.checked = false;

    poblarSelectClientes();
    closeModal('modal-locker-detalle');
    openModal('modal-editar-pieza');
}

function openEditPieceModal(lockerId, divNum, index) {
    const key = `${lockerId}-${divNum}`;
    const pieza = inventarioLockers[key][index];
    if (!pieza) return;
    poblarSelectClientes();

    document.getElementById('pieza-locker-id').value = lockerId;
    document.getElementById('pieza-div-id').value = divNum;
    document.getElementById('pieza-index').value = index;
    document.getElementById('titulo-modal-pieza').textContent = `Edit Fixture: ${pieza.nombre}`;
    document.getElementById('input-pieza-nombre').value = pieza.nombre || '';
    document.getElementById('input-pieza-cliente').value = pieza.cliente || '';
    document.getElementById('input-pieza-localidad').value = pieza.localidad || '';
    document.getElementById('input-pieza-cantidad').value = pieza.cantidad || '';
    document.getElementById('input-pieza-desc').value = pieza.desc || '';
    document.getElementById('input-pieza-foto-base64').value = pieza.foto || '';

    if (pieza.foto) {
        document.getElementById('img-pieza-miniatura-prev').src = pieza.foto;
        document.getElementById('preview-foto-miniatura').style.display = 'block';
    } else {
        document.getElementById('preview-foto-miniatura').style.display = 'none';
    }

    // Cargar More Data Options si la pieza los tiene
    const checkMore = document.getElementById('check-more-data-options');
    const seccion = document.getElementById('seccion-more-data-options');
    const tieneMoreData = !!(pieza.posiciones && pieza.posiciones.length > 0) || !!pieza.codigoInterno;

    if (checkMore) checkMore.checked = tieneMoreData;
    if (seccion) seccion.style.display = tieneMoreData ? 'block' : 'none';

    // Project number partido
    if (pieza.proyecto && pieza.proyecto.includes('.')) {
        const partes = pieza.proyecto.split('.');
        document.getElementById('pieza-proj-part1').value = partes[0] || '';
        document.getElementById('pieza-proj-part2').value = partes[1] || '';
    } else {
        document.getElementById('pieza-proj-part1').value = '';
        document.getElementById('pieza-proj-part2').value = '';
    }

    document.getElementById('pieza-year').value = pieza.year || new Date().getFullYear();
    document.getElementById('pieza-abrev').value = pieza.abreviatura || '';

    cargarPosicionesLocker(pieza.posiciones || null);

    const check = document.getElementById('check-agregar-a-lista-global');
    if (check) check.checked = false;

    closeModal('modal-locker-detalle');
    openModal('modal-editar-pieza');
}

function autotab(actual, siguienteId) {
    if (actual.value.length >= actual.maxLength) document.getElementById(siguienteId).focus();
}

async function convertImageToBase64(input) {
    const file = input.files[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
        Swal.fire({
            icon: 'error',
            title: 'Image too large',
            text: 'Please select an image smaller than 10 MB.',
            confirmButtonColor: '#e30613'
        });
        input.value = '';
        return;
    }
    
    try {
        Toast.fire({ icon: 'info', title: 'Compressing image...' });
        const base64Comprimido = await comprimirImagen(file, 600, 600, 0.55);
        document.getElementById('input-pieza-foto-base64').value = base64Comprimido;
        document.getElementById('img-pieza-miniatura-prev').src = base64Comprimido;
        document.getElementById('preview-foto-miniatura').style.display = 'block';
        Toast.fire({ icon: 'success', title: 'Image ready' });
    } catch (error) {
        console.error("Error compressing image:", error);
        Swal.fire({ icon: 'error', title: 'Error', text: 'Could not process the image.' });
    }
}

async function saveLockerPiece(event) {
    event.preventDefault();
    const lockerId = document.getElementById('pieza-locker-id').value;
    const divNum = document.getElementById('pieza-div-id').value;
    const index = document.getElementById('pieza-index').value;
    const key = `${lockerId}-${divNum}`;

    const part1 = document.getElementById('pieza-proj-part1').value.trim();
    const part2 = document.getElementById('pieza-proj-part2').value.trim();
    const proyectoCompleto = (part1 && part2) ? `${part1}.${part2}` : '';

    // VALIDACIÓN: El proyecto ahora es obligatorio siempre
    if (!part1 || !part2 || part1.length !== 4 || part2.length !== 3) {
        Swal.fire({ icon: 'error', title: 'Missing Project', text: 'Please enter a valid Project Number (4 digits, point, 3 digits).', confirmButtonColor: '#e30613' });
        return;
    }

    const checkMore = document.getElementById('check-more-data-options');
    const moreDataActivo = checkMore && checkMore.checked;

    const esNuevo = (index === "");
    const estadoActual = esNuevo ? 'Available' : (inventarioLockers[key][parseInt(index)]?.estado || 'Available');

    const checkGlobal = document.getElementById('check-agregar-a-lista-global');
    const quiereAgregarGlobal = checkGlobal && checkGlobal.checked;

    // VALIDACIÓN: Si quiere global, exigir los campos de la lista global
    if (quiereAgregarGlobal) {
        const pais = document.getElementById('gl-pais').value.trim();
        const planta = document.getElementById('gl-planta').value.trim();
        if (!pais || !planta) {
            Swal.fire({ icon: 'error', title: 'Missing data', text: 'Please fill Country and Plant to add to the Global List.', confirmButtonColor: '#e30613' });
            return;
        }
    }

    // Preparamos los datos del Locker
    const piezaData = {
        nombre: document.getElementById('input-pieza-nombre').value.trim(),
        cliente: document.getElementById('input-pieza-cliente').value,
        localidad: document.getElementById('input-pieza-localidad').value.trim(),
        proyecto: proyectoCompleto, // Siempre se guarda el proyecto
        desc: document.getElementById('input-pieza-desc').value.trim(),
        foto: document.getElementById('input-pieza-foto-base64').value || '',
        estado: estadoActual,
        creadoPor: usuarioActual
    };

    // Cantidad simple
    const cantidadSimple = document.getElementById('input-pieza-cantidad').value.trim();
    if (!moreDataActivo && cantidadSimple !== '') {
        piezaData.cantidad = parseInt(cantidadSimple) || 0;
    } else {
        piezaData.cantidad = '';
    }

    // More data options (Año, Abreviatura, Posiciones, Códigos)
    if (moreDataActivo) {
        const year = parseInt(document.getElementById('pieza-year').value) || null;
        const abrev = document.getElementById('pieza-abrev').value.trim().toUpperCase();
        const contenedor = document.getElementById('contenedor-posiciones-locker');
        const todasLasPosiciones = [];
        if (contenedor) {
            Array.from(contenedor.children).forEach(div => {
                const inputAbrev = div.querySelector('.lk-pos-abrev');
                const inputCant = div.querySelector('.lk-pos-cant');
                if (inputAbrev && inputCant) {
                    const a = (inputAbrev.value || '').trim().toUpperCase();
                    const c = parseInt(inputCant.value) || 0;
                    if (a) todasLasPosiciones.push({ abreviatura: a, cantidad: c });
                }
            });
        }

        const totalCantidad = todasLasPosiciones.reduce((sum, pos) => sum + (parseInt(pos.cantidad) || 0), 0);
        if (totalCantidad <= 0) {
            Swal.fire({ icon: 'error', title: 'Missing quantities', text: 'Please fill at least one position with a quantity greater than 0.', confirmButtonColor: '#e30613' });
            return;
        }

        const abrevsVistas = {};
        const duplicadas = [];
        todasLasPosiciones.forEach(pos => {
            if (abrevsVistas[pos.abreviatura]) { if (!duplicadas.includes(pos.abreviatura)) duplicadas.push(pos.abreviatura); } 
            else { abrevsVistas[pos.abreviatura] = true; }
        });
        if (duplicadas.length > 0) {
            Swal.fire({ icon: 'error', title: 'Duplicate positions', text: 'Each position must be unique.', confirmButtonColor: '#e30613' });
            return;
        }
        if (!year || !abrev) {
            Swal.fire({ icon: 'error', title: 'Missing data', text: 'Fill Year and Client Abbreviation.', confirmButtonColor: '#e30613' });
            return;
        }

        const codigosInternos = [];
        todasLasPosiciones.forEach(pos => {
            if (pos.cantidad > 0) codigosInternos.push({ codigo: `${proyectoCompleto}-${year}-${abrev}-${pos.abreviatura}`, cantidad: pos.cantidad, posicion: pos.abreviatura });
        });
        piezaData.abreviatura = abrev; piezaData.year = year;
        piezaData.posiciones = todasLasPosiciones.filter(p => parseInt(p.cantidad) > 0);
        piezaData.codigosInternos = codigosInternos;
        piezaData.codigoInterno = codigosInternos[0]?.codigo || '';
    }

    // Guardar en el Locker (Local)
    if (!inventarioLockers[key]) inventarioLockers[key] = [];
    const piezaAnterior = (index !== "" && inventarioLockers[key][parseInt(index)]) ? inventarioLockers[key][parseInt(index)] : null;
    if (index === "") inventarioLockers[key].push(piezaData);
    else inventarioLockers[key][parseInt(index)] = piezaData;

    await db.collection("lockers").doc(key).set({ items: inventarioLockers[key] });
    await registrarModificacion('LOCKER', index === "" ? 'CREAR' : 'EDITAR', index === "" ? `Fixture "${piezaData.nombre}" added` : `Fixture "${piezaData.nombre}" edited`, piezaAnterior, piezaData, 'lockers', key);

    // Guardar en la Lista Global (Si el usuario lo pidió)
    if (quiereAgregarGlobal) {
        const docIdGlobal = `FG_${Date.now()}`;
        const datosGlobal = {
            nombre: piezaData.nombre,
            cliente: piezaData.cliente,
            pais: document.getElementById('gl-pais').value.trim(),
            planta: document.getElementById('gl-planta').value.trim(),
            ubicacion: document.getElementById('gl-ubicacion').value.trim(),
            proyecto: proyectoCompleto,
            estado: piezaData.estado,
            desc: piezaData.desc,
            contactoNombre: document.getElementById('gl-contacto-nombre').value.trim(),
            contactoInfo: document.getElementById('gl-contacto-info').value.trim(),
            foto: piezaData.foto,
            ultimaActualizacion: new Date().toISOString(),
            actualizadoPor: usuarioActual || 'Anonymous',
            origen: `Locker ${lockerId} - Div ${divNum}`
        };
        
        await db.collection("lista_fixtures_global").doc(docIdGlobal).set(datosGlobal);
        await registrarModificacion('FIXTURE_GLOBAL', 'CREAR', `Fixture "${piezaData.nombre}" also added to Global List`, null, datosGlobal, 'lista_fixtures_global', docIdGlobal);
    }

    closeModal('modal-editar-pieza');
    Toast.fire({ icon: 'success', title: 'Fixture saved successfully' });
    openLockerDetail(lockerId);
}

async function deleteLockerPiece(lockerId, divNum, index) {
    const res = await Swal.fire({
        title: 'Delete fixture?', text: "This element will be removed from the locker.",
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, delete', cancelButtonText: 'Cancel'
    });

    if (res.isConfirmed) {
        const key = `${lockerId}-${divNum}`;
        if (inventarioLockers[key]) {
            const piezaEliminada = inventarioLockers[key][index];
            inventarioLockers[key].splice(index, 1);
            await db.collection("lockers").doc(key).set({ items: inventarioLockers[key] });
            await registrarModificacion('LOCKER', 'ELIMINAR', `Fixture "${piezaEliminada.nombre}" removed from compartment ${divNum} (locker ${lockerId})`, piezaEliminada, null, 'lockers', key);
            Toast.fire({ icon: 'success', title: 'Fixture deleted' });
            openLockerDetail(lockerId);
        }
    }
}

function enlargePhoto(src) {
    document.getElementById('foto-ampliada-src').src = src;
    openModal('modal-visor-foto');
}

// =============================================================
// SELECTOR DE ESTADO (para fixtures y coupons)
// =============================================================
async function openEstadoSelector(tipo, contenedorId, nivelIdx, piezaIdx, event) {
    if (event) event.stopPropagation();
    
    const key = `${contenedorId}-${nivelIdx}`;
    const lista = tipo === 'locker' ? inventarioLockers[key] : inventarioRacks[key];
    if (!lista || !lista[piezaIdx]) return;
    
    const pieza = lista[piezaIdx];
    const estadoActual = pieza.estado || 'Available';
    
    const opciones = {};
    for (const keyE in ESTADOS_DISPONIBLES) {
        opciones[keyE] = `${ESTADOS_DISPONIBLES[keyE].emoji} ${ESTADOS_DISPONIBLES[keyE].label}`;
    }
    
    const { value: nuevoEstado } = await Swal.fire({
        title: 'Change Status',
        input: 'select',
        inputOptions: opciones,
        inputValue: estadoActual,
        showCancelButton: true,
        confirmButtonText: 'Save',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#e30613'
    });
    
    if (!nuevoEstado || nuevoEstado === estadoActual) return;
    
    const estadoAnterior = pieza.estado || 'Available';
    pieza.estado = nuevoEstado;
    
    try {
        const coleccion = tipo === 'locker' ? 'lockers' : 'racks';
        await db.collection(coleccion).doc(key).set({ items: lista });
        
        // Actualizar en lista global si existe
        await syncEstadoConGlobal(tipo, pieza);
        
        await registrarModificacion(
            tipo.toUpperCase(),
            'EDITAR',
            `Status of "${pieza.nombre}" changed from ${estadoAnterior} to ${nuevoEstado}`,
            { estado: estadoAnterior },
            { estado: nuevoEstado },
            coleccion,
            key
        );
        
        Toast.fire({ icon: 'success', title: `Status updated to ${nuevoEstado}` });
        
        // Recargar la vista
        if (tipo === 'locker') openLockerDetail(contenedorId);
        else openRackDetail(contenedorId);
        
    } catch (error) {
        console.error(error);
        pieza.estado = estadoAnterior;
        Swal.fire({ icon: 'error', title: 'Error', text: 'Could not update status.' });
    }
}

async function syncEstadoConGlobal(tipo, pieza) {
    // Buscar en la lista global por nombre + cliente + código interno
    const codigoInterno = pieza.codigoInterno || (pieza.codigosInternos && pieza.codigosInternos[0]?.codigo) || '';
    
    const globalItem = listaFixturesGlobales.find(f => 
        f.nombre === pieza.nombre && 
        f.cliente === pieza.cliente &&
        (codigoInterno === '' || f.codigoInterno === codigoInterno)
    );
    
    if (globalItem) {
        try {
            await db.collection("lista_fixtures_global").doc(globalItem.firestoreId).update({
                estado: pieza.estado
            });
            console.log(`🔄 Estado sincronizado con lista global: ${pieza.nombre}`);
        } catch (e) {
            console.warn("No se pudo sincronizar estado con la lista global:", e);
        }
    }
}

// =============================================================
// RENAME LEVELS
// =============================================================
function openRenameLevelsModal(tipo) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Access denied', text: 'Only administrators can rename levels.', confirmButtonColor: '#e30613' });
        return;
    }
    
    // Leer el ID desde el data-attribute del título
    const tituloEl = tipo === 'locker'
        ? document.getElementById('titulo-modal-locker-detalle')
        : document.getElementById('titulo-modal-rack-detalle');
    
    const id = tituloEl ? tituloEl.dataset.id : null;
    
    if (!id) {
        Swal.fire({ icon: 'error', title: 'Error', text: 'Could not identify the item.', confirmButtonColor: '#e30613' });
        return;
    }
    
    const item = tipo === 'locker' 
        ? listaEstructuraLockers.find(l => l.id === id)
        : listaEstructuraRacks.find(r => r.id === id);
    
    if (!item) {
        Swal.fire({ icon: 'error', title: 'Error', text: 'Item not found.', confirmButtonColor: '#e30613' });
        return;
    }
    
    document.getElementById('rename-tipo').value = tipo;
    document.getElementById('rename-id').value = id;
    document.getElementById('titulo-modal-renombrar-niveles').textContent = `Rename ${tipo === 'locker' ? 'Compartments' : 'Levels'} - ${item.nombre}`;
    
    const container = document.getElementById('rename-inputs-container');
    container.innerHTML = '';
    
    const nombresActuales = item.nombresNiveles || {};
    const defaultLabel = tipo === 'locker' ? 'Compartment' : 'Level';
    
    for (let i = 1; i <= item.niveles; i++) {
        const row = document.createElement('div');
        row.style.cssText = "display: flex; align-items: center; gap: 10px;";
        row.innerHTML = `
            <span style="font-size: 12px; color: #6c757d; min-width: 110px; font-weight: 600;">${defaultLabel} ${i}:</span>
            <input type="text" data-nivel="${i}" placeholder="${defaultLabel} ${i} (default)" value="${nombresActuales[i] || ''}" maxlength="40" style="flex: 1; padding: 8px 12px; border-radius: 6px; border: 1px solid #ced4da; background: #f8f9fa; font-size: 13px;">
        `;
        container.appendChild(row);
    }
    
    // 🔑 CLAVE: Como el modal está DENTRO del modal de detalle, no podemos usar openModal simple
    // Verificamos si está abierto el modal de detalle y NO cerramos nada
    const modal = document.getElementById('modal-renombrar-niveles');
    modal.style.display = 'block';
    modal.style.zIndex = '10001';
    
    // 🚫 NO cerramos el modal de detalle, así el usuario puede cancelar y volver
    // Solo elevamos el z-index del modal Rename para que aparezca al frente
}

async function saveRenameLevels(event) {
    event.preventDefault();
    const tipo = document.getElementById('rename-tipo').value;
    const id = document.getElementById('rename-id').value;
    const container = document.getElementById('rename-inputs-container');
    
    const nombresNiveles = {};
    container.querySelectorAll('input[data-nivel]').forEach(inp => {
        const nivel = parseInt(inp.dataset.nivel);
        const valor = (inp.value || '').trim();
        if (valor) nombresNiveles[nivel] = valor;
    });
    
    const coleccion = tipo === 'locker' ? 'config_lockers' : 'config_racks';
    const itemAnterior = tipo === 'locker' 
        ? listaEstructuraLockers.find(l => l.id === id)
        : listaEstructuraRacks.find(r => r.id === id);
    
    try {
        await db.collection(coleccion).doc(id).update({ nombresNiveles });
        
        await registrarModificacion(
            tipo.toUpperCase(),
            'EDITAR',
            `Levels of "${itemAnterior?.nombre || id}" renamed`,
            { nombresNiveles: itemAnterior?.nombresNiveles || {} },
            { nombresNiveles },
            coleccion,
            id
        );
        
        // 🔑 CLAVE: Actualizar el item local inmediatamente para no esperar el listener
        if (itemAnterior) {
            itemAnterior.nombresNiveles = nombresNiveles;
        }
        
        closeModal('modal-renombrar-niveles');
        Toast.fire({ icon: 'success', title: 'Level names saved' });
        
        // Recargar la vista del detalle (sin cerrar y reabrir)
        if (tipo === 'locker') {
            // Regenerar el contenido del modal de detalle SIN cerrar el Rename
            const cont = document.getElementById('contenido-estantes-locker');
            if (cont) {
                cont.innerHTML = '';
                // Regenerar solo el contenido
                const locker = listaEstructuraLockers.find(l => l.id === id);
                if (locker) generarContenidoLockerDetail(locker, cont);
            }
        } else {
            const cont = document.getElementById('contenido-niveles-rack');
            if (cont) {
                cont.innerHTML = '';
                const rack = listaEstructuraRacks.find(r => r.id === id);
                if (rack) generarContenidoRackDetail(rack, cont);
            }
        }
        
    } catch (error) {
        console.error(error);
        Swal.fire({ icon: 'error', title: 'Error', text: 'Could not save level names.' });
    }
}

// =============================================================
// 2.B RACKS & COUPONS
// =============================================================
function generarTarjetasRacks() {
    const contenedor = document.getElementById('contenedor-racks');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    contenedor.style.display = "grid";
    contenedor.style.gridTemplateColumns = "repeat(auto-fill, minmax(180px, 1fr))";
    contenedor.style.gap = "15px";

    const esAdmin = rolActual === "SUPER_ADMIN" || rolActual === "ADMIN";

    if (listaEstructuraRacks.length === 0) {
        contenedor.innerHTML = `<p style="font-size: 13px; color: #6c757d; grid-column: 1/-1; text-align: center; padding: 20px;">No racks registered. ${esAdmin ? 'Use "+ Create New Rack" to add one.' : ''}</p>`;
        return;
    }

    listaEstructuraRacks.forEach((rack) => {
        let totalPiezas = 0;
        for (let d = 1; d <= rack.niveles; d++) {
            const key = `${rack.id}-${d}`;
            if (inventarioRacks[key]) totalPiezas += inventarioRacks[key].length;
        }

        const card = document.createElement('div');
        card.className = 'rack-card';

        if (rolActual === "SUPER_ADMIN") {
            card.setAttribute('draggable', 'true');
            card.dataset.id = rack.id;
            card.dataset.tipo = 'rack';
            card.ondragstart = handleDragStart;
            card.ondragover = handleDragOver;
            card.ondrop = handleDrop;
        }

        card.onclick = (e) => {
            if (e.target.closest('.rack-actions')) return;
            openRackDetail(rack.id);
        };

        const adminActions = esAdmin ? `
            <div class="rack-actions">
                <button onclick="openEditRackModal('${rack.id}')" title="Edit Rack">✏️</button>
                <button onclick="confirmDeleteRack('${rack.id}', '${rack.nombre}')" title="Delete Rack">&times;</button>
            </div>
        ` : '';

        card.innerHTML = `
            ${adminActions}
            <h3>${rack.nombre}</h3>
            <p class="rack-levels">${rack.niveles} Level(s)</p>
            <p class="rack-count">${totalPiezas} Coupon(s) stored</p>
        `;
        contenedor.appendChild(card);
    });
}

function openCreateRackModal() {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Insufficient permissions', text: 'Only administrators can create racks.', confirmButtonColor: '#e30613' });
        return;
    }
    document.getElementById('rack-id-editar').value = '';
    document.getElementById('titulo-modal-rack').textContent = 'Create New Rack';
    document.getElementById('rack-nombre-input').value = '';
    document.getElementById('rack-descripcion-input').value = '';
    document.getElementById('rack-niveles-input').value = '3';
    openModal('modal-nuevo-rack');
}

function openEditRackModal(id) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Insufficient permissions', text: 'Only administrators can edit racks.', confirmButtonColor: '#e30613' });
        return;
    }
    const rack = listaEstructuraRacks.find(r => r.id === id);
    if (!rack) return;

    document.getElementById('rack-id-editar').value = rack.id;
    document.getElementById('titulo-modal-rack').textContent = `Edit Rack: ${rack.nombre}`;
    document.getElementById('rack-nombre-input').value = rack.nombre;
    document.getElementById('rack-descripcion-input').value = rack.descripcion || '';
    document.getElementById('rack-niveles-input').value = rack.niveles || 3;
    openModal('modal-nuevo-rack');
}

async function saveRackStructure(event) {
    event.preventDefault();
    const idExistente = document.getElementById('rack-id-editar').value;
    const nombre = document.getElementById('rack-nombre-input').value.trim();
    const descripcion = document.getElementById('rack-descripcion-input').value.trim();
    const niveles = parseInt(document.getElementById('rack-niveles-input').value) || 3;
    const docId = idExistente ? idExistente : `R_${Date.now()}`;
    const rackAnterior = idExistente ? listaEstructuraRacks.find(r => r.id === idExistente) : null;

    const datosRack = { nombre, niveles, descripcion };

    await db.collection("config_racks").doc(docId).set(datosRack, { merge: true });

    await registrarModificacion(
        'RACK',
        idExistente ? 'EDITAR' : 'CREAR',
        idExistente ? `Rack "${nombre}" edited (${niveles} levels)` : `Rack "${nombre}" created (${niveles} levels)`,
        rackAnterior, datosRack, 'config_racks', docId
    );

    closeModal('modal-nuevo-rack');
    Toast.fire({ icon: 'success', title: idExistente ? 'Rack updated' : 'New rack created' });
}

async function confirmDeleteRack(id, nombre) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Insufficient permissions', text: 'Only administrators can delete racks.', confirmButtonColor: '#e30613' });
        return;
    }

    const res = await Swal.fire({
        title: `Delete "${nombre}"?`,
        text: "The rack will be removed. Its items will be kept in the database for safety.",
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, delete rack', cancelButtonText: 'Cancel'
    });

    if (res.isConfirmed) {
        const rackAnterior = listaEstructuraRacks.find(r => r.id === id);
        await db.collection("config_racks").doc(id).delete();
        await registrarModificacion('RACK', 'ELIMINAR', `Rack "${nombre}" deleted`, rackAnterior, null, 'config_racks', id);
        Toast.fire({ icon: 'success', title: 'Rack deleted' });
    }
}

function openRackDetail(rackId) {
    const rack = listaEstructuraRacks.find(r => r.id === rackId);
    if (!rack) return;

    const tituloEl = document.getElementById('titulo-modal-rack-detalle');
    tituloEl.textContent = `${rack.nombre} - Levels & Coupons`;
    tituloEl.dataset.id = rackId;
    
    const cont = document.getElementById('contenido-niveles-rack');
    cont.innerHTML = '';
    const esAdmin = rolActual === "SUPER_ADMIN" || rolActual === "ADMIN";

    const btnRename = document.getElementById('btn-renombrar-niveles-rack');
    if (btnRename) {
        btnRename.style.display = esAdmin ? 'inline-block' : 'none';
    }

    generarContenidoRackDetail(rack, cont);
    openModal('modal-rack-detalle');
}

function generarContenidoRackDetail(rack, cont) {
    const rackId = rack.id;
    const esAdmin = rolActual === "SUPER_ADMIN" || rolActual === "ADMIN";

    for (let d = 1; d <= rack.niveles; d++) {
        const key = `${rackId}-${d}`;
        const piezas = inventarioRacks[key] || [];
        const bloque = document.createElement('div');
        bloque.style.cssText = "background:#ffffff; border:1px solid #dee2e6; border-radius:8px; padding:15px; margin-bottom:15px;";

        let htmlPiezas = '';
        if (piezas.length === 0) {
            htmlPiezas = `<p style="font-size: 12px; color: #adb5bd; grid-column: 1/-1;">No coupons registered on this level.</p>`;
        } else {
            piezas.forEach((p, idx) => {
                const imgTag = p.foto ? `<img src="${p.foto}" style="width:70px; height:70px; object-fit:cover; border-radius:6px; cursor:pointer;" onclick="enlargePhoto('${p.foto}')" title="Click to enlarge">` : '';
                const esCreador = p.creadoPor === usuarioActual;
                const puedeEditar = esAdmin || esCreador;
                
                const btnAcciones = puedeEditar ? `
                    <div style="display:flex; gap:4px; margin-top:8px;">
                        <button class="btn-editar-pieza" style="background:#e9ecef; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="openEditRackPieceModal('${rackId}', ${d}, ${idx})" title="Edit Coupon">✏️</button>
                        ${esAdmin ? `<button class="btn-borrar-pieza" style="background:#fff3cd; border:none; color:#e30613; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:bold;" onclick="deleteRackPiece('${rackId}', ${d}, ${idx})" title="Delete">&times;</button>` : ''}
                    </div>
                ` : '';

                const fixtureJSON = JSON.stringify(p).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                const estadoInfo = ESTADOS_DISPONIBLES[p.estado] || ESTADOS_DISPONIBLES['Available'];
                const estadoBadge = `<button onclick="openEstadoSelector('rack', '${rackId}', ${d}, ${idx}, event)" style="background: ${estadoInfo.color}; color: white; border: none; padding: 2px 10px; border-radius: 12px; font-size: 10px; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin-bottom: 6px;">${estadoInfo.emoji} ${estadoInfo.label} ▾</button>`;

                let codigosHTML = '';
                if (p.codigosInternos && p.codigosInternos.length > 0) {
                    codigosHTML = '<div style="margin: 6px 0; display: flex; flex-direction: column; gap: 3px;">';
                    p.codigosInternos.forEach(cod => {
                        codigosHTML += `<span style="font-family: monospace; font-size: 11px; color: #e30613; font-weight: bold; background: #fff5f5; padding: 3px 8px; border-radius: 4px; border: 1px solid #ffc9c9; display: inline-block; width: fit-content;">🔢 ${cod.codigo} <span style="color: #495057; font-weight: normal;">→ Quantity: ${cod.cantidad}</span></span>`;
                    });
                    codigosHTML += '</div>';
                }

                let posicionesHTML = '';
                if (p.posiciones && p.posiciones.length > 0) {
                    posicionesHTML = '<div style="margin: 6px 0; display: flex; flex-wrap: wrap; gap: 4px;">';
                    p.posiciones.forEach(pos => {
                        posicionesHTML += `<span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; font-size: 10px; color: #495057;"><strong>${pos.abreviatura}</strong>: ${pos.cantidad}</span>`;
                    });
                    posicionesHTML += '</div>';
                }

                htmlPiezas += `
                    <div style="background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; padding:12px; display:flex; gap:12px; align-items:flex-start; position:relative;">
                        ${imgTag}
                        <div style="flex:1;">
                            ${estadoBadge}
                            <h5 style="margin:0 0 5px 0; font-size:14px; color:#1a1d20;">${p.nombre}</h5>
                            <p style="margin:0; font-size:11px; color:#495057;"><strong>Client:</strong> ${p.cliente || 'N/A'}</p>
                            <p style="margin:0; font-size:11px; color:#495057;"><strong>Project:</strong> ${p.proyecto || 'N/A'}</p>
                            <p style="margin:0; font-size:11px; color:#495057;"><strong>Year:</strong> ${p.year || 'N/A'}</p>
                            ${codigosHTML}
                            ${posicionesHTML}
                            <button style="margin-top:6px; background:none; border:none; color:#e30613; font-size:11px; font-weight:bold; padding:0; cursor:pointer; text-decoration:underline;" onclick='viewFullFixtureDetail(${fixtureJSON})'>View more / Details</button>
                            ${btnAcciones}
                        </div>
                    </div>
                `;
            });
        }

        const btnAgregar = usuarioActual ? `<button class="btn-huf-secundario" style="font-size: 11px; padding: 4px 8px;" onclick="openAddRackPieceModal('${rackId}', ${d})">+ Add Coupon</button>` : '';
        const nombreNivel = (rack.nombresNiveles && rack.nombresNiveles[d]) ? rack.nombresNiveles[d] : `Level ${d}`;

        bloque.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #f1f3f5; padding-bottom:8px; margin-bottom:12px;">
                <h4 style="margin:0; font-size:14px; color:#343a40;">${nombreNivel}</h4>
                ${btnAgregar}
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:12px;">
                ${htmlPiezas}
            </div>
        `;
        cont.appendChild(bloque);
    }
}

function autoFillRackAbbreviation() {
    const clientName = document.getElementById('rack-pieza-cliente').value;
    const client = listaClientesFirebase.find(c => c.nombre === clientName);
    const abrevField = document.getElementById('rack-pieza-abrev');
    if (abrevField) {
        abrevField.value = client && client.abreviatura ? client.abreviatura : '';
    }
    updateRackInternalCodes();
}

function updateRackInternalCodes() {
    const p1 = document.getElementById('rack-proj-part1').value.trim();
    const p2 = document.getElementById('rack-proj-part2').value.trim();
    const year = document.getElementById('rack-pieza-year').value.trim();
    const abrev = document.getElementById('rack-pieza-abrev').value.trim();

    const contenedorCodigos = document.getElementById('contenedor-codigos-rack');
    if (!contenedorCodigos) return;

    const contenedor = document.getElementById('contenedor-posiciones-rack');
    const posiciones = [];
    const abreviaturasVistas = {};
    let hayDuplicados = false;

    if (contenedor) {
        Array.from(contenedor.children).forEach(div => {
            const inputAbrev = div.querySelector('.pos-abrev');
            const inputCant = div.querySelector('.pos-cant');
            if (!inputAbrev || !inputCant) return;

            const a = (inputAbrev.value || '').trim().toUpperCase();
            const c = parseInt(inputCant.value) || 0;

            if (a) {
                if (abreviaturasVistas[a]) {
                    hayDuplicados = true;
                    inputAbrev.style.borderColor = '#e30613';
                    inputAbrev.style.backgroundColor = '#fff5f5';
                } else {
                    inputAbrev.style.borderColor = '#ced4da';
                    inputAbrev.style.backgroundColor = '#f8f9fa';
                    abreviaturasVistas[a] = true;
                }
            } else {
                inputAbrev.style.borderColor = '#ced4da';
                inputAbrev.style.backgroundColor = '#f8f9fa';
            }

            if (a) posiciones.push({ abreviatura: a, cantidad: c });
        });
    }

    if (hayDuplicados) {
        contenedorCodigos.innerHTML = '<input type="text" readonly value="⚠️ Duplicate position abbreviations detected. Each position must be unique." style="background-color: #fff3cd; color: #856404; font-family: monospace; letter-spacing: 1px; padding: 6px 10px; border: 1px solid #ffeeba; border-radius: 5px; font-size: 12px; width: 100%;">';
        return;
    }

    if (p1 && p2 && year && abrev && posiciones.length > 0) {
        let htmlCodigos = '';
        let hayAlguno = false;
        posiciones.forEach(pos => {
            if (pos.cantidad > 0) {
                hayAlguno = true;
                const codigo = `${p1}.${p2}-${year}-${abrev}-${pos.abreviatura}`;
                htmlCodigos += `<input type="text" readonly value="${codigo}  →  Quantity: ${pos.cantidad}" style="background-color: #fff5f5; font-weight: bold; color: #e30613; font-family: monospace; letter-spacing: 1px; margin-bottom: 4px; padding: 6px 10px; border: 1px solid #ced4da; border-radius: 5px; font-size: 12px;">`;
            }
        });
        if (hayAlguno) {
            contenedorCodigos.innerHTML = htmlCodigos;
        } else {
            contenedorCodigos.innerHTML = '<input type="text" readonly value="Add at least one position with quantity > 0" style="background-color: #fff5f5; color: #6c757d; font-family: monospace; letter-spacing: 1px; padding: 6px 10px; border: 1px solid #ced4da; border-radius: 5px; font-size: 12px;">';
        }
    } else {
        contenedorCodigos.innerHTML = '<input type="text" readonly value="Fill all fields (project, year, client) to generate codes" style="background-color: #fff5f5; color: #6c757d; font-family: monospace; letter-spacing: 1px; padding: 6px 10px; border: 1px solid #ced4da; border-radius: 5px; font-size: 12px;">';
    }
}

function agregarPosicionRack(abreviatura = '', cantidad = 0, id = null) {
    contadorPosicionesRack++;
    const posId = id || `pos_${contadorPosicionesRack}`;
    const contenedor = document.getElementById('contenedor-posiciones-rack');
    if (!contenedor) return;

    const div = document.createElement('div');
    div.id = posId;
    div.style.cssText = "display: flex; gap: 8px; align-items: center; background: #ffffff; padding: 8px 10px; border-radius: 6px; border: 1px solid #dee2e6;";

    div.innerHTML = `
        <input type="text" class="pos-abrev" placeholder="Abrev. (ej: FL)" value="${abreviatura}" maxlength="5" style="width: 100px; padding: 6px 8px; border-radius: 4px; border: 1px solid #ced4da; background: #f8f9fa; font-size: 12px; text-transform: uppercase;" onkeyup="updateRackInternalCodes()" onchange="updateRackInternalCodes()">
        <input type="number" class="pos-cant" placeholder="Cant." value="${cantidad}" min="0" style="width: 80px; padding: 6px 8px; border-radius: 4px; border: 1px solid #ced4da; background: #f8f9fa; font-size: 12px;" onkeyup="updateRackInternalCodes()" onchange="updateRackInternalCodes()">
        <button type="button" onclick="eliminarPosicionRack('${posId}')" style="background: #fff5f5; border: 1px solid #ffc9c9; color: #e30613; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;">&times;</button>
    `;

    contenedor.appendChild(div);
    updateRackInternalCodes();
}

function eliminarPosicionRack(posId) {
    const div = document.getElementById(posId);
    if (div) {
        div.remove();
        updateRackInternalCodes();
    }
}

function cargarPosicionesRack(posiciones) {
    const contenedor = document.getElementById('contenedor-posiciones-rack');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    contadorPosicionesRack = 0;
    
    if (posiciones && posiciones.length > 0) {
        posiciones.forEach((pos, idx) => {
            contadorPosicionesRack++;
            const posId = `pos_${contadorPosicionesRack}`;
            const div = document.createElement('div');
            div.id = posId;
            div.style.cssText = "display: flex; gap: 8px; align-items: center; background: #ffffff; padding: 8px 10px; border-radius: 6px; border: 1px solid #dee2e6;";
            div.innerHTML = `
                <input type="text" class="pos-abrev" placeholder="Abrev. (ej: FL)" value="${pos.abreviatura || ''}" maxlength="5" style="width: 100px; padding: 6px 8px; border-radius: 4px; border: 1px solid #ced4da; background: #f8f9fa; font-size: 12px; text-transform: uppercase;" onkeyup="updateRackInternalCodes()" onchange="updateRackInternalCodes()">
                <input type="number" class="pos-cant" placeholder="Cant." value="${pos.cantidad || 0}" min="0" style="width: 80px; padding: 6px 8px; border-radius: 4px; border: 1px solid #ced4da; background: #f8f9fa; font-size: 12px;" onkeyup="updateRackInternalCodes()" onchange="updateRackInternalCodes()">
                <button type="button" onclick="eliminarPosicionRack('${posId}')" style="background: #fff5f5; border: 1px solid #ffc9c9; color: #e30613; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;">&times;</button>
            `;
            contenedor.appendChild(div);
        });
    } else {
        agregarPosicionRack('FL', 0);
        agregarPosicionRack('FR', 0);
        agregarPosicionRack('RL', 0);
        agregarPosicionRack('RR', 0);
    }
    updateRackInternalCodes();
}

function openAddRackPieceModal(rackId, nivelNum) {
    document.getElementById('rack-pieza-rack-id').value = rackId;
    document.getElementById('rack-pieza-nivel-id').value = nivelNum;
    document.getElementById('rack-pieza-index').value = '';
    document.getElementById('titulo-modal-pieza-rack').textContent = `Add Coupon (Level ${nivelNum})`;
    document.getElementById('rack-pieza-nombre').value = '';
    document.getElementById('rack-pieza-cliente').value = '';
    document.getElementById('rack-pieza-abrev').value = '';
    document.getElementById('rack-pieza-year').value = new Date().getFullYear();
    document.getElementById('rack-proj-part1').value = '';
    document.getElementById('rack-proj-part2').value = '';
    document.getElementById('rack-pieza-proyecto').value = '';
    document.getElementById('rack-pieza-desc').value = '';
    document.getElementById('rack-pieza-foto-file').value = '';
    document.getElementById('rack-pieza-foto-base64').value = '';
    document.getElementById('rack-preview-foto-miniatura').style.display = 'none';
    const checkCouponGlobal = document.getElementById('check-agregar-coupon-global');
    if (checkCouponGlobal) checkCouponGlobal.checked = false;

    cargarPosicionesRack(null);

    poblarSelectClientes();
    closeModal('modal-rack-detalle');
    openModal('modal-editar-pieza-rack');
}

function openEditRackPieceModal(rackId, nivelNum, index) {
    const key = `${rackId}-${nivelNum}`;
    const pieza = inventarioRacks[key][index];
    if (!pieza) return;
    poblarSelectClientes();

    document.getElementById('rack-pieza-rack-id').value = rackId;
    document.getElementById('rack-pieza-nivel-id').value = nivelNum;
    document.getElementById('rack-pieza-index').value = index;
    document.getElementById('titulo-modal-pieza-rack').textContent = `Edit Coupon: ${pieza.nombre}`;
    document.getElementById('rack-pieza-nombre').value = pieza.nombre || '';
    document.getElementById('rack-pieza-cliente').value = pieza.cliente || '';
    document.getElementById('rack-pieza-abrev').value = pieza.abreviatura || '';
    document.getElementById('rack-pieza-year').value = pieza.year || new Date().getFullYear();

    if (pieza.proyecto && pieza.proyecto.includes('.')) {
        const partes = pieza.proyecto.split('.');
        document.getElementById('rack-proj-part1').value = partes[0] || '';
        document.getElementById('rack-proj-part2').value = partes[1] || '';
    } else {
        document.getElementById('rack-proj-part1').value = '';
        document.getElementById('rack-proj-part2').value = '';
    }

    document.getElementById('rack-pieza-desc').value = pieza.desc || '';
    document.getElementById('rack-pieza-foto-base64').value = pieza.foto || '';

    cargarPosicionesRack(pieza.posiciones || null);

    if (pieza.foto) {
        document.getElementById('rack-img-pieza-miniatura-prev').src = pieza.foto;
        document.getElementById('rack-preview-foto-miniatura').style.display = 'block';
    } else {
        document.getElementById('rack-preview-foto-miniatura').style.display = 'none';
    }

    const checkCouponGlobal = document.getElementById('check-agregar-coupon-global');
    if (checkCouponGlobal) checkCouponGlobal.checked = false;

    closeModal('modal-rack-detalle');
    openModal('modal-editar-pieza-rack');
}

async function convertRackImageToBase64(input) {
    const file = input.files[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
        Swal.fire({
            icon: 'error',
            title: 'Image too large',
            text: 'Please select an image smaller than 10 MB.',
            confirmButtonColor: '#e30613'
        });
        input.value = '';
        return;
    }
    
    try {
        Toast.fire({ icon: 'info', title: 'Compressing image...' });
        const base64Comprimido = await comprimirImagen(file, 600, 600, 0.55);
        document.getElementById('rack-pieza-foto-base64').value = base64Comprimido;
        document.getElementById('rack-img-pieza-miniatura-prev').src = base64Comprimido;
        document.getElementById('rack-preview-foto-miniatura').style.display = 'block';
        Toast.fire({ icon: 'success', title: 'Image ready' });
    } catch (error) {
        console.error("Error compressing image:", error);
        Swal.fire({ icon: 'error', title: 'Error', text: 'Could not process the image.' });
    }
}

async function saveRackPiece(event) {
    event.preventDefault();
    const rackId = document.getElementById('rack-pieza-rack-id').value;
    const nivelNum = document.getElementById('rack-pieza-nivel-id').value;
    const index = document.getElementById('rack-pieza-index').value;
    const key = `${rackId}-${nivelNum}`;

    const part1 = document.getElementById('rack-proj-part1').value.trim();
    const part2 = document.getElementById('rack-proj-part2').value.trim();
    const proyectoCompleto = (part1 && part2) ? `${part1}.${part2}` : '';

    const year = parseInt(document.getElementById('rack-pieza-year').value) || null;
    const abrev = document.getElementById('rack-pieza-abrev').value.trim().toUpperCase();

    const contenedor = document.getElementById('contenedor-posiciones-rack');
    const todasLasPosiciones = [];
    if (contenedor) {
        Array.from(contenedor.children).forEach(div => {
            const inputAbrev = div.querySelector('.pos-abrev');
            const inputCant = div.querySelector('.pos-cant');
            if (inputAbrev && inputCant) {
                const a = (inputAbrev.value || '').trim().toUpperCase();
                const c = parseInt(inputCant.value) || 0;
                if (a) todasLasPosiciones.push({ abreviatura: a, cantidad: c });
            }
        });
    }

    const totalCantidad = todasLasPosiciones.reduce((sum, pos) => sum + (parseInt(pos.cantidad) || 0), 0);
    if (totalCantidad <= 0) {
        Swal.fire({
            icon: 'error',
            title: 'Missing quantities',
            text: 'Please fill at least one position with a quantity greater than 0.',
            confirmButtonColor: '#e30613'
        });
        return;
    }
    
    const abrevsVistas = {};
    const duplicadas = [];
    todasLasPosiciones.forEach(pos => {
        if (abrevsVistas[pos.abreviatura]) {
            if (!duplicadas.includes(pos.abreviatura)) duplicadas.push(pos.abreviatura);
        } else {
            abrevsVistas[pos.abreviatura] = true;
        }
    });
    if (duplicadas.length > 0) {
        Swal.fire({
            icon: 'error',
            title: 'Duplicate position abbreviations',
            html: `The following position abbreviation(s) are duplicated:<br><strong style="color:#e30613;">${duplicadas.join(', ')}</strong><br><br>Each position must have a unique abbreviation.`,
            confirmButtonColor: '#e30613'
        });
        return;
    }

    if (!proyectoCompleto || !year || !abrev) {
        Swal.fire({
            icon: 'error',
            title: 'Missing data',
            text: 'Please fill Project Number, Year and Client Abbreviation to generate the internal codes.',
            confirmButtonColor: '#e30613'
        });
        return;
    }

    const codigosInternos = [];
    todasLasPosiciones.forEach(pos => {
        if (pos.cantidad > 0) {
            codigosInternos.push({
                codigo: `${proyectoCompleto}-${year}-${abrev}-${pos.abreviatura}`,
                cantidad: pos.cantidad,
                posicion: pos.abreviatura
            });
        }
    });

    const esNuevo = (index === "");
    const estadoActual = esNuevo ? 'Available' : (inventarioRacks[key][parseInt(index)]?.estado || 'Available');

    const piezaData = {
        nombre: document.getElementById('rack-pieza-nombre').value.trim(),
        cliente: document.getElementById('rack-pieza-cliente').value,
        abreviatura: abrev,
        year: year,
        proyecto: proyectoCompleto,
        posiciones: todasLasPosiciones.filter(p => parseInt(p.cantidad) > 0),
        codigosInternos: codigosInternos,
        codigoInterno: codigosInternos[0]?.codigo || '',
        desc: document.getElementById('rack-pieza-desc').value.trim(),
        foto: document.getElementById('rack-pieza-foto-base64').value || '',
        estado: estadoActual,
        creadoPor: usuarioActual // <-- AGREGA ESTA LÍNEA AQUÍ
    };

    if (!inventarioRacks[key]) inventarioRacks[key] = [];
    const piezaAnterior = (index !== "" && inventarioRacks[key][parseInt(index)]) ? inventarioRacks[key][parseInt(index)] : null;

    if (index === "") inventarioRacks[key].push(piezaData);
    else inventarioRacks[key][parseInt(index)] = piezaData;

    await db.collection("racks").doc(key).set({ items: inventarioRacks[key] });

    await registrarModificacion(
        'RACK',
        index === "" ? 'CREAR' : 'EDITAR',
        index === ""
            ? `Coupon "${piezaData.nombre}" added to rack ${rackId} (Level ${nivelNum}) - Codes: ${codigosInternos.map(c => c.codigo).join(', ')}`
            : `Coupon "${piezaData.nombre}" edited in rack ${rackId} (Level ${nivelNum}) - Codes: ${codigosInternos.map(c => c.codigo).join(', ')}`,
        piezaAnterior, piezaData, 'racks', key
    );

    const checkCouponGlobal = document.getElementById('check-agregar-coupon-global');
    const quiereAgregarGlobal = checkCouponGlobal && checkCouponGlobal.checked;

    closeModal('modal-editar-pieza-rack');
    Toast.fire({ icon: 'success', title: 'Coupon saved successfully' });
    openRackDetail(rackId);

    if (quiereAgregarGlobal) {
        setTimeout(() => {
            openNewGlobalFixtureFromCoupon(piezaData, rackId, nivelNum);
        }, 400);
    }
}

async function deleteRackPiece(rackId, nivelNum, index) {
    const res = await Swal.fire({
        title: 'Delete coupon?', text: "This element will be removed from the rack.",
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, delete', cancelButtonText: 'Cancel'
    });

    if (res.isConfirmed) {
        const key = `${rackId}-${nivelNum}`;
        if (inventarioRacks[key]) {
            const piezaEliminada = inventarioRacks[key][index];
            inventarioRacks[key].splice(index, 1);
            await db.collection("racks").doc(key).set({ items: inventarioRacks[key] });
            await registrarModificacion('RACK', 'ELIMINAR', `Coupon "${piezaEliminada.nombre}" removed from rack ${rackId} (Level ${nivelNum})`, piezaEliminada, null, 'racks', key);
            Toast.fire({ icon: 'success', title: 'Coupon deleted' });
            openRackDetail(rackId);
        }
    }
}

function searchRacks(event) {
    event.preventDefault();
    const termino = document.getElementById('buscar-rack').value.toLowerCase().trim();
    if (!termino) return;
    let resultados = [];

    listaEstructuraRacks.forEach(rack => {
        for (let d = 1; d <= rack.niveles; d++) {
            const key = `${rack.id}-${d}`;
            const piezas = inventarioRacks[key] || [];
            piezas.forEach(p => {
                const textoCompleto = `${p.nombre} ${p.cliente} ${p.proyecto} ${p.desc} ${(p.codigosInternos || []).map(c => c.codigo).join(' ')}`.toLowerCase();
                if (textoCompleto.includes(termino)) {
                    resultados.push({ rackNombre: rack.nombre, rackId: rack.id, nivel: d, ...p });
                }
            });
        }
    });

    const contResultados = document.getElementById('contenedor-resultados-busqueda-racks');
    contResultados.innerHTML = '';

    if (resultados.length === 0) {
        contResultados.innerHTML = `<p style="font-size:13px; color:#6c757d; text-align:center; padding:15px;">No coupons found for "${termino}".</p>`;
    } else {
        resultados.forEach(r => {
            const item = document.createElement('div');
            item.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:12px; background:#f8f9fa; border:1px solid #dee2e6; border-radius:8px; margin-bottom:10px;";
            const codigosHTML = (r.codigosInternos || []).map(c => `<span style="font-family: monospace; font-size: 11px; color: #e30613; font-weight: bold;">${c.codigo} (${c.cantidad})</span>`).join('<br>');
            item.innerHTML = `
                <div>
                    <h5 style="margin:0 0 4px 0; color:#e30613; font-size:14px;">${r.nombre}</h5>
                    <p style="margin:0; font-size:12px; color:#495057;"><strong>Client:</strong> ${r.cliente || 'N/A'} | <strong>Project:</strong> ${r.proyecto || 'N/A'}</p>
                    ${codigosHTML ? `<div style="margin-top:4px;">${codigosHTML}</div>` : ''}
                </div>
                <div style="background:#1a1d20; color:#ffffff; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:bold; white-space:nowrap;">${r.rackNombre} - Level ${r.nivel}</div>
            `;
            contResultados.appendChild(item);
        });
    }
    openModal('modal-resultados-racks');
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
    const coloresTipo = { 'GABINETE': '#003366', 'LOCKER': '#e30613', 'RACK': '#862e9c', 'CLIENTE': '#2b8a3e', 'MATERIAL': '#856404', 'TICKET': '#6c757d', 'USUARIO': '#862e9c', 'FIXTURE_GLOBAL': '#0c8599' };
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
                if ((col === 'lockers' || col === 'racks') && Array.isArray(datosAntes)) {
                    await db.collection(col).doc(docId).set({ items: datosAntes });
                } else if ((col === 'gabinetes' || col === 'config_racks' || col === 'config_gabinetes' || col === 'config_lockers') && datosAntes.nombre !== undefined) {
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
    document.getElementById('fg-proj-part1').value = '';
    document.getElementById('fg-proj-part2').value = '';
    document.getElementById('fg-proyecto').value = '';
    document.getElementById('fg-estado').value = 'Available';
    document.getElementById('fg-desc').value = '';
    document.getElementById('fg-contacto-nombre').value = '';
    document.getElementById('fg-contacto-info').value = '';
    document.getElementById('fg-foto-file').value = '';
    document.getElementById('fg-foto-base64').value = '';
    document.getElementById('fg-preview-foto').style.display = 'none';
    
    // Ocultar sección de coupon
    const seccionCoupon = document.getElementById('fg-seccion-coupon');
    if (seccionCoupon) seccionCoupon.style.display = 'none';
    document.getElementById('fg-codigo-interno').value = '';
    document.getElementById('fg-coupon-year').value = '';
    document.getElementById('fg-coupon-posiciones').innerHTML = '';
    
    contextoFixtureGlobalDesdeLocker = null;
    contextoFixtureGlobalDesdeCoupon = null;
    openModal('modal-fixture-global');
}

function openNewGlobalFixtureFromLocker(piezaData, lockerId, divNum) {
    openNewGlobalFixtureModal();
    contextoFixtureGlobalDesdeLocker = { lockerId, divNum };
    const locker = listaEstructuraLockers.find(l => l.id === lockerId);
    const lockerNombre = locker ? locker.nombre : lockerId;

    document.getElementById('titulo-modal-fixture-global').textContent = `Add to Global List (from ${lockerNombre})`;
    document.getElementById('fg-nombre').value = piezaData.nombre || '';
    document.getElementById('fg-cliente').value = piezaData.cliente || '';
    document.getElementById('fg-ubicacion').value = piezaData.localidad || '';

    if (piezaData.proyecto && piezaData.proyecto.includes('.')) {
        const partes = piezaData.proyecto.split('.');
        document.getElementById('fg-proj-part1').value = partes[0] || '';
        document.getElementById('fg-proj-part2').value = partes[1] || '';
    }

    document.getElementById('fg-desc').value = piezaData.desc || '';
    document.getElementById('fg-foto-base64').value = piezaData.foto || '';

    if (piezaData.foto) {
        document.getElementById('fg-img-preview').src = piezaData.foto;
        document.getElementById('fg-preview-foto').style.display = 'block';
    }
}

function openNewGlobalFixtureFromCoupon(piezaData, rackId, nivelNum) {
    openNewGlobalFixtureModal();
    contextoFixtureGlobalDesdeCoupon = { rackId, nivelNum };
    const rack = listaEstructuraRacks.find(r => r.id === rackId);
    const rackNombre = rack ? rack.nombre : rackId;

    document.getElementById('titulo-modal-fixture-global').textContent = `Add Coupon to Global List (from ${rackNombre})`;
    
    // Prellenar datos básicos del coupon
    document.getElementById('fg-nombre').value = piezaData.nombre || '';
    document.getElementById('fg-cliente').value = piezaData.cliente || '';
    document.getElementById('fg-ubicacion').value = `${rackNombre} - Level ${nivelNum}`;

    if (piezaData.proyecto && piezaData.proyecto.includes('.')) {
        const partes = piezaData.proyecto.split('.');
        document.getElementById('fg-proj-part1').value = partes[0] || '';
        document.getElementById('fg-proj-part2').value = partes[1] || '';
    }

    document.getElementById('fg-desc').value = piezaData.desc || '';
    document.getElementById('fg-foto-base64').value = piezaData.foto || '';

    if (piezaData.foto) {
        document.getElementById('fg-img-preview').src = piezaData.foto;
        document.getElementById('fg-preview-foto').style.display = 'block';
    }

    // Mostrar y llenar la sección de coupon
    const seccionCoupon = document.getElementById('fg-seccion-coupon');
    if (seccionCoupon) {
        seccionCoupon.style.display = 'block';
        
        document.getElementById('fg-codigo-interno').value = piezaData.codigoInterno || '';
        document.getElementById('fg-coupon-year').value = piezaData.year || '';
        
        const posicionesContainer = document.getElementById('fg-coupon-posiciones');
        posicionesContainer.innerHTML = '';
        
        if (piezaData.posiciones && piezaData.posiciones.length > 0) {
            piezaData.posiciones.forEach(pos => {
                const badge = document.createElement('span');
                badge.style.cssText = "background: #862e9c; color: white; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold;";
                badge.textContent = `${pos.abreviatura}: ${pos.cantidad}`;
                posicionesContainer.appendChild(badge);
            });
        } else {
            posicionesContainer.innerHTML = '<span style="color: #6c757d; font-size: 12px;">No positions registered.</span>';
        }
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

    if (fx.proyecto && fx.proyecto.includes('.')) {
        const partes = fx.proyecto.split('.');
        document.getElementById('fg-proj-part1').value = partes[0] || '';
        document.getElementById('fg-proj-part2').value = partes[1] || '';
    } else {
        document.getElementById('fg-proj-part1').value = '';
        document.getElementById('fg-proj-part2').value = '';
    }

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

    // Manejar sección de coupon si existe
    const seccionCoupon = document.getElementById('fg-seccion-coupon');
    if (fx.codigoInterno && seccionCoupon) {
        seccionCoupon.style.display = 'block';
        document.getElementById('fg-codigo-interno').value = fx.codigoInterno || '';
        document.getElementById('fg-coupon-year').value = fx.year || '';
        
        const posicionesContainer = document.getElementById('fg-coupon-posiciones');
        posicionesContainer.innerHTML = '';
        
        if (fx.posiciones && fx.posiciones.length > 0) {
            fx.posiciones.forEach(pos => {
                const badge = document.createElement('span');
                badge.style.cssText = "background: #862e9c; color: white; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold;";
                badge.textContent = `${pos.abreviatura}: ${pos.cantidad}`;
                posicionesContainer.appendChild(badge);
            });
        }
    } else if (seccionCoupon) {
        seccionCoupon.style.display = 'none';
    }

    contextoFixtureGlobalDesdeLocker = null;
    contextoFixtureGlobalDesdeCoupon = null;
    openModal('modal-fixture-global');
}

async function convertGlobalFixtureImage(input) {
    const file = input.files[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
        Swal.fire({
            icon: 'error',
            title: 'Image too large',
            text: 'Please select an image smaller than 10 MB.',
            confirmButtonColor: '#e30613'
        });
        input.value = '';
        return;
    }
    
    try {
        Toast.fire({ icon: 'info', title: 'Compressing image...' });
        const base64Comprimido = await comprimirImagen(file, 800, 800, 0.6);
        document.getElementById('fg-foto-base64').value = base64Comprimido;
        document.getElementById('fg-img-preview').src = base64Comprimido;
        document.getElementById('fg-preview-foto').style.display = 'block';
        Toast.fire({ icon: 'success', title: 'Image ready' });
    } catch (error) {
        console.error("Error compressing image:", error);
        Swal.fire({ icon: 'error', title: 'Error', text: 'Could not process the image.' });
    }
}

async function saveGlobalFixture(event) {
    event.preventDefault();
    const idExistente = document.getElementById('fixture-global-id-editar').value;
    const docId = idExistente ? idExistente : `FG_${Date.now()}`;

    const part1 = document.getElementById('fg-proj-part1').value.trim();
    const part2 = document.getElementById('fg-proj-part2').value.trim();
    const proyectoCompleto = `${part1}.${part2}`;

    const datosFixture = {
        nombre: document.getElementById('fg-nombre').value.trim(),
        cliente: document.getElementById('fg-cliente').value,
        pais: document.getElementById('fg-pais').value.trim(),
        planta: document.getElementById('fg-planta').value.trim(),
        ubicacion: document.getElementById('fg-ubicacion').value.trim(),
        proyecto: proyectoCompleto,
        estado: document.getElementById('fg-estado').value,
        desc: document.getElementById('fg-desc').value.trim(),
        contactoNombre: document.getElementById('fg-contacto-nombre').value.trim(),
        contactoInfo: document.getElementById('fg-contacto-info').value.trim(),
        foto: document.getElementById('fg-foto-base64').value || '',
        ultimaActualizacion: new Date().toISOString(),
        actualizadoPor: usuarioActual || 'Anonymous'
    };

    // ... (aquí va el código de coupons que ya tienes) ...
    
    const fxAnterior = idExistente ? listaFixturesGlobales.find(f => f.firestoreId === idExistente) : null;

    await db.collection("lista_fixtures_global").doc(docId).set(datosFixture, { merge: true });

    // --- AQUÍ VIENE LA MAGIA: SI VENÍA DE UN LOCKER, LO GUARDAMOS TAMBIÉN ---
    if (window.datosPendientesLocker) {
        const context = window.datosPendientesLocker;
        const { lockerId, divNum, index, key, piezaData, estadoActual } = context;

        // Actualizamos los datos de la pieza con lo que se puso en el form Global
        piezaData.nombre = datosFixture.nombre;
        piezaData.cliente = datosFixture.cliente;
        piezaData.proyecto = datosFixture.proyecto;
        piezaData.desc = datosFixture.desc;
        
        // Si se llenó el proyecto, generamos el código interno si no lo tiene
        if (datosFixture.proyecto && datosFixture.proyecto.length > 3) {
            piezaData.codigoInterno = datosFixture.proyecto;
        }

        // Guardamos en el Locker AHORA
        if (!inventarioLockers[key]) inventarioLockers[key] = [];
        if (index === "") inventarioLockers[key].push(piezaData);
        else inventarioLockers[key][parseInt(index)] = piezaData;

        await db.collection("lockers").doc(key).set({ items: inventarioLockers[key] });
        
        // Limpiamos la variable
        window.datosPendientesLocker = null;
    }

    await registrarModificacion(
        'FIXTURE_GLOBAL',
        idExistente ? 'EDITAR' : 'CREAR',
        idExistente ? `Global fixture "${datosFixture.nombre}" edited` : `Fixture "${datosFixture.nombre}" added to Global List`,
        fxAnterior, datosFixture, 'lista_fixtures_global', docId
    );

    closeModal('modal-fixture-global');
    contextoFixtureGlobalDesdeLocker = null;
    contextoFixtureGlobalDesdeCoupon = null;
    Toast.fire({ icon: 'success', title: idExistente ? 'Global fixture updated' : 'Fixture added to global list' });
    
    // Refrescamos la vista del locker si estábamos ahí
    if (window.datosPendientesLocker === null && document.getElementById('modal-locker-detalle').style.display === 'block') {
        // Solo si estábamos en un locker, recargar la vista de fondo
        openLockerDetail(document.getElementById('pieza-locker-id').value);
    } else {
        // Recargar normal
        const lockerIdActivo = document.getElementById('titulo-modal-locker-detalle')?.dataset.id;
        if(lockerIdActivo) openLockerDetail(lockerIdActivo);
    }
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
            const textoCompleto = `${f.nombre} ${f.cliente} ${f.pais} ${f.planta} ${f.ubicacion} ${f.proyecto} ${f.desc} ${f.contactoNombre} ${f.contactoInfo} ${f.codigoInterno || ''}`.toLowerCase();
            return textoCompleto.includes(t);
        });
    }

    if (listaFiltrada.length === 0) {
        contenedor.innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
                <div style="font-size: 60px; margin-bottom: 15px;">📭</div>
                <p style="color: #6c757d; font-size: 16px;">${terminoBusquedaFixtureGlobal ? `No fixtures found for "${terminoBusquedaFixtureGlobal}".` : 'No fixtures registered in the global list yet.'}</p>
                ${!terminoBusquedaFixtureGlobal ? '<p style="color: #adb5bd; font-size: 13px; margin-top: 8px;">Use the "+ Add Fixture to List" or "+ Add Coupon" button.</p>' : ''}
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
            <span style="background: rgba(255,255,255,0.25); padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;">${grupos[cliente].length} item(s)</span>
        `;
        bloqueCliente.appendChild(headerCliente);

        const gridFixtures = document.createElement('div');
        gridFixtures.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 15px; padding: 18px; background: #f8f9fa; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef; border-top: none;";

        grupos[cliente].forEach((fx, fxIndex) => {
            const card = document.createElement('div');
            const estadoInfo = ESTADOS_DISPONIBLES[fx.estado] || ESTADOS_DISPONIBLES['Available'];
            const colorEstado = estadoInfo.color;
            const cardId = `fx-card-${cliente.replace(/\s+/g, '_')}-${fxIndex}`;

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

            const descTexto = fx.desc || '';
            const esLarga = descTexto.length > 150;
            const descHTML = descTexto
                ? `<div>
                    <p id="desc-${cardId}" class="desc-fixture-card">${descTexto}</p>
                    ${esLarga ? `<button class="btn-toggle-desc" onclick="toggleDescripcion('${cardId}', this)">Ver más ▾</button>` : ''}
                   </div>`
                : '';

            // Sección de códigos y coupons
            let codigosHTML = '';
            if (fx.codigoInterno || (fx.codigosInternos && fx.codigosInternos.length > 0)) {
                const codigos = fx.codigosInternos || (fx.codigoInterno ? [{ codigo: fx.codigoInterno, cantidad: null }] : []);
                codigosHTML = '<div style="margin-top: 8px;">';
                codigos.forEach(cod => {
                    codigosHTML += `<p style="margin: 2px 0; font-size: 11px; color: #862e9c; font-family: monospace; font-weight: bold; background: #f3e8ff; padding: 3px 8px; border-radius: 4px; display: inline-block;">🔢 ${cod.codigo}${cod.cantidad ? ` (x${cod.cantidad})` : ''}</p>`;
                });
                codigosHTML += '</div>';
            }

            let couponPosicionesHTML = '';
            if (fx.esCoupon && fx.posiciones && fx.posiciones.length > 0) {
                couponPosicionesHTML = `
                    <div style="margin-top: 8px; background: #f3e8ff; border: 1px solid #d0bfff; border-radius: 6px; padding: 8px 10px;">
                        <p style="margin: 0 0 6px 0; font-size: 11px; color: #862e9c; font-weight: bold;">🔢 Coupons</p>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                            ${fx.posiciones.map(pos => `<span style="background: #862e9c; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${pos.abreviatura}: ${pos.cantidad}</span>`).join('')}
                        </div>
                    </div>
                `;
            }

            card.innerHTML = `
                ${imgHTML}
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
                        <h4 style="margin: 0; font-size: 15px; color: #1a1d20; font-weight: 700;">${fx.nombre}</h4>
                        <span style="background: ${colorEstado}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold; white-space: nowrap;">${estadoInfo.emoji} ${estadoInfo.label}</span>
                    </div>
                    <p style="margin: 0; font-size: 12px; color: #495057;"><strong>🌍 Country:</strong> ${fx.pais || 'N/A'}</p>
                    <p style="margin: 2px 0 0 0; font-size: 12px; color: #495057;"><strong>🏭 Plant:</strong> ${fx.planta || 'N/A'}</p>
                    ${fx.ubicacion ? `<p style="margin: 2px 0 0 0; font-size: 12px; color: #495057;"><strong>📍 Location:</strong> ${fx.ubicacion}</p>` : ''}
                    ${fx.proyecto ? `<p style="margin: 2px 0 0 0; font-size: 12px; color: #495057;"><strong>🔢 Project:</strong> ${fx.proyecto}</p>` : ''}
                    ${origenHTML}
                    ${codigosHTML}
                    ${couponPosicionesHTML}
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

function toggleDescripcion(cardId, btn) {
    const desc = document.getElementById(`desc-${cardId}`);
    if (!desc) return;

    const expandida = desc.classList.toggle('expandida');

    if (expandida) {
        btn.textContent = 'Ver menos ▴';
    } else {
        btn.textContent = 'Ver más ▾';
        const card = btn.closest('div[style*="background: #ffffff"]');
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

// =============================================================
// LOCKER FIXTURE - MORE DATA OPTIONS (Year, Project, Positions, Codes)
// =============================================================
let contadorPosicionesLocker = 0;

function toggleLockerMoreOptions() {
    const check = document.getElementById('check-more-data-options');
    const seccion = document.getElementById('seccion-more-data-options');
    if (!check || !seccion) return;

    if (check.checked) {
        seccion.style.display = 'block';
        // Auto-generar posiciones por defecto si el contenedor está vacío
        const cont = document.getElementById('contenedor-posiciones-locker');
        if (cont && cont.children.length === 0) {
            agregarPosicionLocker('FL', 0);
            agregarPosicionLocker('FR', 0);
            agregarPosicionLocker('RL', 0);
            agregarPosicionLocker('RR', 0);
        }
        autoFillLockerAbbreviation();
        updateLockerInternalCodes();
    } else {
        seccion.style.display = 'none';
    }
}

function autoFillLockerAbbreviation() {
    const clientName = document.getElementById('input-pieza-cliente').value;
    const client = listaClientesFirebase.find(c => c.nombre === clientName);
    const abrevField = document.getElementById('pieza-abrev');
    if (abrevField) {
        abrevField.value = client && client.abreviatura ? client.abreviatura : '';
    }
    updateLockerInternalCodes();
}

function agregarPosicionLocker(abreviatura = '', cantidad = 0) {
    contadorPosicionesLocker++;
    const posId = `lk_pos_${contadorPosicionesLocker}`;
    const contenedor = document.getElementById('contenedor-posiciones-locker');
    if (!contenedor) return;

    const div = document.createElement('div');
    div.id = posId;
    div.style.cssText = "display: flex; gap: 8px; align-items: center; background: #ffffff; padding: 8px 10px; border-radius: 6px; border: 1px solid #dee2e6;";

    div.innerHTML = `
        <input type="text" class="lk-pos-abrev" placeholder="Abrev. (ej: FL)" value="${abreviatura}" maxlength="5" style="width: 100px; padding: 6px 8px; border-radius: 4px; border: 1px solid #ced4da; background: #f8f9fa; font-size: 12px; text-transform: uppercase;" onkeyup="updateLockerInternalCodes()" onchange="updateLockerInternalCodes()">
        <input type="number" class="lk-pos-cant" placeholder="Cant." value="${cantidad}" min="0" style="width: 80px; padding: 6px 8px; border-radius: 4px; border: 1px solid #ced4da; background: #f8f9fa; font-size: 12px;" onkeyup="updateLockerInternalCodes()" onchange="updateLockerInternalCodes()">
        <button type="button" onclick="eliminarPosicionLocker('${posId}')" style="background: #fff5f5; border: 1px solid #ffc9c9; color: #e30613; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;">&times;</button>
    `;

    contenedor.appendChild(div);
    updateLockerInternalCodes();
}

function eliminarPosicionLocker(posId) {
    const div = document.getElementById(posId);
    if (div) {
        div.remove();
        updateLockerInternalCodes();
    }
}

function cargarPosicionesLocker(posiciones) {
    const contenedor = document.getElementById('contenedor-posiciones-locker');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    contadorPosicionesLocker = 0;

    if (posiciones && posiciones.length > 0) {
        posiciones.forEach(pos => {
            contadorPosicionesLocker++;
            const posId = `lk_pos_${contadorPosicionesLocker}`;
            const div = document.createElement('div');
            div.id = posId;
            div.style.cssText = "display: flex; gap: 8px; align-items: center; background: #ffffff; padding: 8px 10px; border-radius: 6px; border: 1px solid #dee2e6;";
            div.innerHTML = `
                <input type="text" class="lk-pos-abrev" placeholder="Abrev. (ej: FL)" value="${pos.abreviatura || ''}" maxlength="5" style="width: 100px; padding: 6px 8px; border-radius: 4px; border: 1px solid #ced4da; background: #f8f9fa; font-size: 12px; text-transform: uppercase;" onkeyup="updateLockerInternalCodes()" onchange="updateLockerInternalCodes()">
                <input type="number" class="lk-pos-cant" placeholder="Cant." value="${pos.cantidad || 0}" min="0" style="width: 80px; padding: 6px 8px; border-radius: 4px; border: 1px solid #ced4da; background: #f8f9fa; font-size: 12px;" onkeyup="updateLockerInternalCodes()" onchange="updateLockerInternalCodes()">
                <button type="button" onclick="eliminarPosicionLocker('${posId}')" style="background: #fff5f5; border: 1px solid #ffc9c9; color: #e30613; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;">&times;</button>
            `;
            contenedor.appendChild(div);
        });
    }
    updateLockerInternalCodes();
}

function updateLockerInternalCodes() {
    const p1 = document.getElementById('pieza-proj-part1')?.value.trim() || '';
    const p2 = document.getElementById('pieza-proj-part2')?.value.trim() || '';
    const year = document.getElementById('pieza-year')?.value.trim() || '';
    const abrev = document.getElementById('pieza-abrev')?.value.trim() || '';

    const contenedorCodigos = document.getElementById('contenedor-codigos-locker');
    if (!contenedorCodigos) return;

    const contenedor = document.getElementById('contenedor-posiciones-locker');
    const posiciones = [];
    let hayDuplicados = false;
    const abreviaturasVistas = {};

    if (contenedor) {
        Array.from(contenedor.children).forEach(div => {
            const inputAbrev = div.querySelector('.lk-pos-abrev');
            const inputCant = div.querySelector('.lk-pos-cant');
            if (!inputAbrev || !inputCant) return;

            const a = (inputAbrev.value || '').trim().toUpperCase();
            const c = parseInt(inputCant.value) || 0;

            if (a) {
                if (abreviaturasVistas[a]) {
                    hayDuplicados = true;
                    inputAbrev.style.borderColor = '#e30613';
                    inputAbrev.style.backgroundColor = '#fff5f5';
                } else {
                    inputAbrev.style.borderColor = '#ced4da';
                    inputAbrev.style.backgroundColor = '#f8f9fa';
                    abreviaturasVistas[a] = true;
                }
            } else {
                inputAbrev.style.borderColor = '#ced4da';
                inputAbrev.style.backgroundColor = '#f8f9fa';
            }

            if (a) posiciones.push({ abreviatura: a, cantidad: c });
        });
    }

    if (hayDuplicados) {
        contenedorCodigos.innerHTML = '<input type="text" readonly value="⚠️ Duplicate position abbreviations detected." style="background-color: #fff3cd; color: #856404; font-family: monospace; letter-spacing: 1px; padding: 6px 10px; border: 1px solid #ffeeba; border-radius: 5px; font-size: 12px; width: 100%;">';
        return;
    }

    if (p1 && p2 && year && abrev && posiciones.length > 0) {
        let htmlCodigos = '';
        let hayAlguno = false;
        posiciones.forEach(pos => {
            if (pos.cantidad > 0) {
                hayAlguno = true;
                const codigo = `${p1}.${p2}-${year}-${abrev}-${pos.abreviatura}`;
                htmlCodigos += `<input type="text" readonly value="${codigo}  →  Quantity: ${pos.cantidad}" style="background-color: #f3e8ff; font-weight: bold; color: #862e9c; font-family: monospace; letter-spacing: 1px; margin-bottom: 4px; padding: 6px 10px; border: 1px solid #d0bfff; border-radius: 5px; font-size: 12px;">`;
            }
        });
        if (hayAlguno) {
            contenedorCodigos.innerHTML = htmlCodigos;
        } else {
            contenedorCodigos.innerHTML = '<input type="text" readonly value="Add at least one position with quantity > 0" style="background-color: #f3e8ff; color: #6c757d; font-family: monospace; letter-spacing: 1px; padding: 6px 10px; border: 1px solid #d0bfff; border-radius: 5px; font-size: 12px;">';
        }
    } else {
        contenedorCodigos.innerHTML = '<input type="text" readonly value="Fill all fields (project, year, client) to generate codes" style="background-color: #f3e8ff; color: #6c757d; font-family: monospace; letter-spacing: 1px; padding: 6px 10px; border: 1px solid #d0bfff; border-radius: 5px; font-size: 12px;">';
    }
}

// =============================================================
// 8. ADD COUPON FROM GLOBAL LIST
// =============================================================
function openNewCouponGlobalModal() {
    document.getElementById('cg-nombre').value = '';
    document.getElementById('cg-cliente').value = '';
    document.getElementById('cg-abrev').value = '';
    document.getElementById('cg-year').value = new Date().getFullYear();
    document.getElementById('cg-proj-part1').value = '';
    document.getElementById('cg-proj-part2').value = '';
    document.getElementById('cg-pais').value = '';
    document.getElementById('cg-planta').value = '';
    document.getElementById('cg-ubicacion').value = '';
    document.getElementById('cg-estado').value = 'Available';
    document.getElementById('cg-desc').value = '';
    document.getElementById('cg-contacto-nombre').value = '';
    document.getElementById('cg-contacto-info').value = '';
    
    document.getElementById('cg-contenedor-posiciones').innerHTML = '';
    contadorPosicionesCouponGlobal = 0;
    agregarPosicionCouponGlobal('FL', 0);
    agregarPosicionCouponGlobal('FR', 0);
    agregarPosicionCouponGlobal('RL', 0);
    agregarPosicionCouponGlobal('RR', 0);
    
    poblarSelectClientes();
    openModal('modal-coupon-global');
}

function autoFillCouponGlobalAbbreviation() {
    const clientName = document.getElementById('cg-cliente').value;
    const client = listaClientesFirebase.find(c => c.nombre === clientName);
    const abrevField = document.getElementById('cg-abrev');
    if (abrevField) {
        abrevField.value = client && client.abreviatura ? client.abreviatura : '';
    }
    updateCouponGlobalCodes();
}

function agregarPosicionCouponGlobal(abreviatura = '', cantidad = 0) {
    contadorPosicionesCouponGlobal++;
    const posId = `cg_pos_${contadorPosicionesCouponGlobal}`;
    const contenedor = document.getElementById('cg-contenedor-posiciones');
    if (!contenedor) return;

    const div = document.createElement('div');
    div.id = posId;
    div.style.cssText = "display: flex; gap: 8px; align-items: center; background: #ffffff; padding: 8px 10px; border-radius: 6px; border: 1px solid #dee2e6;";

    div.innerHTML = `
        <input type="text" class="cg-pos-abrev" placeholder="Abrev. (ej: FL)" value="${abreviatura}" maxlength="5" style="width: 100px; padding: 6px 8px; border-radius: 4px; border: 1px solid #ced4da; background: #f8f9fa; font-size: 12px; text-transform: uppercase;" onkeyup="updateCouponGlobalCodes()" onchange="updateCouponGlobalCodes()">
        <input type="number" class="cg-pos-cant" placeholder="Cant." value="${cantidad}" min="0" style="width: 80px; padding: 6px 8px; border-radius: 4px; border: 1px solid #ced4da; background: #f8f9fa; font-size: 12px;" onkeyup="updateCouponGlobalCodes()" onchange="updateCouponGlobalCodes()">
        <button type="button" onclick="eliminarPosicionCouponGlobal('${posId}')" style="background: #fff5f5; border: 1px solid #ffc9c9; color: #e30613; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;">&times;</button>
    `;

    contenedor.appendChild(div);
    updateCouponGlobalCodes();
}

function eliminarPosicionCouponGlobal(posId) {
    const div = document.getElementById(posId);
    if (div) {
        div.remove();
        updateCouponGlobalCodes();
    }
}

function updateCouponGlobalCodes() {
    const p1 = document.getElementById('cg-proj-part1').value.trim();
    const p2 = document.getElementById('cg-proj-part2').value.trim();
    const year = document.getElementById('cg-year').value.trim();
    const abrev = document.getElementById('cg-abrev').value.trim();

    const contenedorCodigos = document.getElementById('cg-contenedor-codigos');
    if (!contenedorCodigos) return;

    const contenedor = document.getElementById('cg-contenedor-posiciones');
    const posiciones = [];
    let hayDuplicados = false;
    const abreviaturasVistas = {};

    if (contenedor) {
        Array.from(contenedor.children).forEach(div => {
            const inputAbrev = div.querySelector('.cg-pos-abrev');
            const inputCant = div.querySelector('.cg-pos-cant');
            if (!inputAbrev || !inputCant) return;

            const a = (inputAbrev.value || '').trim().toUpperCase();
            const c = parseInt(inputCant.value) || 0;

            if (a) {
                if (abreviaturasVistas[a]) {
                    hayDuplicados = true;
                    inputAbrev.style.borderColor = '#e30613';
                } else {
                    inputAbrev.style.borderColor = '#ced4da';
                    abreviaturasVistas[a] = true;
                }
            }
            if (a) posiciones.push({ abreviatura: a, cantidad: c });
        });
    }

    if (hayDuplicados) {
        contenedorCodigos.innerHTML = '<input type="text" readonly value="⚠️ Duplicate position abbreviations detected." style="background-color: #fff3cd; color: #856404; font-family: monospace; padding: 6px 10px; border: 1px solid #ffeeba; border-radius: 5px; font-size: 12px; width: 100%;">';
        return;
    }

    if (p1 && p2 && year && abrev && posiciones.length > 0) {
        let htmlCodigos = '';
        let hayAlguno = false;
        posiciones.forEach(pos => {
            if (pos.cantidad > 0) {
                hayAlguno = true;
                const codigo = `${p1}.${p2}-${year}-${abrev}-${pos.abreviatura}`;
                htmlCodigos += `<input type="text" readonly value="${codigo}  →  Quantity: ${pos.cantidad}" style="background-color: #f3e8ff; font-weight: bold; color: #862e9c; font-family: monospace; letter-spacing: 1px; margin-bottom: 4px; padding: 6px 10px; border: 1px solid #d0bfff; border-radius: 5px; font-size: 12px;">`;
            }
        });
        if (hayAlguno) contenedorCodigos.innerHTML = htmlCodigos;
        else contenedorCodigos.innerHTML = '<input type="text" readonly value="Add at least one position with quantity > 0" style="background-color: #f3e8ff; color: #6c757d; font-family: monospace; padding: 6px 10px; border: 1px solid #d0bfff; border-radius: 5px; font-size: 12px;">';
    } else {
        contenedorCodigos.innerHTML = '<input type="text" readonly value="Fill all fields (project, year, client) to generate codes" style="background-color: #f3e8ff; color: #6c757d; font-family: monospace; padding: 6px 10px; border: 1px solid #d0bfff; border-radius: 5px; font-size: 12px;">';
    }
}

async function saveNewCouponGlobal(event) {
    event.preventDefault();
    
    const p1 = document.getElementById('cg-proj-part1').value.trim();
    const p2 = document.getElementById('cg-proj-part2').value.trim();
    const proyectoCompleto = `${p1}.${p2}`;
    const year = parseInt(document.getElementById('cg-year').value) || null;
    const abrev = document.getElementById('cg-abrev').value.trim().toUpperCase();
    
    const contenedor = document.getElementById('cg-contenedor-posiciones');
    const posiciones = [];
    Array.from(contenedor.children).forEach(div => {
        const inputAbrev = div.querySelector('.cg-pos-abrev');
        const inputCant = div.querySelector('.cg-pos-cant');
        if (inputAbrev && inputCant) {
            const a = (inputAbrev.value || '').trim().toUpperCase();
            const c = parseInt(inputCant.value) || 0;
            if (a && c > 0) posiciones.push({ abreviatura: a, cantidad: c });
        }
    });

    if (posiciones.length === 0) {
        Swal.fire({ icon: 'error', title: 'Missing quantities', text: 'Please fill at least one position with quantity > 0.', confirmButtonColor: '#e30613' });
        return;
    }

    if (!proyectoCompleto || !year || !abrev) {
        Swal.fire({ icon: 'error', title: 'Missing data', text: 'Please fill Project Number, Year and Client Abbreviation.', confirmButtonColor: '#e30613' });
        return;
    }

    const codigosInternos = posiciones.map(pos => ({
        codigo: `${proyectoCompleto}-${year}-${abrev}-${pos.abreviatura}`,
        cantidad: pos.cantidad,
        posicion: pos.abreviatura
    }));

    const docId = `FG_${Date.now()}`;
    const datosCoupon = {
        nombre: document.getElementById('cg-nombre').value.trim(),
        cliente: document.getElementById('cg-cliente').value,
        pais: document.getElementById('cg-pais').value.trim(),
        planta: document.getElementById('cg-planta').value.trim(),
        ubicacion: document.getElementById('cg-ubicacion').value.trim(),
        proyecto: proyectoCompleto,
        year: year,
        estado: document.getElementById('cg-estado').value,
        desc: document.getElementById('cg-desc').value.trim(),
        contactoNombre: document.getElementById('cg-contacto-nombre').value.trim(),
        contactoInfo: document.getElementById('cg-contacto-info').value.trim(),
        foto: '',
        codigoInterno: codigosInternos[0]?.codigo || '',
        codigosInternos: codigosInternos,
        posiciones: posiciones,
        esCoupon: true,
        origen: 'Global List (manual)',
        ultimaActualizacion: new Date().toISOString(),
        actualizadoPor: usuarioActual || 'Anonymous'
    };

    await db.collection("lista_fixtures_global").doc(docId).set(datosCoupon);
    
    await registrarModificacion(
        'FIXTURE_GLOBAL',
        'CREAR',
        `Coupon "${datosCoupon.nombre}" added directly to Global List (${datosCoupon.cliente})`,
        null, datosCoupon, 'lista_fixtures_global', docId
    );

    closeModal('modal-coupon-global');
    Toast.fire({ icon: 'success', title: 'Coupon added to global list' });
}

// =============================================================
// CHARTS SUB-TABS
// =============================================================
function changeChartsSubtab(subtab) {
    chartsSubtabActual = subtab;

    const subtabs = ['overview', 'cabinets', 'lockers', 'coupons', 'materials'];
    subtabs.forEach(st => {
        const btn = document.getElementById(`subtab-btn-${st}`);
        const cont = document.getElementById(`charts-subtab-${st}`);
        if (btn) btn.style.background = st === subtab ? '#e30613' : '#343a40';
        if (cont) cont.style.display = st === subtab ? 'block' : 'none';
    });

    if (subtab === 'cabinets') {
        renderizarGraficaCabinets();
        renderizarDescripcionesGabinetes();
    } else if (subtab === 'lockers') {
        renderizarGraficaLockers();
        renderizarDescripcionesLockers();
    } else if (subtab === 'coupons') {
        renderizarGraficaCoupons();
        renderizarDescripcionesRacks();
    } else if (subtab === 'materials') {
        renderizarGraficaMaterials();
        renderizarDescripcionesMateriales();
    } else if (subtab === 'overview') {
        actualizarGraficas();
    }
}

// =============================================================
// CABINETS CHART (Top 10 components by quantity)
// =============================================================
function renderizarGraficaCabinets() {
    const canvas = document.getElementById('chartCabinetsTopComponents');
    if (!canvas) return;

    // Acumular cantidad total por componente (solo los que tienen nombre real y cantidad > 0)
    const conteo = {};
    for (const key in inventarioGabinetes) {
        const info = inventarioGabinetes[key];
        if (!info || !info.nombre) continue;
        const nombre = (info.nombre || '').trim();
        if (!nombre || nombre === 'Available' || nombre === 'Disponible') continue;

        const cant = parseInt(info.cant) || 0;
        if (cant <= 0) continue;

        // Excluir si la key no pertenece a un gabinete existente (por seguridad)
        const gabId = key.split('-')[0];
        if (!listaEstructuraGabinetes.find(g => g.id === gabId)) continue;

        conteo[nombre] = (conteo[nombre] || 0) + cant;
    }

    // Ordenar de mayor a menor y tomar top 10
    const ordenado = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
    const top10 = ordenado.slice(0, 10);

    const labels = top10.map(e => e[0]);
    const data = top10.map(e => e[1]);

    if (chartCabinetsTopInstance) chartCabinetsTopInstance.destroy();

    if (labels.length === 0) {
        chartCabinetsTopInstance = new Chart(canvas, {
            type: 'bar',
            data: { labels: ['No components yet'], datasets: [{ data: [0], backgroundColor: '#adb5bd', borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
        return;
    }

    chartCabinetsTopInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total quantity',
                data: data,
                backgroundColor: '#e30613',
                borderRadius: 6,
                barThickness: 'flex',
                maxBarThickness: 45
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Total: ${ctx.parsed.x} pcs`
                    }
                }
            },
            scales: {
                x: { beginAtZero: true, ticks: { precision: 0 } },
                y: { ticks: { font: { size: 12 } } }
            }
        }
    });
}

// =============================================================
// CABINET DESCRIPTIONS (per-cabinet detail panel)
// =============================================================
function renderizarDescripcionesGabinetes() {
    const contenedor = document.getElementById('contenedor-descripciones-gabinetes');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    if (listaEstructuraGabinetes.length === 0) {
        contenedor.innerHTML = '<p style="font-size: 13px; color: #6c757d; grid-column: 1/-1; text-align: center; padding: 20px;">No cabinets registered.</p>';
        return;
    }

    // Orden alfabético por nombre
    const gabinetesOrdenados = [...listaEstructuraGabinetes].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    gabinetesOrdenados.forEach(gab => {
        // Calcular total de cajones del gabinete
        let totalCajones = 0;
        if (gab.tipo === 'GRID') {
            totalCajones = (gab.filas || 6) * (gab.cols || 6);
        } else if (gab.tipo === 'CANTIDAD') {
            totalCajones = gab.cant || 30;
        } else if (gab.tipo === 'CUSTOM' || gab.tipo === 'ESPECIAL_G3') {
            totalCajones = (gab.colIzqFilas || 3) + ((gab.colCentroCols || 4) * (gab.colCentroFilas || 5)) + (gab.colDerFilas || 3);
        }

        // Recopilar componentes del gabinete
        const componentes = {};
        let ocupados = 0;
        for (const key in inventarioGabinetes) {
            if (!key.startsWith(gab.id + '-')) continue;
            const info = inventarioGabinetes[key];
            if (!info || !info.nombre) continue;
            const nombre = (info.nombre || '').trim();
            if (!nombre || nombre === 'Available' || nombre === 'Disponible') continue;

            const cant = parseInt(info.cant) || 0;
            ocupados++;
            componentes[nombre] = (componentes[nombre] || 0) + cant;
        }

        const componentesOrdenados = Object.entries(componentes).sort((a, b) => b[1] - a[1]);
        const vacios = Math.max(0, totalCajones - ocupados);
        const porcentajeOcupacion = totalCajones > 0 ? Math.round((ocupados / totalCajones) * 100) : 0;

        const card = document.createElement('div');
        card.style.cssText = "background: #ffffff; border: 1px solid #e9ecef; border-left: 5px solid #e30613; border-radius: 10px; padding: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);";

        const descripcionHTML = gab.descripcion
            ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #495057; font-style: italic; background: #f8f9fa; padding: 8px 12px; border-radius: 6px; border-left: 3px solid #e30613;">${gab.descripcion}</p>`
            : `<p style="margin: 8px 0 0 0; font-size: 12px; color: #adb5bd; font-style: italic;">No description yet.</p>`;

        // Barra de progreso de ocupación
        const barraHTML = `
            <div style="margin: 12px 0 0 0;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #6c757d; margin-bottom: 4px;">
                    <span><strong>${ocupados}</strong> occupied / <strong>${vacios}</strong> empty</span>
                    <span>${porcentajeOcupacion}%</span>
                </div>
                <div style="width: 100%; height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;">
                    <div style="width: ${porcentajeOcupacion}%; height: 100%; background: linear-gradient(90deg, #e30613 0%, #b8030e 100%); border-radius: 4px; transition: width 0.4s ease;"></div>
                </div>
            </div>
        `;

        // Lista de componentes
        let listaComponentesHTML = '';
        if (componentesOrdenados.length === 0) {
            listaComponentesHTML = `<p style="font-size: 12px; color: #adb5bd; margin: 12px 0 0 0; text-align: center; padding: 10px; background: #f8f9fa; border-radius: 6px;">No components registered.</p>`;
        } else {
            listaComponentesHTML = `
                <div style="margin-top: 14px; border-top: 1px dashed #e9ecef; padding-top: 12px;">
                    <p style="font-size: 12px; font-weight: bold; color: #343a40; margin: 0 0 8px 0;">📋 Components (${componentesOrdenados.length}):</p>
                    <div style="display: flex; flex-direction: column; gap: 5px; max-height: 220px; overflow-y: auto; padding-right: 5px;">
                        ${componentesOrdenados.map(([nombre, cant]) => `
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 5px 10px; background: #f8f9fa; border-radius: 5px; border-left: 3px solid #adb5bd;">
                                <span style="color: #212529; word-break: break-word; padding-right: 8px;">${nombre}</span>
                                <span style="background: #e30613; color: white; padding: 2px 10px; border-radius: 10px; font-weight: bold; font-size: 11px; white-space: nowrap;">${cant} pcs</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        const tipoLabel = gab.tipo === 'GRID' ? `Grid ${gab.filas || 6}×${gab.cols || 6}` :
                          gab.tipo === 'CANTIDAD' ? `Consecutive (${gab.cant || 30})` :
                          'Custom (Left + Center + Right)';

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
                <h4 style="margin: 0; font-size: 15px; color: #1a1d20; font-weight: 700;">🗄️ ${gab.nombre}</h4>
                <span style="background: #e9ecef; color: #495057; padding: 2px 10px; border-radius: 12px; font-size: 10px; font-weight: bold; white-space: nowrap;">${tipoLabel}</span>
            </div>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #6c757d;">Total drawers: <strong>${totalCajones}</strong></p>
            ${descripcionHTML}
            ${barraHTML}
            ${listaComponentesHTML}
        `;
        contenedor.appendChild(card);
    });
}

// =============================================================
// AUTO-REFRESH CABINETS CHART ON DATA CHANGE
// =============================================================
function refrescarChartsSiEsNecesario() {
    if (chartsSubtabActual === 'cabinets') {
        renderizarGraficaCabinets();
        renderizarDescripcionesGabinetes();
    } else if (chartsSubtabActual === 'lockers') {
        renderizarGraficaLockers();
        renderizarDescripcionesLockers();
    } else if (chartsSubtabActual === 'coupons') {
        renderizarGraficaCoupons();
        renderizarDescripcionesRacks();
    } else if (chartsSubtabActual === 'materials') {
        renderizarGraficaMaterials();
        renderizarDescripcionesMateriales();
    }
}

// =============================================================
// LOCKERS CHART (Stacked bars by status)
// =============================================================
let chartLockersInstance = null;

function renderizarGraficaLockers() {
    const canvas = document.getElementById('chartLockersFixtures');
    if (!canvas) return;

    // Ordenar lockers alfabéticamente
    const lockersOrdenados = [...listaEstructuraLockers].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    const labels = [];
    // dataPorEstado[estado][idx] = cantidad
    const estadosKeys = Object.keys(ESTADOS_DISPONIBLES);
    const dataPorEstado = {};
    estadosKeys.forEach(k => dataPorEstado[k] = []);

    lockersOrdenados.forEach(locker => {
        labels.push(locker.nombre);

        const conteoEstados = {};
        estadosKeys.forEach(k => conteoEstados[k] = 0);

        for (let d = 1; d <= locker.niveles; d++) {
            const key = `${locker.id}-${d}`;
            const piezas = inventarioLockers[key] || [];
            piezas.forEach(p => {
                const est = p.estado && ESTADOS_DISPONIBLES[p.estado] ? p.estado : 'Available';
                conteoEstados[est]++;
            });
        }

        estadosKeys.forEach(k => dataPorEstado[k].push(conteoEstados[k]));
    });

    if (chartLockersInstance) chartLockersInstance.destroy();

    if (labels.length === 0) {
        chartLockersInstance = new Chart(canvas, {
            type: 'bar',
            data: { labels: ['No lockers yet'], datasets: [{ data: [0], backgroundColor: '#adb5bd' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
        return;
    }

    // Construir datasets solo con los estados que tienen al menos 1 valor > 0
    const datasets = [];
    estadosKeys.forEach(k => {
        const info = ESTADOS_DISPONIBLES[k];
        if (dataPorEstado[k].some(v => v > 0)) {
            datasets.push({
                label: `${info.emoji} ${info.label}`,
                data: dataPorEstado[k],
                backgroundColor: info.color,
                borderRadius: 3,
                maxBarThickness: 60
            });
        }
    });

    chartLockersInstance = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        footer: (items) => {
                            const total = items.reduce((sum, it) => sum + (it.parsed.y || 0), 0);
                            return `Total: ${total} fixture(s)`;
                        }
                    }
                }
            },
            scales: {
                x: { stacked: true, ticks: { font: { size: 12 } } },
                y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }
            }
        }
    });

    // Leyenda manual
    const leyenda = document.getElementById('leyenda-estados-lockers');
    if (leyenda) {
        leyenda.innerHTML = '';
        estadosKeys.forEach(k => {
            const info = ESTADOS_DISPONIBLES[k];
            const item = document.createElement('div');
            item.style.cssText = "display: flex; align-items: center; gap: 6px; font-size: 12px; color: #495057;";
            item.innerHTML = `
                <span style="display: inline-block; width: 14px; height: 14px; background: ${info.color}; border-radius: 3px;"></span>
                <span>${info.emoji} ${info.label}</span>
            `;
            leyenda.appendChild(item);
        });
    }
}

// =============================================================
// LOCKER DESCRIPTIONS (per-locker detail panel)
// =============================================================
function calcularCantidadFixture(p) {
    // Si tiene posiciones con cantidad > 0, sumar
    if (p.posiciones && p.posiciones.length > 0) {
        const suma = p.posiciones.reduce((s, pos) => s + (parseInt(pos.cantidad) || 0), 0);
        if (suma > 0) return suma;
    }
    // Si tiene cantidad simple
    if (p.cantidad !== undefined && p.cantidad !== '' && p.cantidad !== null) {
        const c = parseInt(p.cantidad);
        if (!isNaN(c) && c > 0) return c;
    }
    // Si no, no mostrar
    return null;
}

function renderizarDescripcionesLockers() {
    const contenedor = document.getElementById('contenedor-descripciones-lockers');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    if (listaEstructuraLockers.length === 0) {
        contenedor.innerHTML = '<p style="font-size: 13px; color: #6c757d; grid-column: 1/-1; text-align: center; padding: 20px;">No lockers registered.</p>';
        return;
    }

    const lockersOrdenados = [...listaEstructuraLockers].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    lockersOrdenados.forEach(locker => {
        // Recopilar todos los fixtures del locker
        const fixtures = [];
        let compartimentosConItems = 0;

        for (let d = 1; d <= locker.niveles; d++) {
            const key = `${locker.id}-${d}`;
            const piezas = inventarioLockers[key] || [];
            if (piezas.length > 0) compartimentosConItems++;

            const nombreNivel = (locker.nombresNiveles && locker.nombresNiveles[d]) ? locker.nombresNiveles[d] : `Compartment ${d}`;

            piezas.forEach(p => {
                fixtures.push({ ...p, _compartimento: d, _compartimentoNombre: nombreNivel });
            });
        }

        const totalCompartimentos = locker.niveles;
        const totalFixtures = fixtures.length;
        const porcentajeOcupacion = totalCompartimentos > 0 ? Math.round((compartimentosConItems / totalCompartimentos) * 100) : 0;

        // Agrupar por cliente
        const porCliente = {};
        fixtures.forEach(p => {
            const cli = p.cliente || 'No Client';
            porCliente[cli] = (porCliente[cli] || 0) + 1;
        });
        const clientesOrdenados = Object.entries(porCliente).sort((a, b) => b[1] - a[1]);

        // Contar por estado
        const porEstado = {};
        Object.keys(ESTADOS_DISPONIBLES).forEach(k => porEstado[k] = 0);
        fixtures.forEach(p => {
            const est = p.estado && ESTADOS_DISPONIBLES[p.estado] ? p.estado : 'Available';
            porEstado[est]++;
        });

        const card = document.createElement('div');
        card.style.cssText = "background: #ffffff; border: 1px solid #e9ecef; border-left: 5px solid #e30613; border-radius: 10px; padding: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);";

        const descripcionHTML = locker.descripcion
            ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #495057; font-style: italic; background: #f8f9fa; padding: 8px 12px; border-radius: 6px; border-left: 3px solid #e30613;">${locker.descripcion}</p>`
            : `<p style="margin: 8px 0 0 0; font-size: 12px; color: #adb5bd; font-style: italic;">No description yet.</p>`;

        const barraHTML = `
            <div style="margin: 12px 0 0 0;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #6c757d; margin-bottom: 4px;">
                    <span><strong>${compartimentosConItems}</strong> of <strong>${totalCompartimentos}</strong> compartments used</span>
                    <span>${porcentajeOcupacion}%</span>
                </div>
                <div style="width: 100%; height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;">
                    <div style="width: ${porcentajeOcupacion}%; height: 100%; background: linear-gradient(90deg, #e30613 0%, #b8030e 100%); border-radius: 4px; transition: width 0.4s ease;"></div>
                </div>
            </div>
        `;

        // Badges por estado
        let badgesEstadoHTML = '';
        const estadosConValor = Object.keys(ESTADOS_DISPONIBLES).filter(k => porEstado[k] > 0);
        if (estadosConValor.length > 0) {
            badgesEstadoHTML = `<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;">` +
                estadosConValor.map(k => {
                    const info = ESTADOS_DISPONIBLES[k];
                    return `<span style="background: ${info.color}; color: white; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: bold;">${info.emoji} ${info.label}: ${porEstado[k]}</span>`;
                }).join('') +
            `</div>`;
        }

        // Clientes
        let clientesHTML = '';
        if (clientesOrdenados.length > 0) {
            clientesHTML = `
                <div style="margin-top: 12px; border-top: 1px dashed #e9ecef; padding-top: 10px;">
                    <p style="font-size: 12px; font-weight: bold; color: #343a40; margin: 0 0 6px 0;">🏢 Clients (${clientesOrdenados.length}):</p>
                    <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                        ${clientesOrdenados.map(([cli, cnt]) => `<span style="background: #e7f5ff; color: #1971c2; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; border: 1px solid #a5d8ff;">${cli}: ${cnt}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        // Lista de fixtures
        let listaFixturesHTML = '';
        if (fixtures.length === 0) {
            listaFixturesHTML = `<p style="font-size: 12px; color: #adb5bd; margin: 12px 0 0 0; text-align: center; padding: 10px; background: #f8f9fa; border-radius: 6px;">No fixtures stored in this locker.</p>`;
        } else {
            const fixturesOrdenados = [...fixtures].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

            listaFixturesHTML = `
                <div style="margin-top: 14px; border-top: 1px dashed #e9ecef; padding-top: 12px;">
                    <p style="font-size: 12px; font-weight: bold; color: #343a40; margin: 0 0 8px 0;">📦 All fixtures stored (${fixtures.length}):</p>
                    <div style="display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; padding-right: 5px;">
                        ${fixturesOrdenados.map((f, idx) => {
                            const cant = calcularCantidadFixture(f);
                            const cantHTML = cant !== null ? `<span style="background: #862e9c; color: white; padding: 2px 8px; border-radius: 10px; font-weight: bold; font-size: 10px; white-space: nowrap;">${cant} pcs</span>` : '';
                            const estadoInfo = ESTADOS_DISPONIBLES[f.estado] || ESTADOS_DISPONIBLES['Available'];
                            const codigoHTML = f.codigoInterno ? `<span style="font-family: monospace; font-size: 10px; color: #862e9c; background: #f3e8ff; padding: 1px 6px; border-radius: 3px; display: inline-block; margin-top: 3px;">🔢 ${f.codigoInterno}</span>` : '';
                            const fixtureJSON = JSON.stringify(f).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

                            return `
                                <div style="background: #f8f9fa; border-radius: 6px; padding: 8px 10px; border-left: 3px solid ${estadoInfo.color};">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                                        <div style="flex: 1; min-width: 0;">
                                            <div style="font-size: 12px; color: #212529; font-weight: 600; word-break: break-word;">${f.nombre}</div>
                                            <div style="font-size: 11px; color: #6c757d; margin-top: 2px;">🏢 ${f.cliente || 'N/A'} · 📁 ${f._compartimentoNombre}</div>
                                            ${codigoHTML}
                                        </div>
                                        <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-end;">
                                            ${cantHTML}
                                            <button style="background: none; border: none; color: #e30613; font-size: 10px; font-weight: bold; padding: 0; cursor: pointer; text-decoration: underline;" onclick='viewFullFixtureDetail(${fixtureJSON})'>Ver más</button>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
                <h4 style="margin: 0; font-size: 15px; color: #1a1d20; font-weight: 700;">🔒 ${locker.nombre}</h4>
                <span style="background: #e9ecef; color: #495057; padding: 2px 10px; border-radius: 12px; font-size: 10px; font-weight: bold; white-space: nowrap;">${totalFixtures} fixture(s)</span>
            </div>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #6c757d;">Compartments: <strong>${totalCompartimentos}</strong></p>
            ${descripcionHTML}
            ${barraHTML}
            ${badgesEstadoHTML}
            ${clientesHTML}
            ${listaFixturesHTML}
        `;
        contenedor.appendChild(card);
    });
}

// =============================================================
// COUPONS CHART (Stacked bars by status)
// =============================================================
let chartCouponsInstance = null;

function renderizarGraficaCoupons() {
    const canvas = document.getElementById('chartCouponsRacks');
    if (!canvas) return;

    const racksOrdenados = [...listaEstructuraRacks].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    const labels = [];
    const estadosKeys = Object.keys(ESTADOS_DISPONIBLES);
    const dataPorEstado = {};
    estadosKeys.forEach(k => dataPorEstado[k] = []);

    racksOrdenados.forEach(rack => {
        labels.push(rack.nombre);

        const conteoEstados = {};
        estadosKeys.forEach(k => conteoEstados[k] = 0);

        for (let d = 1; d <= rack.niveles; d++) {
            const key = `${rack.id}-${d}`;
            const piezas = inventarioRacks[key] || [];
            piezas.forEach(p => {
                const est = p.estado && ESTADOS_DISPONIBLES[p.estado] ? p.estado : 'Available';
                conteoEstados[est]++;
            });
        }

        estadosKeys.forEach(k => dataPorEstado[k].push(conteoEstados[k]));
    });

    if (chartCouponsInstance) chartCouponsInstance.destroy();

    if (labels.length === 0) {
        chartCouponsInstance = new Chart(canvas, {
            type: 'bar',
            data: { labels: ['No racks yet'], datasets: [{ data: [0], backgroundColor: '#adb5bd' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
        return;
    }

    const datasets = [];
    estadosKeys.forEach(k => {
        const info = ESTADOS_DISPONIBLES[k];
        if (dataPorEstado[k].some(v => v > 0)) {
            datasets.push({
                label: `${info.emoji} ${info.label}`,
                data: dataPorEstado[k],
                backgroundColor: info.color,
                borderRadius: 3,
                maxBarThickness: 60
            });
        }
    });

    chartCouponsInstance = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        footer: (items) => {
                            const total = items.reduce((sum, it) => sum + (it.parsed.y || 0), 0);
                            return `Total: ${total} coupon(s)`;
                        }
                    }
                }
            },
            scales: {
                x: { stacked: true, ticks: { font: { size: 12 } } },
                y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }
            }
        }
    });

    const leyenda = document.getElementById('leyenda-estados-coupons');
    if (leyenda) {
        leyenda.innerHTML = '';
        estadosKeys.forEach(k => {
            const info = ESTADOS_DISPONIBLES[k];
            const item = document.createElement('div');
            item.style.cssText = "display: flex; align-items: center; gap: 6px; font-size: 12px; color: #495057;";
            item.innerHTML = `
                <span style="display: inline-block; width: 14px; height: 14px; background: ${info.color}; border-radius: 3px;"></span>
                <span>${info.emoji} ${info.label}</span>
            `;
            leyenda.appendChild(item);
        });
    }
}

// =============================================================
// RACK DESCRIPTIONS (per-rack detail panel)
// =============================================================
function renderizarDescripcionesRacks() {
    const contenedor = document.getElementById('contenedor-descripciones-racks');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    if (listaEstructuraRacks.length === 0) {
        contenedor.innerHTML = '<p style="font-size: 13px; color: #6c757d; grid-column: 1/-1; text-align: center; padding: 20px;">No racks registered.</p>';
        return;
    }

    const racksOrdenados = [...listaEstructuraRacks].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    racksOrdenados.forEach(rack => {
        const coupons = [];
        let nivelesConItems = 0;

        for (let d = 1; d <= rack.niveles; d++) {
            const key = `${rack.id}-${d}`;
            const piezas = inventarioRacks[key] || [];
            if (piezas.length > 0) nivelesConItems++;

            const nombreNivel = (rack.nombresNiveles && rack.nombresNiveles[d]) ? rack.nombresNiveles[d] : `Level ${d}`;

            piezas.forEach(p => {
                coupons.push({ ...p, _nivel: d, _nivelNombre: nombreNivel });
            });
        }

        const totalNiveles = rack.niveles;
        const totalCoupons = coupons.length;
        const porcentajeOcupacion = totalNiveles > 0 ? Math.round((nivelesConItems / totalNiveles) * 100) : 0;

        // Agrupar por cliente
        const porCliente = {};
        coupons.forEach(p => {
            const cli = p.cliente || 'No Client';
            porCliente[cli] = (porCliente[cli] || 0) + 1;
        });
        const clientesOrdenados = Object.entries(porCliente).sort((a, b) => b[1] - a[1]);

        // Agrupar por año
        const porYear = {};
        coupons.forEach(p => {
            if (p.year) porYear[p.year] = (porYear[p.year] || 0) + 1;
        });
        const yearsOrdenados = Object.entries(porYear).sort((a, b) => b[0] - a[0]);

        // Contar por estado
        const porEstado = {};
        Object.keys(ESTADOS_DISPONIBLES).forEach(k => porEstado[k] = 0);
        coupons.forEach(p => {
            const est = p.estado && ESTADOS_DISPONIBLES[p.estado] ? p.estado : 'Available';
            porEstado[est]++;
        });

        const card = document.createElement('div');
        card.style.cssText = "background: #ffffff; border: 1px solid #e9ecef; border-left: 5px solid #862e9c; border-radius: 10px; padding: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);";

        const descripcionHTML = rack.descripcion
            ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #495057; font-style: italic; background: #f8f9fa; padding: 8px 12px; border-radius: 6px; border-left: 3px solid #862e9c;">${rack.descripcion}</p>`
            : `<p style="margin: 8px 0 0 0; font-size: 12px; color: #adb5bd; font-style: italic;">No description yet.</p>`;

        const barraHTML = `
            <div style="margin: 12px 0 0 0;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #6c757d; margin-bottom: 4px;">
                    <span><strong>${nivelesConItems}</strong> of <strong>${totalNiveles}</strong> levels used</span>
                    <span>${porcentajeOcupacion}%</span>
                </div>
                <div style="width: 100%; height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;">
                    <div style="width: ${porcentajeOcupacion}%; height: 100%; background: linear-gradient(90deg, #862e9c 0%, #5f2170 100%); border-radius: 4px; transition: width 0.4s ease;"></div>
                </div>
            </div>
        `;

        // Badges por estado
        let badgesEstadoHTML = '';
        const estadosConValor = Object.keys(ESTADOS_DISPONIBLES).filter(k => porEstado[k] > 0);
        if (estadosConValor.length > 0) {
            badgesEstadoHTML = `<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;">` +
                estadosConValor.map(k => {
                    const info = ESTADOS_DISPONIBLES[k];
                    return `<span style="background: ${info.color}; color: white; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: bold;">${info.emoji} ${info.label}: ${porEstado[k]}</span>`;
                }).join('') +
            `</div>`;
        }

        // Clientes + Years en una fila
        let metaHTML = '';
        if (clientesOrdenados.length > 0 || yearsOrdenados.length > 0) {
            metaHTML = `<div style="margin-top: 12px; border-top: 1px dashed #e9ecef; padding-top: 10px; display: flex; flex-direction: column; gap: 8px;">`;
            if (clientesOrdenados.length > 0) {
                metaHTML += `
                    <div>
                        <p style="font-size: 12px; font-weight: bold; color: #343a40; margin: 0 0 6px 0;">🏢 Clients (${clientesOrdenados.length}):</p>
                        <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                            ${clientesOrdenados.map(([cli, cnt]) => `<span style="background: #e7f5ff; color: #1971c2; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; border: 1px solid #a5d8ff;">${cli}: ${cnt}</span>`).join('')}
                        </div>
                    </div>
                `;
            }
            if (yearsOrdenados.length > 0) {
                metaHTML += `
                    <div>
                        <p style="font-size: 12px; font-weight: bold; color: #343a40; margin: 0 0 6px 0;">📅 Years (${yearsOrdenados.length}):</p>
                        <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                            ${yearsOrdenados.map(([year, cnt]) => `<span style="background: #f3e8ff; color: #862e9c; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; border: 1px solid #d0bfff;">${year}: ${cnt}</span>`).join('')}
                        </div>
                    </div>
                `;
            }
            metaHTML += `</div>`;
        }

        // Lista de coupons
        let listaCouponsHTML = '';
        if (coupons.length === 0) {
            listaCouponsHTML = `<p style="font-size: 12px; color: #adb5bd; margin: 12px 0 0 0; text-align: center; padding: 10px; background: #f8f9fa; border-radius: 6px;">No coupons stored in this rack.</p>`;
        } else {
            const couponsOrdenados = [...coupons].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

            listaCouponsHTML = `
                <div style="margin-top: 14px; border-top: 1px dashed #e9ecef; padding-top: 12px;">
                    <p style="font-size: 12px; font-weight: bold; color: #343a40; margin: 0 0 8px 0;">📦 All coupons stored (${coupons.length}):</p>
                    <div style="display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; padding-right: 5px;">
                        ${couponsOrdenados.map((c) => {
                            const estadoInfo = ESTADOS_DISPONIBLES[c.estado] || ESTADOS_DISPONIBLES['Available'];
                            const fixtureJSON = JSON.stringify(c).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

                            // Cantidad total (suma de posiciones)
                            let cantidadTotal = 0;
                            if (c.posiciones && c.posiciones.length > 0) {
                                cantidadTotal = c.posiciones.reduce((s, p) => s + (parseInt(p.cantidad) || 0), 0);
                            }
                            const cantidadHTML = cantidadTotal > 0 ? `<span style="background: #862e9c; color: white; padding: 2px 8px; border-radius: 10px; font-weight: bold; font-size: 10px; white-space: nowrap;">${cantidadTotal} pcs</span>` : '';

                            // Códigos internos
                            let codigosHTML = '';
                            if (c.codigosInternos && c.codigosInternos.length > 0) {
                                codigosHTML = '<div style="display: flex; flex-direction: column; gap: 3px; margin-top: 5px;">' +
                                    c.codigosInternos.map(cod => `<span style="font-family: monospace; font-size: 10px; color: #862e9c; font-weight: bold; background: #f3e8ff; padding: 2px 6px; border-radius: 3px; display: inline-block; width: fit-content;">🔢 ${cod.codigo}</span>`).join('') +
                                '</div>';
                            }

                            // Posiciones (chips)
                            let posicionesHTML = '';
                            if (c.posiciones && c.posiciones.length > 0) {
                                posicionesHTML = '<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;">' +
                                    c.posiciones.map(pos => `<span style="background: #862e9c; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold;">${pos.abreviatura}: ${pos.cantidad}</span>`).join('') +
                                '</div>';
                            }

                            return `
                                <div style="background: #f8f9fa; border-radius: 6px; padding: 10px; border-left: 3px solid ${estadoInfo.color};">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                                        <div style="flex: 1; min-width: 0;">
                                            <div style="font-size: 12px; color: #212529; font-weight: 600; word-break: break-word;">${c.nombre}</div>
                                            <div style="font-size: 11px; color: #6c757d; margin-top: 2px;">🏢 ${c.cliente || 'N/A'} · 📁 ${c._nivelNombre}${c.year ? ` · 📅 ${c.year}` : ''}</div>
                                            ${codigosHTML}
                                            ${posicionesHTML}
                                        </div>
                                        <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-end;">
                                            ${cantidadHTML}
                                            <button style="background: none; border: none; color: #e30613; font-size: 10px; font-weight: bold; padding: 0; cursor: pointer; text-decoration: underline;" onclick='viewFullFixtureDetail(${fixtureJSON})'>Ver más</button>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
                <h4 style="margin: 0; font-size: 15px; color: #1a1d20; font-weight: 700;">📐 ${rack.nombre}</h4>
                <span style="background: #f3e8ff; color: #862e9c; padding: 2px 10px; border-radius: 12px; font-size: 10px; font-weight: bold; white-space: nowrap;">${totalCoupons} coupon(s)</span>
            </div>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #6c757d;">Levels: <strong>${totalNiveles}</strong></p>
            ${descripcionHTML}
            ${barraHTML}
            ${badgesEstadoHTML}
            ${metaHTML}
            ${listaCouponsHTML}
        `;
        contenedor.appendChild(card);
    });
}

// =============================================================
// MATERIALS CHART (Stock by material with threshold colors)
// =============================================================
let chartMaterialsStockInstance = null;

function renderizarGraficaMaterials() {
    const canvas = document.getElementById('chartMaterialsStock');
    if (!canvas) return;

    // Ordenar materiales por stock descendente
    const materialesOrdenados = [...listaNacho].sort((a, b) => (parseInt(b.cant) || 0) - (parseInt(a.cant) || 0));

    const labels = materialesOrdenados.map(m => m.nombre);
    const data = materialesOrdenados.map(m => parseInt(m.cant) || 0);

    // Color por umbral
    const colores = data.map(cant => {
        if (cant <= 0) return '#e30613';
        if (cant <= 10) return '#f59f00';
        return '#2b8a3e';
    });

    if (chartMaterialsStockInstance) chartMaterialsStockInstance.destroy();

    if (labels.length === 0) {
        chartMaterialsStockInstance = new Chart(canvas, {
            type: 'bar',
            data: { labels: ['No materials yet'], datasets: [{ data: [0], backgroundColor: '#adb5bd' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
        return;
    }

    chartMaterialsStockInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Stock (pcs)',
                data: data,
                backgroundColor: colores,
                borderRadius: 6,
                maxBarThickness: 40
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Stock: ${ctx.parsed.x} pcs`,
                        afterLabel: (ctx) => {
                            const mat = materialesOrdenados[ctx.dataIndex];
                            return mat.ubicacion ? `📍 ${mat.ubicacion}` : '';
                        }
                    }
                }
            },
            scales: {
                x: { beginAtZero: true, ticks: { precision: 0 } },
                y: { ticks: { font: { size: 12 } } }
            }
        }
    });
}

// =============================================================
// MATERIAL DESCRIPTIONS (per-material detail panel)
// =============================================================
function renderizarDescripcionesMateriales() {
    const contenedor = document.getElementById('contenedor-descripciones-materiales');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    if (listaNacho.length === 0) {
        contenedor.innerHTML = '<p style="font-size: 13px; color: #6c757d; grid-column: 1/-1; text-align: center; padding: 20px;">No materials registered.</p>';
        return;
    }

    // Ordenar por stock descendente, mismo orden que la gráfica
    const materialesOrdenados = [...listaNacho].sort((a, b) => (parseInt(b.cant) || 0) - (parseInt(a.cant) || 0));

    materialesOrdenados.forEach(mat => {
        const cant = parseInt(mat.cant) || 0;
        let color, label, emoji;
        if (cant <= 0) {
            color = '#e30613'; label = 'Out of Stock'; emoji = '🔴';
        } else if (cant <= 10) {
            color = '#f59f00'; label = 'Low Stock'; emoji = '🟡';
        } else {
            color = '#2b8a3e'; label = 'In Stock'; emoji = '🟢';
        }

        const card = document.createElement('div');
        card.style.cssText = `background: #ffffff; border: 1px solid #e9ecef; border-left: 5px solid ${color}; border-radius: 10px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);`;

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
                <h4 style="margin: 0; font-size: 15px; color: #1a1d20; font-weight: 700; word-break: break-word;">🧰 ${mat.nombre}</h4>
                <span style="background: ${color}; color: white; padding: 2px 10px; border-radius: 12px; font-size: 10px; font-weight: bold; white-space: nowrap;">${emoji} ${label}</span>
            </div>
            ${mat.desc ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #495057;">${mat.desc}</p>` : ''}
            ${mat.ubicacion ? `<p style="margin: 8px 0 0 0; font-size: 11px; color: #1971c2; background: #e7f5ff; padding: 5px 10px; border-radius: 5px; display: inline-block;">📍 ${mat.ubicacion}</p>` : ''}
            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #e9ecef; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 11px; color: #6c757d;">Available stock:</span>
                <span style="font-size: 16px; font-weight: bold; color: ${color};">${cant} pcs</span>
            </div>
        `;
        contenedor.appendChild(card);
    });
}


// =============================================================
// LAYOUT MAP - PUNTOS INTERACTIVOS (V2 - Clústeres y Arrastre)
// =============================================================
let modoEdicionLayout = false;
let puntosLayout = []; 
let puntoArrastrando = null;
let offsetX = 0, offsetY = 0;
let mouseDownTime = 0;

function toggleModoEdicion() {
    if (rolActual !== "SUPER_ADMIN") return;
    modoEdicionLayout = !modoEdicionLayout;
    
    const btn = document.getElementById('btn-modo-edicion');
    if (modoEdicionLayout) {
        btn.textContent = "✏️ Modo Edición: ON (Clic para Agregar / Arrastrar para Mover / Clic Der. para Borrar)";
        btn.style.backgroundColor = "#2b8a3e";
        document.getElementById('layout-container').style.cursor = "crosshair";
    } else {
        btn.textContent = "✏️ Modo Edición: OFF";
        btn.style.backgroundColor = "#f59f00";
        document.getElementById('layout-container').style.cursor = "default";
    }
    renderizarPuntosLayout();
}

// Detectar clics para agregar
document.getElementById('layout-container')?.addEventListener('mousedown', (e) => {
    if (!modoEdicionLayout || e.target.closest('.punto-mapa')) return;
    mouseDownTime = Date.now();
});

document.getElementById('layout-container')?.addEventListener('mouseup', async (e) => {
    if (!modoEdicionLayout || e.target.closest('.punto-mapa')) return;
    
    // Si fue un clic rápido (no un arrastre de pantalla)
    if (Date.now() - mouseDownTime > 200) return;

    const rect = document.getElementById('layout-container').getBoundingClientRect();
    const xPorcentaje = ((e.clientX - rect.left) / rect.width) * 100;
    const yPorcentaje = ((e.clientY - rect.top) / rect.height) * 100;

    const { value: formValues } = await Swal.fire({
        title: 'Asignar Elemento al Mapa',
        html: `
            <select id="swal-tipo" class="swal2-select">
                <option value="gabinete">Gabinete</option>
                <option value="locker">Locker</option>
                <option value="rack">Rack</option>
            </select>
            <select id="swal-id" class="swal2-select"><option value="">Cargando...</option></select>
        `,
        didOpen: () => {
            const tipoSelect = document.getElementById('swal-tipo');
            const idSelect = document.getElementById('swal-id');
            const actualizarSelect = () => {
                const tipo = tipoSelect.value;
                idSelect.innerHTML = '';
                if (tipo === 'gabinete') listaEstructuraGabinetes.forEach(g => idSelect.innerHTML += `<option value="${g.id}">${g.nombre}</option>`);
                else if (tipo === 'locker') listaEstructuraLockers.forEach(l => idSelect.innerHTML += `<option value="${l.id}">${l.nombre}</option>`);
                else listaEstructuraRacks.forEach(r => idSelect.innerHTML += `<option value="${r.id}">${r.nombre}</option>`);
            };
            tipoSelect.addEventListener('change', actualizarSelect);
            actualizarSelect();
        },
        showCancelButton: true, confirmButtonText: 'Guardar', confirmButtonColor: '#e30613',
        preConfirm: () => ({ tipo: document.getElementById('swal-tipo').value, refId: document.getElementById('swal-id').value })
    });

    if (formValues && formValues.refId) {
        await db.collection("layout_puntos").add({
            tipo: formValues.tipo, refId: formValues.refId, x: xPorcentaje, y: yPorcentaje
        });
        Toast.fire({ icon: 'success', title: 'Punto guardado' });
    }
});

// Dibujar puntos y agruparlos
function renderizarPuntosLayout() {
    const capa = document.getElementById('capa-puntos');
    if (!capa) return;
    capa.innerHTML = '';

    const grupos = [];
    puntosLayout.forEach(punto => {
        let encontrado = false;
        for (let grupo of grupos) {
            const distX = Math.abs(grupo[0].x - punto.x);
            const distY = Math.abs(grupo[0].y - punto.y);
            if (distX < 0.8 && distY < 0.8) { 
                grupo.push(punto);
                encontrado = true;
                break;
            }
        }
        if (!encontrado) grupos.push([punto]);
    });

    grupos.forEach(grupo => {
        const p = grupo[0]; 
        const isCluster = grupo.length > 1;
        
        let color = '#adb5bd';
        if (p.tipo === 'gabinete') color = '#e30613';
        else if (p.tipo === 'locker') color = '#343a40';
        else if (p.tipo === 'rack') color = '#862e9c';

        // Obtener el nombre para el tooltip
        let tooltipText = 'Desconocido';
        if (p.tipo === 'gabinete') {
            const g = listaEstructuraGabinetes.find(x => x.id === p.refId);
            if (g) tooltipText = g.nombre;
        } else if (p.tipo === 'locker') {
            const l = listaEstructuraLockers.find(x => x.id === p.refId);
            if (l) tooltipText = l.nombre;
        } else if (p.tipo === 'rack') {
            const r = listaEstructuraRacks.find(x => x.id === p.refId);
            if (r) tooltipText = r.nombre;
        }

        const div = document.createElement('div');
        div.className = 'punto-mapa';
        div.id = `punto-${grupo.map(g => g.id).join('-')}`; 
        div.style.cssText = `
            position: absolute; 
            left: ${p.x}%; top: ${p.y}%; 
            transform: translate(-50%, -50%); 
            width: 14px; height: 14px; 
            background: ${color}; 
            border: 2px solid white; 
            border-radius: 50%; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.6);
            pointer-events: auto;
            cursor: ${modoEdicionLayout ? 'grab' : 'pointer'};
            z-index: 10;
            display: flex; align-items: center; justify-content: center;
            color: white; font-size: 10px; font-weight: bold;
            transition: all 0.3s ease;
        `;

        if (isCluster) {
            div.textContent = grupo.length;
            div.style.width = '20px'; div.style.height = '20px';
            div.style.borderColor = '#f59f00';
            
            // AQUÍ ESTÁ EL CAMBIO: Junta los nombres de todos los elementos del grupo
            tooltipText = grupo.map(g => {
                if (g.tipo === 'gabinete') {
                    const item = listaEstructuraGabinetes.find(x => x.id === g.refId);
                    return item ? item.nombre : '';
                }
                if (g.tipo === 'locker') {
                    const item = listaEstructuraLockers.find(x => x.id === g.refId);
                    return item ? item.nombre : '';
                }
                if (g.tipo === 'rack') {
                    const item = listaEstructuraRacks.find(x => x.id === g.refId);
                    return item ? item.nombre : '';
                }
                return '';
            }).filter(n => n !== '').join(' | '); // Los separa con una línea vertical
        }

        if (!modoEdicionLayout) {
            const tooltip = document.createElement('div');
            const estaArriba = p.y < 10; 
            const posicionY = estaArriba ? 'top: 25px;' : 'bottom: 25px;';

            tooltip.style.cssText = `
                position: absolute; ${posicionY} left: 50%; transform: translateX(-50%);
                background: #1a1d20; color: white; padding: 6px 10px; border-radius: 4px;
                font-size: 11px; white-space: nowrap; pointer-events: none;
                opacity: 0; transition: opacity 0.2s; z-index: 99999;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            `;
            tooltip.innerHTML = `<strong>${tooltipText}</strong>`;
            
            div.onmouseenter = () => tooltip.style.opacity = '1';
            div.onmouseleave = () => tooltip.style.opacity = '0';
            div.appendChild(tooltip);

            div.onclick = (e) => {
                e.stopPropagation();
                mostrarInfoPuntos(grupo);
            };
        } else {
            // ... (El código de arrastrar se queda igual)
            div.onmousedown = (e) => {
                if (e.button === 2) return; 
                puntoArrastrando = { grupo, element: div };
                div.style.cursor = 'grabbing';
                div.style.zIndex = 100;
                
                const rect = document.getElementById('layout-container').getBoundingClientRect();
                offsetX = e.clientX - rect.left - (rect.width * (p.x / 100));
                offsetY = e.clientY - rect.top - (rect.height * (p.y / 100));
            };

            div.oncontextmenu = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const res = await Swal.fire({ 
                    title: '¿Eliminar punto(s)?', 
                    text: isCluster ? `Se eliminarán ${grupo.length} elementos.` : 'Se eliminará este elemento.',
                    icon: 'warning', showCancelButton: true, confirmButtonColor: '#e30613' 
                });
                if (res.isConfirmed) {
                    const batch = db.batch();
                    grupo.forEach(item => batch.delete(db.collection("layout_puntos").doc(item.id)));
                    await batch.commit();
                }
            };
        }
        capa.appendChild(div);
    });
}

// Lógica para mover el punto con el mouse
document.addEventListener('mousemove', (e) => {
    if (!puntoArrastrando) return;
    const container = document.getElementById('layout-container');
    const rect = container.getBoundingClientRect();
    
    let newX = e.clientX - rect.left - offsetX;
    let newY = e.clientY - rect.top - offsetY;

    // Convertir a porcentaje
    let xPorcentaje = (newX / rect.width) * 100;
    let yPorcentaje = (newY / rect.height) * 100;
    
    // Limitar bordes
    xPorcentaje = Math.max(0, Math.min(100, xPorcentaje));
    yPorcentaje = Math.max(0, Math.min(100, yPorcentaje));

    puntoArrastrando.element.style.left = `${xPorcentaje}%`;
    puntoArrastrando.element.style.top = `${yPorcentaje}%`;
    
    puntoArrastrando.newX = xPorcentaje;
    puntoArrastrando.newY = yPorcentaje;
});

document.addEventListener('mouseup', async () => {
    if (puntoArrastrando) {
        // Guardar nueva posición en Firebase para todos los del grupo
        const batch = db.batch();
        puntoArrastrando.grupo.forEach(item => {
            batch.update(db.collection("layout_puntos").doc(item.id), {
                x: puntoArrastrando.newX, y: puntoArrastrando.newY
            });
        });
        await batch.commit();
        
        puntoArrastrando.element.style.zIndex = 10;
        puntoArrastrando.element.style.cursor = 'grab';
        puntoArrastrando = null;
    }
});

// Mostrar la ventana con la info al hacer clic (Modo Normal)
async function mostrarInfoPuntos(grupo) {
    let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
    
    grupo.forEach(p => {
        let nombre = 'Desconocido', desc = '', foto = '';
        if (p.tipo === 'gabinete') {
            const g = listaEstructuraGabinetes.find(x => x.id === p.refId);
            if (g) { nombre = g.nombre; desc = g.descripcion || 'Sin descripción'; }
        } else if (p.tipo === 'locker') {
            const l = listaEstructuraLockers.find(x => x.id === p.refId);
            if (l) { nombre = l.nombre; desc = l.descripcion || 'Sin descripción'; }
        } else if (p.tipo === 'rack') {
            const r = listaEstructuraRacks.find(x => x.id === p.refId);
            if (r) { nombre = r.nombre; desc = r.descripcion || 'Sin descripción'; }
        }

        html += `
            <div style="background: #f8f9fa; padding: 10px; border-radius: 6px; border-left: 4px solid #e30613; text-align: left;">
                <h4 style="margin: 0 0 5px 0; color: #212529; font-size: 14px;">${nombre}</h4>
                <p style="margin: 0; font-size: 12px; color: #6c757d;">${desc}</p>
                <!-- Aquí podrías agregar la foto si la tienes -->
            </div>
        `;
    });
    
    html += '</div>';
    Swal.fire({ title: 'Información del Elemento', html: html, confirmButtonText: 'Cerrar', confirmButtonColor: '#e30613' });
}

// --- BUSCADOR EN EL LAYOUT ---
function buscarEnLayout(event) {
    event.preventDefault();
    const termino = document.getElementById('buscar-layout').value.toLowerCase().trim();
    if (!termino) return limpiarBusquedaLayout();

    let puntosEncontrados = [];

    // 1. Buscar en Gabinetes
    for (const key in inventarioGabinetes) {
        const info = inventarioGabinetes[key];
        if (info.nombre && info.nombre.toLowerCase().includes(termino)) {
            const gabId = key.split('-')[0]; // Sacar ID del gabinete (ej. G1)
            const punto = puntosLayout.find(p => p.refId === gabId && p.tipo === 'gabinete');
            if (punto) puntosEncontrados.push(punto);
        }
    }

    // 2. Buscar en Lockers
    for (const key in inventarioLockers) {
        const piezas = inventarioLockers[key] || [];
        piezas.forEach(p => {
            const textoCompleto = `${p.nombre} ${p.cliente} ${p.desc}`.toLowerCase();
            if (textoCompleto.includes(termino)) {
                const lockerId = key.split('-')[0]; 
                const punto = puntosLayout.find(pt => pt.refId === lockerId && pt.tipo === 'locker');
                if (punto && !puntosEncontrados.find(pe => pe.id === punto.id)) puntosEncontrados.push(punto);
            }
        });
    }

    // 3. Buscar en Racks/Coupons
    for (const key in inventarioRacks) {
        const piezas = inventarioRacks[key] || [];
        piezas.forEach(p => {
            const textoCompleto = `${p.nombre} ${p.cliente} ${p.desc} ${(p.codigosInternos || []).map(c => c.codigo).join(' ')}`.toLowerCase();
            if (textoCompleto.includes(termino)) {
                const rackId = key.split('-')[0]; 
                const punto = puntosLayout.find(pt => pt.refId === rackId && pt.tipo === 'rack');
                if (punto && !puntosEncontrados.find(pe => pe.id === punto.id)) puntosEncontrados.push(punto);
            }
        });
    }

    // Hacer brillar los puntos encontrados
    limpiarBusquedaLayout(false); // Limpiar brillos anteriores
    if (puntosEncontrados.length > 0) {
        puntosEncontrados.forEach(punto => {
            // Buscamos el div del punto en el mapa y le cambiamos el color temporalmente
            const elementosMapa = document.querySelectorAll('.punto-mapa');
            elementosMapa.forEach(el => {
                // Verificamos si el ID del punto contiene el ID que buscamos
                if (el.id.includes(punto.id)) {
                    el.style.backgroundColor = '#00ff66'; // Verde brillante
                    el.style.boxShadow = '0 0 15px #00ff66';
                    el.style.zIndex = 99;
                    el.classList.add('punto-brillante');
                }
            });
        });
        Toast.fire({ icon: 'success', title: `Se encontraron ${puntosEncontrados.length} ubicaciones` });
    } else {
        Swal.fire({ icon: 'info', title: 'No encontrado', text: 'No se encontraron componentes con ese nombre en el mapa.', confirmButtonColor: '#e30613' });
    }
}

function limpiarBusquedaLayout(borrarTexto = true) {
    if (borrarTexto) document.getElementById('buscar-layout').value = '';
    
    // Quitar el brillo a todos los puntos
    document.querySelectorAll('.punto-mapa').forEach(el => {
        el.style.backgroundColor = ''; // Vuelve a su color original (por CSS o por el estilo en línea)
        el.style.boxShadow = '';
        el.style.zIndex = 10;
        el.classList.remove('punto-brillante');
    });
    
    // Llamamos a renderizar para que se dibujen de nuevo con sus colores originales
    renderizarPuntosLayout(); 
}

// --- VENTANA DE INFORMACIÓN (CLIC EN PUNTO) ---
function mostrarInfoPuntos(grupo) {
    let html = '<div style="display: flex; flex-direction: column; gap: 15px; text-align: left;">';
    
    grupo.forEach(p => {
        let nombre = 'Desconocido', desc = '', foto = '', tipoLabel = '';
        
        if (p.tipo === 'gabinete') {
            const g = listaEstructuraGabinetes.find(x => x.id === p.refId);
            if (g) { 
                nombre = g.nombre; 
                desc = g.descripcion || 'Sin descripción'; 
                // Si en un futuro agregas fotos a los gabinetes, irían aquí
                tipoLabel = '🗄️ Gabinete';
            }
        } else if (p.tipo === 'locker') {
            const l = listaEstructuraLockers.find(x => x.id === p.refId);
            if (l) { nombre = l.nombre; desc = l.descripcion || 'Sin descripción'; tipoLabel = '🔒 Locker'; }
        } else if (p.tipo === 'rack') {
            const r = listaEstructuraRacks.find(x => x.id === p.refId);
            if (r) { nombre = r.nombre; desc = r.descripcion || 'Sin descripción'; tipoLabel = '📐 Rack'; }
        }

        html += `
            <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; border-left: 4px solid #e30613; display: flex; gap: 15px; align-items: center;">
                <div style="flex: 1;">
                    <span style="font-size: 11px; color: #6c757d; font-weight: bold; text-transform: uppercase;">${tipoLabel}</span>
                    <h4 style="margin: 4px 0 6px 0; color: #212529; font-size: 16px;">${nombre}</h4>
                    <p style="margin: 0; font-size: 13px; color: #495057;">${desc}</p>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    Swal.fire({ 
        title: 'Información del Elemento', 
        html: html, 
        confirmButtonText: 'Cerrar', 
        confirmButtonColor: '#e30613',
        width: '600px'
    });
}

function toggleDatosGlobalesLocker() {
    const check = document.getElementById('check-agregar-a-lista-global');
    const seccion = document.getElementById('seccion-global-locker');
    if (check && seccion) {
        seccion.style.display = check.checked ? 'block' : 'none';
    }
}

// =============================================================
// CERRAR MODALES CON LA TECLA ESC
// =============================================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
        // Buscar todos los modales abiertos
        const modalesAbiertos = document.querySelectorAll('.modal');
        modalesAbiertos.forEach(modal => {
            if (modal.style.display === 'block') {
                modal.style.display = 'none';
            }
        });
    }
});

// =============================================================
// REORDENAR ELEMENTOS (SOLO MASTER)
// =============================================================
async function moverElemento(tipo, id, direccion) {
    if (rolActual !== "SUPER_ADMIN") {
        Swal.fire({ icon: 'error', title: 'Access denied', text: 'Only the Master can reorder items.', confirmButtonColor: '#e30613' });
        return;
    }

    let lista, coleccion;
    if (tipo === 'gabinete') {
        lista = [...listaEstructuraGabinetes];
        coleccion = 'config_gabinetes';
    } else if (tipo === 'locker') {
        lista = [...listaEstructuraLockers];
        coleccion = 'config_lockers';
    } else if (tipo === 'rack') {
        lista = [...listaEstructuraRacks];
        coleccion = 'config_racks';
    } else {
        return;
    }

    // Asegurarnos de que todos tengan un orden asignado (por si son datos viejos)
    lista.forEach((item, index) => {
        if (item.orden === undefined || item.orden === null) {
            item.orden = index;
        }
    });

    // Ordenar la lista actual por el campo 'orden' (o por nombre si no tienen)
    lista.sort((a, b) => {
        if (a.orden !== undefined && b.orden !== undefined) return a.orden - b.orden;
        return (a.nombre || '').localeCompare(b.nombre || '');
    });

    const indexActual = lista.findIndex(item => item.id === id);
    if (indexActual === -1) return;

    const nuevoIndex = indexActual + direccion;
    if (nuevoIndex < 0 || nuevoIndex >= lista.length) return; // Ya está en el borde

    // Intercambiar en el arreglo
    const elementoA = lista[indexActual];
    const elementoB = lista[nuevoIndex];
    
    const tempOrden = elementoA.orden;
    elementoA.orden = elementoB.orden;
    elementoB.orden = tempOrden;

    // Guardar en Firebase los dos elementos afectados
    const batch = db.batch();
    const refA = db.collection(coleccion).doc(elementoA.id);
    const refB = db.collection(coleccion).doc(elementoB.id);
    
    batch.update(refA, { orden: elementoA.orden });
    batch.update(refB, { orden: elementoB.orden });

    try {
        await batch.commit();
        // El listener de Firebase actualizará la UI automáticamente
        Toast.fire({ icon: 'success', title: 'Order updated' });
    } catch (error) {
        console.error("Error al reordenar:", error);
        Swal.fire({ icon: 'error', title: 'Error', text: 'Could not update the order.', confirmButtonColor: '#e30613' });
    }
}

// =============================================================
// DRAG & DROP PARA REORDENAR (SOLO MASTER)
// =============================================================
// =============================================================
// DRAG & DROP PARA REORDENAR (SOLO MASTER)
// =============================================================
let elementoArrastrado = null;

function handleDragStart(e) {
    if (rolActual !== "SUPER_ADMIN") return;
    elementoArrastrado = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', e.currentTarget.dataset.id);
    setTimeout(() => { e.currentTarget.style.opacity = '0.4'; }, 0);
}

function handleDragOver(e) {
    if (rolActual !== "SUPER_ADMIN") return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const target = e.currentTarget;
    if (target !== elementoArrastrado && target.dataset.tipo === elementoArrastrado.dataset.tipo) {
        target.style.border = "3px dashed #e30613";
    }
}

async function handleDrop(e) {
    e.preventDefault();
    if (rolActual !== "SUPER_ADMIN") return;
    
    const target = e.currentTarget;
    target.style.border = ""; // Quitar borde de drop
    
    if (elementoArrastrado && target !== elementoArrastrado && target.dataset.tipo === elementoArrastrado.dataset.tipo) {
        const idArrastrado = elementoArrastrado.dataset.id;
        const idTarget = target.dataset.id;
        const tipo = target.dataset.tipo;

        // 1. Determinar qué lista estamos usando
        let lista = [];
        let coleccion = '';
        if (tipo === 'gabinete') { lista = [...listaEstructuraGabinetes]; coleccion = 'config_gabinetes'; }
        else if (tipo === 'locker') { lista = [...listaEstructuraLockers]; coleccion = 'config_lockers'; }
        else if (tipo === 'rack') { lista = [...listaEstructuraRacks]; coleccion = 'config_racks'; }
        else return;

        // 2. Asegurarnos de que todos tengan orden inicial
        lista.forEach((item, index) => {
            if (item.orden === undefined || item.orden === null) item.orden = index;
        });

        // 3. Ordenar la lista temporal para saber dónde estamos parados
        lista.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

        // 4. Encontrar índices
        const indexArrastrado = lista.findIndex(x => x.id === idArrastrado);
        const indexTarget = lista.findIndex(x => x.id === idTarget);

        if (indexArrastrado === -1 || indexTarget === -1) return;

        // 5. Mover el elemento en el arreglo
        const [elementoMovido] = lista.splice(indexArrastrado, 1);
        lista.splice(indexTarget, 0, elementoMovido);

        // 6. Reasignar el nuevo orden numérico a TODOS y guardar
        try {
            const batch = db.batch();
            lista.forEach((item, index) => {
                const ref = db.collection(coleccion).doc(item.id);
                // Usamos {merge: true} para no borrar los otros datos del documento
                batch.set(ref, { orden: index }, { merge: true });
            });
            await batch.commit();
            Toast.fire({ icon: 'success', title: 'Order updated successfully' });
        } catch (error) {
            console.error("Error al guardar orden:", error);
            Swal.fire({ icon: 'error', title: 'Error', text: 'Could not save the new order.' });
        }
    }
    
    if (elementoArrastrado) {
        elementoArrastrado.style.opacity = '1';
        elementoArrastrado = null;
    }
}
// Limpiar el estilo de borde cuando el mouse sale
document.addEventListener('dragleave', (e) => {
    if (e.target.classList && e.target.classList.contains('gabinete-wrapper')) e.target.style.border = "";
    if (e.target.classList && e.target.classList.contains('locker-card')) e.target.style.border = "";
    if (e.target.classList && e.target.classList.contains('rack-card')) e.target.style.border = "";
});

document.addEventListener('dragend', (e) => {
    if (e.target.classList && e.target.classList.contains('gabinete-wrapper')) e.target.style.border = "";
    if (e.target.classList && e.target.classList.contains('locker-card')) e.target.style.border = "";
    if (e.target.classList && e.target.classList.contains('rack-card')) e.target.style.border = "";
});

function irAlMapa(tipo, refId) {
    // Cambiar a la pestaña Layout
    const btnLayout = document.querySelector('.btn-tab[onclick*="tab-layout"]');
    if (btnLayout) btnLayout.click();

    // Esperar un momento a que la pestaña se dibuje y buscar el punto
    setTimeout(() => {
        // Buscar el punto en el mapa que coincida con el tipo y refId
        const puntosEnMapa = document.querySelectorAll('.punto-mapa');
        let encontrado = false;
        
        puntosEnMapa.forEach(el => {
            if (el.id.includes(refId)) {
                // Hacerlo brillar
                el.style.backgroundColor = '#00ff66';
                el.style.boxShadow = '0 0 20px #00ff66';
                el.style.zIndex = '999';
                el.style.transform = 'translate(-50%, -50%) scale(1.5)';
                encontrado = true;
                
                // Quitar el brillo después de 3 segundos
                setTimeout(() => {
                    el.style.backgroundColor = '';
                    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.6)';
                    el.style.zIndex = '10';
                    el.style.transform = 'translate(-50%, -50%) scale(1)';
                }, 3000);
            }
        });

        if (!encontrado) {
            Swal.fire({ icon: 'info', title: 'Not in map', text: 'This item has not been placed on the map yet.', confirmButtonColor: '#e30613' });
        }
    }, 500);
}