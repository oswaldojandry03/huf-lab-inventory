// =============================================================
// INICIALIZACIÓN DIRECTA DE FIREBASE FIRESTORE
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

// Inicializar solo si no existe
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
var db = firebase.firestore();

// Variables globales de sesión y datos
let listaUsuariosFirebase = {};
let usuarioActual = null;
let rolActual = null;

let inventarioGabinetes = {};
let inventarioLockers = {};
let listaNacho = [];
let listaTickets = [];

// =============================================================
// CARGA Y ESCUCHA DE LA BASE DE DATOS
// =============================================================
document.addEventListener("DOMContentLoaded", () => {
    // Forzar renderizado inicial
    if (typeof generarGabinetes === "function") generarGabinetes();
    escucharBaseDatos();
});

function escucharBaseDatos() {
    // Escuchar la colección 'usuarios' donde están tus credenciales
    db.collection("usuarios").onSnapshot((snapshot) => {
        listaUsuariosFirebase = {};
        snapshot.forEach((doc) => {
            listaUsuariosFirebase[doc.id] = doc.data();
        });
        
        // Asegurar que exista el SUPER_ADMIN por defecto
        if (!listaUsuariosFirebase["Jandry"]) {
            db.collection("usuarios").doc("Jandry").set({ 
                pass: "Jandrik.21", 
                rol: "SUPER_ADMIN" 
            });
        }
        if (typeof renderizarTablaUsuarios === "function") renderizarTablaUsuarios();
    });

    // Escuchadores del inventario
    db.collection("gabinetes").onSnapshot((snapshot) => {
        inventarioGabinetes = {};
        snapshot.forEach((doc) => inventarioGabinetes[doc.id] = doc.data());
        if (typeof generarGabinetes === "function") generarGabinetes();
    });

    db.collection("lockers").onSnapshot((snapshot) => {
        inventarioLockers = {};
        snapshot.forEach((doc) => inventarioLockers[doc.id] = doc.data().items || []);
        if (typeof generarTarjetasLockers === "function") generarTarjetasLockers();
    });

    db.collection("catalogo_nacho").onSnapshot((snapshot) => {
        listaNacho = [];
        snapshot.forEach((doc) => listaNacho.push({ firestoreId: doc.id, ...doc.data() }));
        if (typeof renderizarCatalogoNacho === "function") renderizarCatalogoNacho();
    });

    db.collection("tickets").orderBy("fechaSort", "desc").onSnapshot((snapshot) => {
        listaTickets = [];
        snapshot.forEach((doc) => listaTickets.push({ firestoreId: doc.id, ...doc.data() }));
        if (typeof renderizarTicketsNacho === "function") renderizarTicketsNacho();
    });
}

// =============================================================
// FUNCIÓN DE LOGIN SUPER ADMIN (SIN NINGÚN BLOQUEO)
// =============================================================
function iniciarSesion(event) {
    if (event) event.preventDefault();
    
    const inputUser = document.getElementById('usuario') ? document.getElementById('usuario').value.trim() : '';
    const inputPass = document.getElementById('password') ? document.getElementById('password').value.trim() : '';
    const errorContainer = document.getElementById('mensaje-error-login');

    // Validación de respaldo directo para Jandry y credenciales de Firestore
    const esMasterDirecto = (inputUser === "Jandry" && inputPass === "Jandrik.21");
    const esUsuarioValido = listaUsuariosFirebase[inputUser] && listaUsuariosFirebase[inputUser].pass === inputPass;

    if (esMasterDirecto || esUsuarioValido) {
        usuarioActual = inputUser;
        rolActual = esMasterDirecto ? "SUPER_ADMIN" : listaUsuariosFirebase[inputUser].rol;

        // 1. Actualizar barra superior
        const labelUser = document.getElementById('usuario-login');
        if (labelUser) labelUser.textContent = `${usuarioActual} (SUPER_ADMIN)`;

        const btnLogin = document.getElementById('btn-login-trigger');
        if (btnLogin) btnLogin.style.display = 'none';

        const btnLogout = document.getElementById('btn-logout-trigger');
        if (btnLogout) btnLogout.style.display = 'inline-block';

        if (errorContainer) errorContainer.style.display = 'none';

        // 2. Cerrar Modal de Login si está abierto
        if (typeof cerrarModal === "function") {
            cerrarModal('modal-login');
        } else {
            const modal = document.getElementById('modal-login');
            if (modal) modal.style.display = 'none';
        }

        // 3. DESBLOQUEO TOTAL DE LA INTERFAZ
        const pantallaBloqueo = document.getElementById('bloqueo-pantalla');
        if (pantallaBloqueo) pantallaBloqueo.style.display = 'none';

        const contenidoProtegido = document.getElementById('contenido-protegido');
        if (contenidoProtegido) contenidoProtegido.style.display = 'block';

        const navTabs = document.getElementById('nav-tabs-container');
        if (navTabs) navTabs.style.display = 'flex';

        // 4. Activar paneles especiales para SUPER_ADMIN
        const panelMaster = document.getElementById('panel-master-acciones');
        if (panelMaster) panelMaster.style.display = 'flex';

        const panelAdmin = document.getElementById('panel-admin-nacho');
        if (panelAdmin) panelAdmin.style.display = 'block';

        // Refrescar vistas
        if (typeof renderizarTicketsNacho === "function") renderizarTicketsNacho();
        if (typeof generarTarjetasLockers === "function") generarTarjetasLockers();
        if (typeof renderizarCatalogoNacho === "function") renderizarCatalogoNacho();
        if (typeof inicializarGraficas === "function") inicializarGraficas();

    } else {
        if (errorContainer) {
            errorContainer.textContent = "Usuario o contraseña incorrectos.";
            errorContainer.style.display = 'block';
        }
    }
}