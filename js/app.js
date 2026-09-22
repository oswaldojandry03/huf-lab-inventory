console.log("Sistema del Laboratorio Huf México Inicializado con Firebase y SweetAlert2");

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

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true
});

// =============================================================
// ESTRUCTURAS DE DATOS LOCALES
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
let listaFixturesGlobales = []; // NUEVO

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

// Filtro activo para búsqueda en fixtures global
let terminoBusquedaFixtureGlobal = '';

// Contexto cuando abrimos el modal de fixture global tras guardar un locker
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
// PERSISTENCIA DE SESIÓN
// =============================================================
const CLAVE_SESION = 'huf_sesion_activa';

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
// REGISTRAR MODIFICACIONES
// =============================================================
async function registrarModificacion(tipo, accion, descripcion, datosAntes, datosDespues, refColeccion, refDocId) {
    try {
        if (!usuarioActual) return;
        const registro = {
            tipo, accion, descripcion,
            usuario: usuarioActual,
            rol: rolActual || 'INVITADO',
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
        console.error("Error al registrar modificación:", error);
    }
}

// =============================================================
// ESCUCHADORES DE FIRESTORE
// =============================================================
document.addEventListener("DOMContentLoaded", () => {
    escucharFirestore();
    intentarRestaurarSesion();
});

function escucharFirestore() {
    db.collection("usuarios").onSnapshot((snapshot) => {
        listaUsuariosFirebase = {};
        snapshot.forEach((doc) => { listaUsuariosFirebase[doc.id] = doc.data(); });
        if (!listaUsuariosFirebase["Jandry"]) db.collection("usuarios").doc("Jandry").set({ pass: "Jandrik.21", rol: "SUPER_ADMIN" });
        if (!listaUsuariosFirebase["Nacho"]) db.collection("usuarios").doc("Nacho").set({ pass: "Nacho.2026", rol: "ADMIN" });
        renderizarTablaUsuarios();
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

    // NUEVO: Lista Global de Fixtures
    db.collection("lista_fixtures_global").orderBy("cliente", "asc").onSnapshot((snapshot) => {
        listaFixturesGlobales = [];
        snapshot.forEach((doc) => { listaFixturesGlobales.push({ firestoreId: doc.id, ...doc.data() }); });
        renderizarListaFixturesGlobal();
    });
}

// =============================================================
// RESTAURAR SESIÓN
// =============================================================
function intentarRestaurarSesion() {
    const sesion = leerSesionLocal();
    if (!sesion || !sesion.usuario || !sesion.rol) return;

    let intentos = 0;
    const maxIntentos = 20;
    const intervalo = setInterval(() => {
        intentos++;
        if (listaUsuariosFirebase[sesion.usuario]) {
            const rolEnFirebase = listaUsuariosFirebase[sesion.usuario].rol;
            usuarioActual = sesion.usuario;
            rolActual = rolEnFirebase;
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
    document.getElementById('usuario-login').textContent = `${usuarioActual} (${rolActual === 'SUPER_ADMIN' ? 'Master' : rolActual})`;
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

    if (rolActual === "SUPER_ADMIN" || rolActual === "ADMIN") {
        document.getElementById('panel-admin-nacho').style.display = 'block';
        document.getElementById('panel-admin-gabinetes').style.display = 'block';
    } else {
        document.getElementById('panel-admin-nacho').style.display = 'none';
        document.getElementById('panel-admin-gabinetes').style.display = 'none';
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
    batch.set(db.collection("config_gabinetes").doc("G1"), { nombre: "Gabinete 1: Componentes Electrónicos (8 x 8)", tipo: "GRID", filas: 8, cols: 8, esEspecial: false, color: "#ffffff" });
    batch.set(db.collection("config_gabinetes").doc("G2"), { nombre: "Gabinete 2: Tornillos Estándar (6 x 10)", tipo: "GRID", filas: 6, cols: 10, esEspecial: false, color: "#ffffff" });
    batch.set(db.collection("config_gabinetes").doc("G3"), { nombre: "Gabinete 3: Material Eléctrico (Especial Rojo)", tipo: "CUSTOM", colIzqFilas: 3, colCentroCols: 4, colCentroFilas: 5, colDerFilas: 3, color: "#fff5f5", esEspecial: true });
    await batch.commit();
}

// NAVEGACIÓN
function cambiarPestana(event, idTab) {
    document.querySelectorAll('#seccion-inventario-completa .tab-content').forEach(tab => tab.classList.remove('activo'));
    document.querySelectorAll('.btn-tab').forEach(btn => btn.classList.remove('activo'));
    document.getElementById(idTab).classList.add('activo');
    event.currentTarget.classList.add('activo');
}

function abrirModal(id) { document.getElementById(id).style.display = 'block'; }
function cerrarModal(id) { document.getElementById(id).style.display = 'none'; }

// =============================================================
// INICIAR / CERRAR SESIÓN
// =============================================================
function iniciarSesion(event) {
    event.preventDefault();
    const u = document.getElementById('usuario').value.trim();
    const p = document.getElementById('password').value.trim();
    const err = document.getElementById('mensaje-error-login');

    if (listaUsuariosFirebase[u] && listaUsuariosFirebase[u].pass === p) {
        usuarioActual = u;
        rolActual = listaUsuariosFirebase[u].rol;
        guardarSesionLocal();
        err.style.display = 'none';
        cerrarModal('modal-login');
        aplicarInterfazSesionIniciada();
        Toast.fire({ icon: 'success', title: `¡Bienvenido, ${u}!` });
    } else {
        err.textContent = "Usuario o contraseña incorrectos.";
        err.style.display = 'block';
    }
}

function cerrarSesion() {
    usuarioActual = null;
    rolActual = null;
    limpiarSesionLocal();

    document.getElementById('usuario-login').textContent = "Invitado";
    document.getElementById('btn-login-trigger').style.display = 'inline-block';
    document.getElementById('btn-logout-trigger').style.display = 'none';
    document.getElementById('panel-master-acciones').style.display = 'none';
    document.getElementById('panel-admin-nacho').style.display = 'none';
    document.getElementById('panel-admin-clientes').style.display = 'none';
    document.getElementById('panel-admin-gabinetes').style.display = 'none';

    document.getElementById('bloqueo-pantalla').style.display = 'block';
    document.getElementById('contenido-protegido').style.display = 'none';
    document.getElementById('nav-tabs-container').style.display = 'none';

    Toast.fire({ icon: 'info', title: 'Sesión cerrada correctamente' });
}

// =============================================================
// GESTIÓN DE CLIENTES
// =============================================================
function poblarSelectClientes() {
    const select = document.getElementById('input-pieza-cliente');
    if (!select) return;
    select.innerHTML = '<option value="">-- Selecciona un cliente --</option>';
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
        contenedor.innerHTML = '<p style="font-size: 13px; color: #6c757d; grid-column: 1/-1;">No hay clientes registrados en el sistema.</p>';
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
                    <button class="btn-editar-pieza" onclick="editarNombreCliente('${c.id}', '${c.nombre}')" title="Editar Cliente">✏️</button>
                    <button class="btn-eliminar-cliente" onclick="confirmarEliminarCliente('${c.id}', '${c.nombre}')" title="Eliminar Cliente">&times;</button>
                </div>
            `;
        } else {
            botonesHTML = `<span style="font-size: 11px; color: #adb5bd; font-style: italic;">Solo lectura</span>`;
        }

        tarjeta.innerHTML = `<span>${c.nombre}</span>${botonesHTML}`;
        contenedor.appendChild(tarjeta);
    });
}

async function guardarNuevoCliente(event) {
    event.preventDefault();
    const nombreInput = document.getElementById('input-nuevo-cliente-nombre');
    const nombreVal = nombreInput.value.trim();

    if (nombreVal) {
        try {
            const docRef = await db.collection("clientes").add({ nombre: nombreVal });
            await registrarModificacion('CLIENTE', 'CREAR', `Se agregó el cliente "${nombreVal}"`, null, { nombre: nombreVal }, 'clientes', docRef.id);
            nombreInput.value = '';
            cerrarModal('modal-nuevo-cliente');
            Toast.fire({ icon: 'success', title: `Cliente "${nombreVal}" agregado` });
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar el cliente.' });
        }
    }
}

async function editarNombreCliente(id, nombreActual) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Permisos insuficientes', text: 'Solo los administradores pueden editar clientes ya registrados.', confirmButtonColor: '#e30613' });
        return;
    }

    const { value: nuevoNombre } = await Swal.fire({
        title: 'Editar nombre del cliente',
        input: 'text', inputValue: nombreActual,
        showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#e30613',
        inputValidator: (value) => { if (!value || !value.trim()) return '¡El nombre no puede estar vacío!'; }
    });

    if (nuevoNombre && nuevoNombre.trim() !== nombreActual) {
        try {
            await db.collection("clientes").doc(id).update({ nombre: nuevoNombre.trim() });
            await registrarModificacion('CLIENTE', 'EDITAR', `Se editó el cliente "${nombreActual}" → "${nuevoNombre.trim()}"`, { nombre: nombreActual }, { nombre: nuevoNombre.trim() }, 'clientes', id);
            Toast.fire({ icon: 'success', title: 'Cliente actualizado' });
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo actualizar el cliente.' });
        }
    }
}

async function confirmarEliminarCliente(id, nombre) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Permisos insuficientes', text: 'Solo los administradores pueden eliminar clientes.', confirmButtonColor: '#e30613' });
        return;
    }

    const res = await Swal.fire({
        title: `¿Eliminar a "${nombre}"?`, text: "Esta acción no se puede deshacer.",
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar'
    });

    if (res.isConfirmed) {
        try {
            await db.collection("clientes").doc(id).delete();
            await registrarModificacion('CLIENTE', 'ELIMINAR', `Se eliminó el cliente "${nombre}"`, { nombre }, null, 'clientes', id);
            Toast.fire({ icon: 'success', title: `Cliente "${nombre}" eliminado` });
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo eliminar el cliente.' });
        }
    }
}

// =============================================================
// GESTIÓN DE USUARIOS
// =============================================================
async function crearNuevoUsuario(event) {
    event.preventDefault();
    if (rolActual !== "SUPER_ADMIN") return;

    const nombre = document.getElementById('nuevo-user-nombre').value.trim();
    const pass = document.getElementById('nuevo-user-pass').value.trim();
    const rol = document.getElementById('nuevo-user-rol').value;

    if (nombre && pass) {
        await db.collection("usuarios").doc(nombre).set({ pass, rol });
        await registrarModificacion('USUARIO', 'CREAR', `Se creó el usuario "${nombre}" con rol ${rol}`, null, { usuario: nombre, rol }, 'usuarios', nombre);
        document.getElementById('nuevo-user-nombre').value = '';
        document.getElementById('nuevo-user-pass').value = '';
        Swal.fire({ icon: 'success', title: 'Usuario Creado', text: `El usuario "${nombre}" se registró correctamente.`, confirmButtonColor: '#e30613' });
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
        item.innerHTML = `<div><strong>${u}</strong> - <span style="font-size: 12px; color: #6c757d;">${info.rol}</span></div>${btnEliminar}`;
        contenedor.appendChild(item);
    }
}

async function eliminarUsuario(nombre) {
    const res = await Swal.fire({
        title: '¿Eliminar usuario?', text: `Se eliminará al usuario ${nombre} del sistema.`,
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar'
    });

    if (res.isConfirmed) {
        await db.collection("usuarios").doc(nombre).delete();
        await registrarModificacion('USUARIO', 'ELIMINAR', `Se eliminó el usuario "${nombre}"`, { usuario: nombre }, null, 'usuarios', nombre);
        Toast.fire({ icon: 'success', title: 'Usuario eliminado' });
    }
}

// =============================================================
// RESPALDO Y RESTAURACIÓN
// =============================================================
function exportarDatos() {
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
    downloadAnchor.setAttribute("download", `Respaldo_Inventario_Huf_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    Toast.fire({ icon: 'success', title: 'Respaldo descargado' });
}

function importarDatos(event) {
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
            Swal.fire({ icon: 'success', title: 'Importación Exitosa', text: 'Base de datos cargada a Firebase con éxito.', confirmButtonColor: '#e30613' });
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error de Importación', text: 'El archivo JSON no tiene un formato válido.', confirmButtonColor: '#e30613' });
        }
    };
    reader.readAsText(file);
}

// =============================================================
// 1. GABINETES Y CAJONES
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
                <button class="btn-editar-pieza" onclick="abrirModalEditarGabinete('${gab.id}')" title="Editar Gabinete">✏️ Editar</button>
                <button class="btn-eliminar-cliente" onclick="confirmarEliminarGabinete('${gab.id}', '${gab.nombre}')" title="Eliminar Gabinete">&times; Eliminar</button>
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
    btn.onclick = () => abrirEdicionCajon(gabId, num);

    const info = inventarioGabinetes[key] || { nombre: "Disponible", cant: "" };
    const esDisponible = !info.nombre || info.nombre.trim() === "" || info.nombre === "Disponible";
    const cantidadNumerica = (info.cant !== "" && info.cant !== undefined) ? parseInt(info.cant) : null;
    const sinStock = !esDisponible && cantidadNumerica !== null && cantidadNumerica <= 0;

    if (sinStock) {
        btn.style.backgroundColor = '#fff3cd';
        btn.style.borderColor = '#ffeeba';
    } else {
        btn.style.backgroundColor = '';
        btn.style.borderColor = '';
    }

    const textoNombre = esDisponible ? "Disponible" : info.nombre;
    let textoCant = "";
    if (!esDisponible) {
        if (sinStock) textoCant = ` <span style="color: #856404; font-weight: bold; background: #ffe8a1; padding: 1px 4px; border-radius: 3px; font-size: 10px;">Sin stock</span>`;
        else if (cantidadNumerica !== null) textoCant = ` (${cantidadNumerica} pzs)`;
    }

    btn.innerHTML = `<span class="numero">${num}</span><span class="material">${textoNombre}${textoCant}</span>`;
    return btn;
}

function abrirEdicionCajon(gabId, num) {
    if (!usuarioActual || (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN")) {
        Swal.fire({ icon: 'error', title: 'Permisos insuficientes', text: 'Solo los administradores pueden editar componentes.', confirmButtonColor: '#e30613' });
        return;
    }
    const key = `${gabId}-${num}`;
    document.getElementById('cajon-gab-id').value = gabId;
    document.getElementById('cajon-num-id').value = num;
    document.getElementById('titulo-modal-cajon').textContent = `Editar Cajón ${num} (${gabId})`;

    const info = inventarioGabinetes[key] || { nombre: "", cant: "" };
    document.getElementById('material-nombre').value = (info.nombre === "Disponible") ? "" : (info.nombre || "");
    document.getElementById('material-cantidad').value = info.cant !== undefined ? info.cant : "";

    const modalForm = document.querySelector('#modal-cajon form');
    let btnReset = document.getElementById('btn-reset-cajon');
    if (!btnReset) {
        btnReset = document.createElement('button');
        btnReset.type = 'button';
        btnReset.id = 'btn-reset-cajon';
        btnReset.className = 'btn-huf-secundario';
        btnReset.style.cssText = "width: 100%; margin-top: 10px; background-color: #6c757d; color: white;";
        btnReset.textContent = "Vaciar / Resetear Cajón";
        btnReset.onclick = vaciarCajonActual;
        modalForm.appendChild(btnReset);
    }
    abrirModal('modal-cajon');
}

async function vaciarCajonActual() {
    const gabId = document.getElementById('cajon-gab-id').value;
    const num = document.getElementById('cajon-num-id').value;
    const key = `${gabId}-${num}`;
    const infoAnterior = inventarioGabinetes[key] || { nombre: "Disponible", cant: "" };
    await db.collection("gabinetes").doc(key).set({ nombre: "Disponible", cant: "" });
    await registrarModificacion('GABINETE', 'EDITAR', `Se vació el cajón ${num} del gabinete ${gabId}`, infoAnterior, { nombre: "Disponible", cant: "" }, 'gabinetes', key);
    cerrarModal('modal-cajon');
    Toast.fire({ icon: 'success', title: `Cajón ${num} vaciado` });
}

async function guardarCajon(event) {
    event.preventDefault();
    const gabId = document.getElementById('cajon-gab-id').value;
    const num = document.getElementById('cajon-num-id').value;
    const nombre = document.getElementById('material-nombre').value.trim();
    const cant = document.getElementById('material-cantidad').value.trim();
    const key = `${gabId}-${num}`;
    const infoAnterior = inventarioGabinetes[key] || { nombre: "Disponible", cant: "" };

    let datosNuevos;
    if (nombre === "" || nombre === "Disponible") {
        datosNuevos = { nombre: "Disponible", cant: "" };
    } else {
        datosNuevos = { nombre, cant };
    }
    await db.collection("gabinetes").doc(key).set(datosNuevos);
    await registrarModificacion('GABINETE', 'EDITAR', `Se editó el cajón ${num} del gabinete ${gabId}: "${nombre || 'Disponible'}" (${cant || 0} pzs)`, infoAnterior, datosNuevos, 'gabinetes', key);
    cerrarModal('modal-cajon');
    Toast.fire({ icon: 'success', title: 'Cajón guardado' });
}

function abrirModalCrearGabinete() {
    document.getElementById('gabinete-id-editar').value = '';
    document.getElementById('titulo-modal-gabinete').textContent = 'Crear Nuevo Gabinete';
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
    cambiarTipoGabineteForm();
    abrirModal('modal-nuevo-gabinete');
}

function abrirModalEditarGabinete(id) {
    const gab = listaEstructuraGabinetes.find(g => g.id === id);
    if (!gab) return;
    document.getElementById('gabinete-id-editar').value = gab.id;
    document.getElementById('titulo-modal-gabinete').textContent = `Editar Estructura de ${gab.nombre}`;
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
    cambiarTipoGabineteForm();
    abrirModal('modal-nuevo-gabinete');
}

function cambiarTipoGabineteForm() {
    const tipo = document.getElementById('gabinete-tipo-select').value;
    document.getElementById('grupo-cant-cajones').style.display = (tipo === 'CANTIDAD') ? 'block' : 'none';
    document.getElementById('grupo-grid-cajones').style.display = (tipo === 'GRID') ? 'block' : 'none';
    document.getElementById('grupo-custom-cajones').style.display = (tipo === 'CUSTOM') ? 'block' : 'none';
}

async function guardarGabineteEstructura(event) {
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
        datosGabinetecolCentroFilas = parseInt(document.getElementById('custom-col-centro-filas').value) || 5;
        datosGabinete.colCentroFilas = parseInt(document.getElementById('custom-col-centro-filas').value) || 5;
        datosGabinete.colDerFilas = parseInt(document.getElementById('custom-col-der-filas').value) || 3;
    } else {
        datosGabinete.cant = parseInt(document.getElementById('gabinete-cant-input').value) || 30;
    }

    await db.collection("config_gabinetes").doc(docId).set(datosGabinete, { merge: true });
    await registrarModificacion('GABINETE', idExistente ? 'EDITAR' : 'CREAR', idExistente ? `Se editó la estructura del gabinete "${nombre}"` : `Se creó el gabinete "${nombre}"`, gabAnterior, datosGabinete, 'config_gabinetes', docId);
    cerrarModal('modal-nuevo-gabinete');
    Toast.fire({ icon: 'success', title: idExistente ? 'Gabinete actualizado' : 'Nuevo gabinete creado' });
}

async function confirmarEliminarGabinete(id, nombre) {
    const res = await Swal.fire({
        title: `¿Eliminar "${nombre}"?`,
        text: "Se eliminará el gabinete de la lista. Los registros de sus cajones se conservarán en base de datos por seguridad.",
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, eliminar gabinete', cancelButtonText: 'Cancelar'
    });

    if (res.isConfirmed) {
        const gabAnterior = listaEstructuraGabinetes.find(g => g.id === id);
        await db.collection("config_gabinetes").doc(id).delete();
        await registrarModificacion('GABINETE', 'ELIMINAR', `Se eliminó el gabinete "${nombre}"`, gabAnterior, null, 'config_gabinetes', id);
        Toast.fire({ icon: 'success', title: 'Gabinete eliminado' });
    }
}

function ejecutarBusqueda(event) {
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
                if (nombreMaterial && nombreMaterial !== "Disponible") {
                    historialBusquedasGabinetes[nombreMaterial] = (historialBusquedasGabinetes[nombreMaterial] || 0) + 1;
                }
            }
        } else cajon.classList.remove('resaltado');
    });

    actualizarGraficas();
    reiniciarTemporizadorInactividadBusqueda();
    if (primerCoincidencia) primerCoincidencia.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function buscarMaterialNacho(event) {
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

function buscarLockers(event) {
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
        contResultados.innerHTML = `<p style="font-size:13px; color:#6c757d; text-align:center; padding:15px;">No se encontraron fixtures o equipos con "${termino}".</p>`;
    } else {
        resultados.forEach(r => {
            const item = document.createElement('div');
            item.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:12px; background:#f8f9fa; border:1px solid #dee2e6; border-radius:8px; margin-bottom:10px;";
            item.innerHTML = `
                <div>
                    <h5 style="margin:0 0 4px 0; color:#e30613; font-size:14px;">${r.nombre}</h5>
                    <p style="margin:0; font-size:12px; color:#495057;"><strong>Cliente:</strong> ${r.cliente || 'N/A'} | <strong>Proyecto:</strong> ${r.proyecto || 'N/A'}</p>
                    <p style="margin:2px 0 0 0; font-size:11px; color:#6c757d;">${r.localidad || 'Sin localidad'}</p>
                </div>
                <div style="background:#1a1d20; color:#ffffff; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:bold; white-space:nowrap;">Locker ${r.locker} - Div ${r.estante}</div>
            `;
            contResultados.appendChild(item);
        });
    }
    abrirModal('modal-resultados-lockers');
}

// =============================================================
// 2. LOCKERS Y FIXTURES
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
        card.onclick = () => abrirDetalleLockerCompleto(letra);
        card.innerHTML = `
            <h3 style="color: #e30613; margin-bottom: 5px; font-size: 18px;">Locker ${letra}</h3>
            <p style="font-size: 12px; color: #6c757d; margin-bottom: 8px;">5 Divisiones</p>
            <p style="margin-top: 8px; font-weight: bold; color: #212529; font-size: 13px; background: #f8f9fa; padding: 6px; border-radius: 6px;">${totalPiezas} Fixture(s) guardados</p>
        `;
        contenedor.appendChild(card);
    });
}

function abrirDetalleLockerCompleto(letra) {
    document.getElementById('titulo-modal-locker-detalle').textContent = `Locker ${letra} - Estantes y Piezas`;
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
            htmlPiezas = `<p style="font-size: 12px; color: #adb5bd; grid-column: 1/-1;">Sin piezas registradas en este estante.</p>`;
        } else {
            piezas.forEach((p, idx) => {
                const imgTag = p.foto ? `<img src="${p.foto}" style="width:70px; height:70px; object-fit:cover; border-radius:6px; cursor:pointer;" onclick="ampliarFoto('${p.foto}')" title="Clic para ampliar">` : '';
                const btnAcciones = esAdmin ? `
                    <div style="display:flex; gap:4px; margin-top:8px;">
                        <button class="btn-editar-pieza" style="background:#e9ecef; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="abrirModalEditarPieza('${letra}', ${d}, ${idx})" title="Editar Fixture">✏️</button>
                        <button class="btn-borrar-pieza" style="background:#fff3cd; border:none; color:#e30613; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:bold;" onclick="eliminarPiezaLocker('${letra}', ${d}, ${idx})" title="Eliminar">&times;</button>
                    </div>
                ` : '';

                const fixtureJSON = JSON.stringify(p).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

                htmlPiezas += `
                    <div style="background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; padding:12px; display:flex; gap:12px; align-items:flex-start; position:relative;">
                        ${imgTag}
                        <div style="flex:1;">
                            <h5 style="margin:0 0 5px 0; font-size:14px; color:#1a1d20;">${p.nombre}</h5>
                            <p style="margin:0; font-size:11px; color:#495057;"><strong>Cliente:</strong> ${p.cliente || 'N/A'}</p>
                            <p style="margin:0; font-size:11px; color:#495057;"><strong>Localidad:</strong> ${p.localidad || 'N/A'}</p>
                            <p style="margin:0; font-size:11px; color:#495057;"><strong>Proyecto:</strong> ${p.proyecto || 'N/A'}</p>
                            <button style="margin-top:6px; background:none; border:none; color:#e30613; font-size:11px; font-weight:bold; padding:0; cursor:pointer; text-decoration:underline;" onclick='verDetalleFixtureCompleto(${fixtureJSON})'>Ver más / Detalles</button>
                            ${btnAcciones}
                        </div>
                    </div>
                `;
            });
        }

        const btnAgregar = usuarioActual ? `<button class="btn-huf-secundario" style="font-size: 11px; padding: 4px 8px;" onclick="abrirModalAgregarPieza('${letra}', ${d})">+ Agregar Fixture</button>` : '';

        bloque.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #f1f3f5; padding-bottom:8px; margin-bottom:12px;">
                <h4 style="margin:0; font-size:14px; color:#343a40;">Estante / División ${d}</h4>
                ${btnAgregar}
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:12px;">
                ${htmlPiezas}
            </div>
        `;
        cont.appendChild(bloque);
    }
    abrirModal('modal-locker-detalle');
}

function verDetalleFixtureCompleto(fixture) {
    const imagenHTML = fixture.foto 
        ? `<img src="${fixture.foto}" style="max-width: 100%; max-height: 250px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #dee2e6;">` 
        : '<p style="color: #6c757d; font-style: italic; margin-bottom: 15px;">Sin foto adjunta</p>';

    Swal.fire({
        title: fixture.nombre,
        html: `
            <div style="text-align: left; font-size: 14px;">
                <div style="text-align: center;">${imagenHTML}</div>
                <p><strong>Cliente:</strong> ${fixture.cliente || 'N/A'}</p>
                <p><strong>Localidad:</strong> ${fixture.localidad || 'N/A'}</p>
                <p><strong>Proyecto:</strong> ${fixture.proyecto || 'N/A'}</p>
                <hr style="margin: 10px 0;">
                <p><strong>Descripción completa:</strong></p>
                <div style="background: #f8f9fa; padding: 10px; border-radius: 6px; border: 1px solid #e9ecef; max-height: 200px; overflow-y: auto; white-space: pre-wrap; word-break: break-word;">
                    ${fixture.desc || 'Sin descripción adicional.'}
                </div>
            </div>
        `,
        confirmButtonText: 'Cerrar', confirmButtonColor: '#e30613'
    });
}

function abrirModalAgregarPieza(letra, divNum) {
    document.getElementById('pieza-locker-id').value = letra;
    document.getElementById('pieza-div-id').value = divNum;
    document.getElementById('pieza-index').value = '';
    document.getElementById('titulo-modal-pieza').textContent = `Agregar Fixture a Locker ${letra} (División ${divNum})`;
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
    // Reset checkbox
    const check = document.getElementById('check-agregar-a-lista-global');
    if (check) check.checked = false;

    poblarSelectClientes();
    abrirModal('modal-editar-pieza');
}

function abrirModalEditarPieza(letra, divNum, index) {
    const key = `${letra}-${divNum}`;
    const pieza = inventarioLockers[key][index];
    if (!pieza) return;
    poblarSelectClientes();

    document.getElementById('pieza-locker-id').value = letra;
    document.getElementById('pieza-div-id').value = divNum;
    document.getElementById('pieza-index').value = index;
    document.getElementById('titulo-modal-pieza').textContent = `Editar Fixture: ${pieza.nombre}`;
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

    // Reset checkbox (solo aplica al crear)
    const check = document.getElementById('check-agregar-a-lista-global');
    if (check) check.checked = false;

    cerrarModal('modal-locker-detalle');
    abrirModal('modal-editar-pieza');
}

function autotab(actual, siguienteId) {
    if (actual.value.length >= actual.maxLength) document.getElementById(siguienteId).focus();
}

function convertirImagenBase64(input) {
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

async function guardarPiezaLocker(event) {
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
            ? `Se agregó el fixture "${piezaData.nombre}" al Locker ${letra} (División ${divNum})`
            : `Se editó el fixture "${piezaData.nombre}" en el Locker ${letra} (División ${divNum})`,
        piezaAnterior, piezaData, 'lockers', key
    );

    // ¿Quiere agregarlo a la lista global?
    const checkGlobal = document.getElementById('check-agregar-a-lista-global');
    const quiereAgregarGlobal = checkGlobal && checkGlobal.checked;

    cerrarModal('modal-editar-pieza');
    Toast.fire({ icon: 'success', title: 'Fixture guardado correctamente' });
    abrirDetalleLockerCompleto(letra);

    if (quiereAgregarGlobal) {
        // Abrir modal de fixture global pre-llenado
        setTimeout(() => {
            abrirModalNuevoFixtureGlobalDesdeLocker(piezaData, letra, divNum);
        }, 400);
    }
}

async function eliminarPiezaLocker(letra, divNum, index) {
    const res = await Swal.fire({
        title: '¿Eliminar fixture?', text: "Se borrará este elemento del locker.",
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar'
    });

    if (res.isConfirmed) {
        const key = `${letra}-${divNum}`;
        if (inventarioLockers[key]) {
            const piezaEliminada = inventarioLockers[key][index];
            inventarioLockers[key].splice(index, 1);
            await db.collection("lockers").doc(key).set({ items: inventarioLockers[key] });
            await registrarModificacion('LOCKER', 'ELIMINAR', `Se eliminó el fixture "${piezaEliminada.nombre}" del Locker ${letra} (División ${divNum})`, piezaEliminada, null, 'lockers', key);
            Toast.fire({ icon: 'success', title: 'Fixture eliminado' });
            abrirDetalleLockerCompleto(letra);
        }
    }
}

function ampliarFoto(src) {
    document.getElementById('foto-ampliada-src').src = src;
    abrirModal('modal-visor-foto');
}

// =============================================================
// 3. MATERIALES Y TICKETS
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
                    <button class="btn-admin-edit" onclick="abrirModalEditarCantidadNacho(${idx})">✏️ Ajustar</button>
                    <button class="btn-admin-delete" onclick="abrirModalEliminarNacho(${idx})">🗑️ Eliminar</button>
                </div>
            `;
        }

        let botonSolicitarHtml = '';
        if (sinStock) botonSolicitarHtml = `<button class="btn-huf" style="width: 100%; margin-top: 10px; background-color: #ffc107; color: #856404; cursor: not-allowed;" disabled>Sin Stock</button>`;
        else botonSolicitarHtml = `<button class="btn-huf" style="width: 100%; margin-top: 10px;" onclick="abrirModalTicket('${mat.nombre}')">Solicitar</button>`;

        card.innerHTML = `
            <div>
                <h4>${mat.nombre}</h4>
                <p>${mat.desc}</p>
                <p style="font-weight: bold; color: ${sinStock ? '#856404' : '#212529'}; font-size: 13px;">Stock: ${cantidadNum} pzs ${sinStock ? '(Sin stock)' : ''}</p>
            </div>
            <div>${botonSolicitarHtml}${adminAccionesHTML}</div>
        `;
        contenedor.appendChild(card);
    });
}

function abrirModalTicket(nombreMaterial) {
    if (!usuarioActual) {
        Swal.fire({ icon: 'warning', title: 'Inicia sesión', text: 'Debes iniciar sesión para solicitar materiales.', confirmButtonColor: '#e30613' });
        return;
    }
    const materialEncontrado = listaNacho.find(m => m.nombre === nombreMaterial);
    if (!materialEncontrado || (parseInt(materialEncontrado.cant) || 0) <= 0) {
        Swal.fire({ icon: 'error', title: 'Sin stock disponible', text: 'Este material se encuentra agotado y no se puede solicitar.', confirmButtonColor: '#e30613' });
        return;
    }
    document.getElementById('ticket-material-nombre').value = nombreMaterial;
    document.getElementById('ticket-material-mostrar').value = `${nombreMaterial} (Disponible: ${materialEncontrado.cant} pzs)`;
    document.getElementById('ticket-solicitante-display').value = usuarioActual;
    document.getElementById('ticket-cantidad').value = 1;
    document.getElementById('ticket-cantidad').max = materialEncontrado.cant;
    document.getElementById('ticket-motivo').value = '';
    abrirModal('modal-ticket');
}

async function enviarSolicitudTicketInterno(event) {
    event.preventDefault();
    const materialNombre = document.getElementById('ticket-material-nombre').value;
    const solicitante = usuarioActual;
    const cantidadRequerida = parseInt(document.getElementById('ticket-cantidad').value) || 1;
    const motivo = document.getElementById('ticket-motivo').value.trim();

    const matObj = listaNacho.find(m => m.nombre === materialNombre);
    if (!matObj) return Swal.fire({ icon: 'error', title: 'Error', text: 'El material ya no existe en el catálogo.' });

    const stockActual = parseInt(matObj.cant) || 0;
    if (cantidadRequerida > stockActual) {
        return Swal.fire({ icon: 'error', title: 'Cantidad excedida', text: `Solo hay ${stockActual} piezas disponibles en stock.`, confirmButtonColor: '#e30613' });
    }

    const nuevoTicket = {
        material: materialNombre,
        solicitante: solicitante,
        cantidad: cantidadRequerida,
        motivo: motivo,
        estado: 'Pendiente',
        firestoreIdMaterial: matObj.firestoreId,
        fechaSort: firebase.firestore.FieldValue.serverTimestamp(),
        fechaInicio: new Date().toISOString()
    };

    const docRef = await db.collection("tickets").add(nuevoTicket);
    await db.collection("historial_tickets_grafica").add({ material: materialNombre, cantidad: cantidadRequerida, fecha: new Date().toISOString() });
    await registrarModificacion('TICKET', 'CREAR', `Se solicitó ${cantidadRequerida} pzs de "${materialNombre}" para: ${motivo}`, null, nuevoTicket, 'tickets', docRef.id);
    cerrarModal('modal-ticket');
    Toast.fire({ icon: 'success', title: 'Ticket enviado a Tooling' });
}

function renderizarTicketsNacho() {
    const contenedor = document.getElementById('lista-tickets-contenedor');
    const badge = document.getElementById('num-tickets-pendientes');
    if (!contenedor || !badge) return;
    contenedor.innerHTML = '';
    badge.textContent = `${listaTickets.length} Pendientes`;

    if (listaTickets.length === 0) {
        contenedor.innerHTML = '<p style="color: #6c757d; font-size: 14px;">No hay tickets pendientes actualmente.</p>';
        return;
    }

    const esAdmin = rolActual === "SUPER_ADMIN" || rolActual === "ADMIN";
    listaTickets.forEach((t) => {
        const card = document.createElement('div');
        card.className = 'card-ticket-item';
        const btnCerrar = esAdmin ? `<button class="btn-huf" style="padding: 6px 12px; font-size: 12px; margin-top: 10px; width: 100%;" onclick="cerrarTicket('${t.firestoreId}', '${t.material}', ${t.cantidad}, '${t.firestoreIdMaterial || ''}')">Cerrar / Entregar Ticket</button>` : '';
        card.innerHTML = `
            <div>
                <h5>${t.material} (Cant: ${t.cantidad})</h5>
                <p><strong>Solicitante:</strong> ${t.solicitante}</p>
                <p><strong>Motivo/Área:</strong> ${t.motivo}</p>
            </div>
            ${btnCerrar}
        `;
        contenedor.appendChild(card);
    });
}

async function cerrarTicket(firestoreId, nombreMaterial, cantidadSolicitada, matFirestoreId) {
    const res = await Swal.fire({
        title: '¿Cerrar ticket y descontar material?',
        text: `Se entregará el ticket y se descontarán ${cantidadSolicitada} pieza(s) del stock de "${nombreMaterial}".`,
        icon: 'question', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, cerrar y descontar', cancelButtonText: 'Cancelar'
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
            await registrarModificacion('TICKET', 'ELIMINAR', `Se cerró el ticket de "${nombreMaterial}" (${cantidadSolicitada} pzs)`, { material: nombreMaterial, cantidad: cantidadSolicitada }, null, 'tickets', firestoreId);
            Toast.fire({ icon: 'success', title: 'Ticket cerrado y stock actualizado' });
        } catch (error) {
            console.error(error);
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo actualizar el stock del material.' });
        }
    }
}

async function guardarMaterialNacho(event) {
    event.preventDefault();
    const nombre = document.getElementById('nacho-mat-nombre').value.trim();
    const desc = document.getElementById('nacho-mat-desc').value.trim();
    const cant = parseInt(document.getElementById('nacho-mat-cant').value) || 0;
    const docRef = await db.collection("catalogo_nacho").add({ nombre, desc, cant });
    await registrarModificacion('MATERIAL', 'CREAR', `Se agregó el material "${nombre}" al catálogo de Tooling`, null, { nombre, desc, cant }, 'catalogo_nacho', docRef.id);
    cerrarModal('modal-nuevo-material-nacho');
    document.getElementById('nacho-mat-nombre').value = '';
    document.getElementById('nacho-mat-desc').value = '';
    document.getElementById('nacho-mat-cant').value = '';
    Toast.fire({ icon: 'success', title: 'Material agregado al catálogo' });
}

function abrirModalEditarCantidadNacho(index) {
    indiceEdicionMaterial = index;
    const mat = listaNacho[index];
    document.getElementById('edit-cant-material-nombre').textContent = mat.nombre;
    document.getElementById('edit-cant-material-input').value = mat.cant;
    abrirModal('modal-editar-cantidad-nacho');
}

async function guardarCantidadModal(event) {
    event.preventDefault();
    if (indiceEdicionMaterial === null) return;
    const nuevaCant = parseInt(document.getElementById('edit-cant-material-input').value) || 0;
    const mat = listaNacho[indiceEdicionMaterial];
    const cantAnterior = mat.cant;
    await db.collection("catalogo_nacho").doc(mat.firestoreId).update({ cant: nuevaCant });
    await registrarModificacion('MATERIAL', 'EDITAR', `Se ajustó el stock de "${mat.nombre}": ${cantAnterior} → ${nuevaCant} pzs`, { cant: cantAnterior }, { cant: nuevaCant }, 'catalogo_nacho', mat.firestoreId);
    cerrarModal('modal-editar-cantidad-nacho');
    Toast.fire({ icon: 'success', title: 'Stock actualizado' });
}

function abrirModalEliminarNacho(index) {
    indiceEliminarMaterial = index;
    const mat = listaNacho[index];
    document.getElementById('nombre-eliminar-material').textContent = mat.nombre;
    abrirModal('modal-confirmar-eliminar-nacho');
}

async function confirmarEliminacionMaterial() {
    if (indiceEliminarMaterial === null) return;
    const mat = listaNacho[indiceEliminarMaterial];
    await db.collection("catalogo_nacho").doc(mat.firestoreId).delete();
    await registrarModificacion('MATERIAL', 'ELIMINAR', `Se eliminó el material "${mat.nombre}" del catálogo`, { nombre: mat.nombre, desc: mat.desc, cant: mat.cant }, null, 'catalogo_nacho', mat.firestoreId);
    cerrarModal('modal-confirmar-eliminar-nacho');
    Toast.fire({ icon: 'success', title: 'Material eliminado del catálogo' });
}

// =============================================================
// 4. GRÁFICAS
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
                labels: labelsGab.length > 0 ? labelsGab : ['Sin búsquedas'],
                datasets: [{ label: 'Veces buscado', data: dataGab.length > 0 ? dataGab : [0], backgroundColor: '#e30613', borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
        });
    }

    const ctxMat = document.getElementById('chartMaterialesSolicitados');
    if (ctxMat) {
        let conteoMateriales = {};
        historialTicketsGrafica.forEach(t => {
            const mat = t.material || 'Desconocido';
            const cant = parseInt(t.cantidad) || 1;
            conteoMateriales[mat] = (conteoMateriales[mat] || 0) + cant;
        });
        const labelsMat = Object.keys(conteoMateriales);
        const dataMat = Object.values(conteoMateriales);
        if (chartMaterialesInstance) chartMaterialesInstance.destroy();
        chartMaterialesInstance = new Chart(ctxMat, {
            type: 'doughnut',
            data: {
                labels: labelsMat.length > 0 ? labelsMat : ['Sin solicitudes'],
                datasets: [{ data: dataMat.length > 0 ? dataMat : [1], backgroundColor: ['#e30613', '#1a1d20', '#495057', '#adb5bd', '#ffc9c9', '#003366'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }
}

async function vaciarDatosGrafica(tipo) {
    if (rolActual !== "SUPER_ADMIN") {
        Swal.fire({ icon: 'error', title: 'Permiso denegado', text: 'Solo el rol Master puede vaciar las gráficas.' });
        return;
    }
    const res = await Swal.fire({
        title: `¿Vaciar datos de ${tipo}?`,
        text: "Se guardará el registro actual en el historial de gráficas y se reiniciará el contador.",
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, vaciar', cancelButtonText: 'Cancelar'
    });

    if (res.isConfirmed) {
        const fechaActualStr = new Date().toLocaleString();
        if (tipo === 'gabinetes') {
            await db.collection("historial_graficas").add({ tipo: 'Gabinetes', fechaVaciado: fechaActualStr, datos: JSON.stringify(historialBusquedasGabinetes), iso: new Date().toISOString() });
            historialBusquedasGabinetes = {};
        } else if (tipo === 'materiales') {
            let conteoMateriales = {};
            historialTicketsGrafica.forEach(t => {
                const mat = t.material || 'Desconocido';
                const cant = parseInt(t.cantidad) || 1;
                conteoMateriales[mat] = (conteoMateriales[mat] || 0) + cant;
            });
            await db.collection("historial_graficas").add({ tipo: 'Materiales Tooling', fechaVaciado: fechaActualStr, datos: JSON.stringify(conteoMateriales), iso: new Date().toISOString() });
            const snapshot = await db.collection("historial_tickets_grafica").get();
            const batch = db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
        actualizarGraficas();
        Toast.fire({ icon: 'success', title: 'Gráfica reiniciada y guardada en historial' });
    }
}

function renderizarHistorialGraficas() {
    const contenedor = document.getElementById('lista-historial-graficas');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    if (!historialGraficasGuardado || historialGraficasGuardado.length === 0) {
        contenedor.innerHTML = '<p style="font-size: 13px; color: #6c757d;">No hay registros en el historial todavía.</p>';
        return;
    }
    const esAdmin = (rolActual === "SUPER_ADMIN" || rolActual === "ADMIN");
    historialGraficasGuardado.forEach((h, index) => {
        const item = document.createElement('div');
        item.style.cssText = "background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;";
        const btnEliminar = esAdmin ? `<button class="btn-eliminar-cliente" style="background:#fff3cd; color:#e30613; border:1px solid #ffeeba; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;" onclick="eliminarRegistroHistorialGrafica('${h.id}')" title="Eliminar del historial">&times; Eliminar</button>` : '';
        item.innerHTML = `
            <div><strong>${h.tipo}</strong> - <span style="font-size: 12px; color: #6c757d;">Reseteado el: ${h.fechaVaciado}</span></div>
            <div style="display:flex; gap:8px; align-items:center;">
                <button class="btn-huf-secundario" style="font-size: 11px; padding: 4px 8px;" onclick="verDetalleHistorialGrafica(${index})">Ver Datos</button>
                ${btnEliminar}
            </div>
        `;
        contenedor.appendChild(item);
    });
}

function verDetalleHistorialGrafica(index) {
    const registro = historialGraficasGuardado[index];
    if (!registro) return;
    let datosObj = {};
    try { datosObj = typeof registro.datos === 'string' ? JSON.parse(registro.datos) : registro.datos; } catch(e) { datosObj = {}; }
    let htmlLista = '<ul style="text-align: left; max-height: 250px; overflow-y: auto; padding-left: 20px; font-size: 13px;">';
    let contador = 0;
    for (const key in datosObj) {
        contador++;
        htmlLista += `<li style="margin-bottom: 5px;"><strong>${key}:</strong> ${datosObj[key]} unidades/búsquedas</li>`;
    }
    if (contador === 0) htmlLista += '<li style="color:#6c757d;">No se encontraron elementos guardados en este periodo.</li>';
    htmlLista += '</ul>';
    Swal.fire({ title: `Detalle (${registro.tipo})`, html: `<p style="font-size: 12px; color: #6c757d; margin-bottom: 10px;">Fecha: ${registro.fechaVaciado}</p>${htmlLista}`, confirmButtonText: 'Aceptar', confirmButtonColor: '#e30613' });
}

async function eliminarRegistroHistorialGrafica(docId) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Permiso denegado', text: 'Solo administradores pueden borrar registros.' });
        return;
    }
    const res = await Swal.fire({
        title: '¿Eliminar este registro?', text: 'Se removerá permanentemente del historial de gráficas.',
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar'
    });
    if (res.isConfirmed) {
        try {
            await db.collection("historial_graficas").doc(docId).delete();
            Toast.fire({ icon: 'success', title: 'Registro de historial eliminado' });
        } catch (error) { Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo eliminar el registro.' }); }
    }
}

function seleccionarModalidadGabinete(tipo) {
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
// 5. NAVEGACIÓN PRINCIPAL
// =============================================================
function mostrarSeccion(seccion) {
    document.getElementById('tab-seleccion-inicial').style.display = 'none';

    if (seccion === 'inventario') {
        document.getElementById('seccion-inventario-completa').style.display = 'block';
        document.getElementById('nav-tabs-container').style.display = 'flex';
        document.querySelectorAll('#seccion-inventario-completa .tab-content').forEach(tab => tab.classList.remove('activo'));
        document.querySelectorAll('.btn-tab').forEach(btn => btn.classList.remove('activo'));
        document.getElementById('tab-gabinetes').classList.add('activo');
        const btnGabinetes = document.querySelector('.btn-tab[onclick*="tab-gabinetes"]');
        if (btnGabinetes) btnGabinetes.classList.add('activo');
    } else if (seccion === 'fixtures') {
        document.getElementById('seccion-lista-fixtures').style.display = 'block';
        document.getElementById('nav-tabs-container').style.display = 'none';
        renderizarListaFixturesGlobal();
    }
}

function volverAlMenuPrincipal() {
    document.getElementById('seccion-inventario-completa').style.display = 'none';
    document.getElementById('seccion-lista-fixtures').style.display = 'none';
    document.getElementById('tab-seleccion-inicial').style.display = 'block';
    document.getElementById('nav-tabs-container').style.display = 'none';
}

// =============================================================
// 6. HISTORIAL DE MODIFICACIONES
// =============================================================
function renderizarHistorialModificaciones() {
    const contenedor = document.getElementById('lista-historial-modificaciones');
    if (!contenedor) return;
    const filtroTipo = document.getElementById('filtro-historial-tipo')?.value || '';
    let listaFiltrada = historialModificaciones;
    if (filtroTipo) listaFiltrada = historialModificaciones.filter(h => h.tipo === filtroTipo);
    contenedor.innerHTML = '';

    if (listaFiltrada.length === 0) {
        contenedor.innerHTML = '<p style="font-size: 13px; color: #6c757d; text-align: center; padding: 20px;">No hay modificaciones registradas' + (filtroTipo ? ' para este filtro.' : ' todavía.') + '</p>';
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
        const btnRevertir = puedeRevertir ? `<button class="btn-huf-secundario" style="font-size: 11px; padding: 4px 10px; background-color: #856404;" onclick="revertirModificacion('${h.id}')" title="Revertir esta acción">↩️ Revertir</button>` : (h.revertido ? `<span style="font-size: 11px; color: #2b8a3e; font-weight: bold;">✔ Ya revertido</span>` : '');

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

async function revertirModificacion(historialId) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Permiso denegado', text: 'Solo administradores pueden revertir cambios.' });
        return;
    }
    const registro = historialModificaciones.find(h => h.id === historialId);
    if (!registro) return Swal.fire({ icon: 'error', title: 'Error', text: 'No se encontró el registro.' });
    if (registro.revertido) return Swal.fire({ icon: 'info', title: 'Ya revertido', text: 'Esta modificación ya fue revertida anteriormente.' });

    const res = await Swal.fire({
        title: '¿Revertir esta modificación?',
        html: `<p style="font-size: 13px; text-align: left; margin-bottom: 10px;"><strong>Acción original:</strong> ${registro.descripcion}</p><p style="font-size: 12px; color: #856404; text-align: left;">Se intentará restaurar los datos anteriores.</p>`,
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#856404', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, revertir', cancelButtonText: 'Cancelar'
    });

    if (!res.isConfirmed) return;

    try {
        const col = registro.refColeccion;
        const docId = registro.refDocId;
        const datosAntes = registro.datosAntes ? JSON.parse(registro.datosAntes) : null;
        const accion = registro.accion;

        if (!col || !docId) throw new Error('No hay referencia para revertir.');

        if (accion === 'CREAR') await db.collection(col).doc(docId).delete();
        else if (accion === 'ELIMINAR') {
            if (datosAntes) await db.collection(col).doc(docId).set(datosAntes);
            else throw new Error('No hay datos para restaurar.');
        } else if (accion === 'EDITAR') {
            if (datosAntes) await db.collection(col).doc(docId).set(datosAntes, { merge: true });
            else throw new Error('No hay datos anteriores para restaurar.');
        }

        await db.collection("historial_modificaciones").doc(historialId).update({ revertido: true });
        await registrarModificacion(registro.tipo, 'REVERTIR', `Se revirtió la acción: ${registro.descripcion}`, registro.datosDespues ? JSON.parse(registro.datosDespues) : null, datosAntes, registro.refColeccion, registro.refDocId);
        Swal.fire({ icon: 'success', title: 'Modificación Revertida', text: 'Los datos han sido restaurados correctamente.', confirmButtonColor: '#e30613' });
    } catch (error) {
        console.error(error);
        Swal.fire({ icon: 'error', title: 'No se pudo revertir', text: error.message || 'Ocurrió un error al intentar revertir la modificación.', confirmButtonColor: '#e30613' });
    }
}

async function limpiarHistorialModificaciones() {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Permiso denegado', text: 'Solo administradores pueden limpiar el historial.' });
        return;
    }
    const res = await Swal.fire({
        title: '¿Limpiar todo el historial?', text: 'Se eliminarán permanentemente todos los registros de modificaciones.',
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, limpiar todo', cancelButtonText: 'Cancelar'
    });
    if (res.isConfirmed) {
        try {
            const snapshot = await db.collection("historial_modificaciones").get();
            const batch = db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            Toast.fire({ icon: 'success', title: 'Historial limpiado' });
        } catch (error) { Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo limpiar el historial.' }); }
    }
}

// =============================================================
// 7. LISTA GLOBAL DE FIXTURES (NUEVO)
// =============================================================

function abrirModalNuevoFixtureGlobal() {
    document.getElementById('fixture-global-id-editar').value = '';
    document.getElementById('titulo-modal-fixture-global').textContent = 'Agregar Fixture a la Lista Global';
    document.getElementById('fg-nombre').value = '';
    document.getElementById('fg-cliente').value = '';
    document.getElementById('fg-pais').value = '';
    document.getElementById('fg-planta').value = '';
    document.getElementById('fg-ubicacion').value = '';
    document.getElementById('fg-proyecto').value = '';
    document.getElementById('fg-estado').value = 'Disponible';
    document.getElementById('fg-desc').value = '';
    document.getElementById('fg-contacto-nombre').value = '';
    document.getElementById('fg-contacto-info').value = '';
    document.getElementById('fg-foto-file').value = '';
    document.getElementById('fg-foto-base64').value = '';
    document.getElementById('fg-preview-foto').style.display = 'none';
    contextoFixtureGlobalDesdeLocker = null;
    abrirModal('modal-fixture-global');
}

function abrirModalNuevoFixtureGlobalDesdeLocker(piezaData, letra, divNum) {
    abrirModalNuevoFixtureGlobal();
    contextoFixtureGlobalDesdeLocker = { letra, divNum };
    
    document.getElementById('titulo-modal-fixture-global').textContent = `Agregar a Lista Global (desde Locker ${letra})`;
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

function abrirModalEditarFixtureGlobal(firestoreId) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Permisos insuficientes', text: 'Solo los administradores pueden editar fixtures globales.', confirmButtonColor: '#e30613' });
        return;
    }
    const fx = listaFixturesGlobales.find(f => f.firestoreId === firestoreId);
    if (!fx) return;

    document.getElementById('fixture-global-id-editar').value = fx.firestoreId;
    document.getElementById('titulo-modal-fixture-global').textContent = `Editar Fixture Global: ${fx.nombre}`;
    document.getElementById('fg-nombre').value = fx.nombre || '';
    document.getElementById('fg-cliente').value = fx.cliente || '';
    document.getElementById('fg-pais').value = fx.pais || '';
    document.getElementById('fg-planta').value = fx.planta || '';
    document.getElementById('fg-ubicacion').value = fx.ubicacion || '';
    document.getElementById('fg-proyecto').value = fx.proyecto || '';
    document.getElementById('fg-estado').value = fx.estado || 'Disponible';
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
    abrirModal('modal-fixture-global');
}

function convertirImagenFixtureGlobal(input) {
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

async function guardarFixtureGlobal(event) {
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
        actualizadoPor: usuarioActual || 'Anónimo'
    };

    // Si viene desde un Locker, guardamos el vínculo
    if (contextoFixtureGlobalDesdeLocker) {
        datosFixture.origen = `Locker ${contextoFixtureGlobalDesdeLocker.letra} - Div ${contextoFixtureGlobalDesdeLocker.divNum}`;
    }

    const fxAnterior = idExistente ? listaFixturesGlobales.find(f => f.firestoreId === idExistente) : null;

    await db.collection("lista_fixtures_global").doc(docId).set(datosFixture, { merge: true });

    await registrarModificacion(
        'FIXTURE_GLOBAL',
        idExistente ? 'EDITAR' : 'CREAR',
        idExistente 
            ? `Se editó el fixture global "${datosFixture.nombre}" (${datosFixture.cliente})`
            : `Se agregó el fixture "${datosFixture.nombre}" a la Lista Global (${datosFixture.cliente} - ${datosFixture.pais})`,
        fxAnterior, datosFixture, 'lista_fixtures_global', docId
    );

    cerrarModal('modal-fixture-global');
    contextoFixtureGlobalDesdeLocker = null;
    Toast.fire({ icon: 'success', title: idExistente ? 'Fixture global actualizado' : 'Fixture agregado a la lista global' });
}

async function eliminarFixtureGlobal(firestoreId) {
    if (rolActual !== "SUPER_ADMIN" && rolActual !== "ADMIN") {
        Swal.fire({ icon: 'error', title: 'Permisos insuficientes', text: 'Solo los administradores pueden eliminar fixtures globales.', confirmButtonColor: '#e30613' });
        return;
    }
    const fx = listaFixturesGlobales.find(f => f.firestoreId === firestoreId);
    if (!fx) return;

    const res = await Swal.fire({
        title: `¿Eliminar "${fx.nombre}" de la lista global?`,
        text: 'Se removerá del catálogo global. El fixture seguirá en su locker si aplica.',
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#e30613', cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar'
    });

    if (res.isConfirmed) {
        await db.collection("lista_fixtures_global").doc(firestoreId).delete();
        await registrarModificacion('FIXTURE_GLOBAL', 'ELIMINAR', `Se eliminó el fixture global "${fx.nombre}"`, fx, null, 'lista_fixtures_global', firestoreId);
        Toast.fire({ icon: 'success', title: 'Fixture eliminado de la lista global' });
    }
}

function buscarFixtureGlobal(event) {
    if (event) event.preventDefault();
    terminoBusquedaFixtureGlobal = document.getElementById('buscar-fixture-global').value.toLowerCase().trim();
    renderizarListaFixturesGlobal();
}

function limpiarBusquedaFixtureGlobal() {
    document.getElementById('buscar-fixture-global').value = '';
    terminoBusquedaFixtureGlobal = '';
    renderizarListaFixturesGlobal();
}

function renderizarListaFixturesGlobal() {
    const contenedor = document.getElementById('contenedor-fixtures-globales');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    // Filtrar
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
                <p style="color: #6c757d; font-size: 16px;">${terminoBusquedaFixtureGlobal ? `No se encontraron fixtures con "${terminoBusquedaFixtureGlobal}".` : 'Aún no hay fixtures registrados en la lista global.'}</p>
                ${!terminoBusquedaFixtureGlobal ? '<p style="color: #adb5bd; font-size: 13px; margin-top: 8px;">Usa el botón "+ Agregar Fixture a la Lista" o marca la casilla al guardar un fixture en un locker.</p>' : ''}
            </div>
        `;
        return;
    }

    const esAdmin = (rolActual === "SUPER_ADMIN" || rolActual === "ADMIN");

    // Agrupar por cliente
    const grupos = {};
    listaFiltrada.forEach(f => {
        const cli = f.cliente || 'Sin Cliente';
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

        // Colores por estado
        const coloresEstado = {
            'Disponible': '#2b8a3e',
            'En uso': '#1971c2',
            'En reparación': '#856404',
            'En tránsito': '#862e9c',
            'Fuera de servicio': '#6c757d'
        };

        grupos[cliente].forEach(fx => {
            const card = document.createElement('div');
            const colorEstado = coloresEstado[fx.estado] || '#6c757d';
            
            card.style.cssText = "background: #ffffff; border: 1px solid #e9ecef; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.04); transition: all 0.2s;";

            const imgHTML = fx.foto 
                ? `<img src="${fx.foto}" style="width: 100%; height: 140px; object-fit: cover; border-radius: 8px; cursor: pointer; margin-bottom: 8px;" onclick="ampliarFoto('${fx.foto}')" title="Clic para ampliar">` 
                : `<div style="width: 100%; height: 100px; background: #f1f3f5; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #adb5bd; font-size: 32px; margin-bottom: 8px;">📷</div>`;

            const adminBotones = esAdmin ? `
                <div style="display: flex; gap: 6px; margin-top: auto; padding-top: 10px; border-top: 1px dashed #e9ecef;">
                    <button class="btn-admin-edit" style="flex: 1;" onclick="abrirModalEditarFixtureGlobal('${fx.firestoreId}')">✏️ Editar</button>
                    <button class="btn-admin-delete" onclick="eliminarFixtureGlobal('${fx.firestoreId}')">🗑️</button>
                </div>
            ` : '';

            const origenHTML = fx.origen ? `<p style="margin: 0; font-size: 11px; color: #adb5bd;"><strong>Origen HUF:</strong> ${fx.origen}</p>` : '';
            const contactoHTML = fx.contactoNombre || fx.contactoInfo 
                ? `<div style="background: #e7f5ff; border-left: 3px solid #1971c2; padding: 8px 10px; border-radius: 6px; margin-top: 4px;">
                    <p style="margin: 0; font-size: 11px; color: #1971c2; font-weight: bold;">📞 Contacto en planta</p>
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
                        <span style="background: ${colorEstado}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold; white-space: nowrap;">${fx.estado || 'Disponible'}</span>
                    </div>
                    <p style="margin: 0; font-size: 12px; color: #495057;"><strong>🌍 País:</strong> ${fx.pais || 'N/A'}</p>
                    <p style="margin: 2px 0 0 0; font-size: 12px; color: #495057;"><strong>🏭 Planta:</strong> ${fx.planta || 'N/A'}</p>
                    ${fx.ubicacion ? `<p style="margin: 2px 0 0 0; font-size: 12px; color: #495057;"><strong>📍 Ubicación:</strong> ${fx.ubicacion}</p>` : ''}
                    ${fx.proyecto ? `<p style="margin: 2px 0 0 0; font-size: 12px; color: #495057;"><strong>🔢 Proyecto:</strong> ${fx.proyecto}</p>` : ''}
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