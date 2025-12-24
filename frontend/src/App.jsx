import { useEffect, useState } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

function App() {
    const [viajes, setViajes] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [pestana, setPestana] = useState('viajes'); // Estado para controlar la pestaña activa

    // --- ESTADOS DE FILTROS ---
    const [filtroClienteId, setFiltroClienteId] = useState('');
    const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
    const [filtroFechaHasta, setFiltroFechaHasta] = useState('');
    const [filtroMes, setFiltroMes] = useState('');
    const [filtroAnio, setFiltroAnio] = useState(new Date().getFullYear().toString());

    // --- NUEVO ESTADO: FILTRO TIPO CLIENTE ---
    const [filtroTipoCliente, setFiltroTipoCliente] = useState('');

    // --- ESTADOS DE PAGINACIÓN (NUEVOS Y MANTENIDOS) ---
    const [viajesPagina, setViajesPagina] = useState(1);
    const [viajesPorPagina, setViajesPorPagina] = useState(20);
    const [clientesPagina, setClientesPagina] = useState(1);
    const [clientesPorPagina, setClientesPorPagina] = useState(20);

    // --- ESTADOS DE CARGA/EDICIÓN ---
    const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', cuit: '', tipo: 'PRODUCTOR' });
    const [nuevoViaje, setNuevoViaje] = useState({
        productor: { id: '' },
        transportista: { id: '' },
        origen: '', destino: '', kilos: '',
        precioPorTonelada: '', porcentajeComision: 20, ivaPorcentaje: 21,
        montoNeto: 0, monto: 0, gananciaNeta: 0,
        cartaDePorte: '',
        fecha: new Date().toISOString().split('T')[0], estado: 'PENDIENTE'
    });

    const cargarDatos = async () => {
        try {
            const resV = await fetch('http://localhost:8080/api/viajes');
            const resC = await fetch('http://localhost:8080/api/clientes');
            setViajes(await resV.json());
            setClientes(await resC.json());
        } catch (error) { console.error("Error al cargar:", error); }
    };

    // --- LÓGICA DE EXPORTACIÓN (JSON) ---
    const exportarDatos = (datos, nombre) => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(datos, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `${nombre}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    // --- LÓGICA DE IMPORTACIÓN INTELIGENTE (JSON) SIN DUPLICADOS ---
    const importarDatos = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                let clientesNuevosCont = 0;
                let viajesNuevosCont = 0;

                if (window.confirm(`Se analizarán ${data.clientes?.length || 0} clientes y ${data.viajes?.length || 0} viajes. ¿Continuar?`)) {

                    // 1. IMPORTAR CLIENTES (Solo si no existen por Nombre + Tipo)
                    for (const c of data.clientes) {
                        const existe = clientes.some(dbC =>
                            dbC.nombre.toLowerCase() === c.nombre.toLowerCase() && dbC.tipo === c.tipo
                        );
                        if (!existe) {
                            await fetch('http://localhost:8080/api/clientes', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ nombre: c.nombre, cuit: c.cuit, tipo: c.tipo })
                            });
                            clientesNuevosCont++;
                        }
                    }

                    // Recargar clientes para tener los IDs reales antes de procesar viajes
                    const resC = await fetch('http://localhost:8080/api/clientes');
                    const dbClientesActualizados = await resC.json();

                    // 2. IMPORTAR VIAJES (Solo si no existen por Fecha + CP + Kilos)
                    for (const v of data.viajes) {
                        const existeViaje = viajes.some(dbV =>
                            dbV.fecha === v.fecha &&
                            dbV.cartaDePorte === v.cartaDePorte &&
                            dbV.kilos === v.kilos
                        );

                        if (!existeViaje) {
                            // Buscar los IDs locales de los clientes por nombre
                            const prodLocal = dbClientesActualizados.find(c => c.nombre === v.productor?.nombre);
                            const transLocal = dbClientesActualizados.find(c => c.nombre === v.transportista?.nombre);

                            if (prodLocal && transLocal) {
                                const nuevoViajePost = {
                                    ...v,
                                    id: null, // Dejar que la DB asigne uno nuevo
                                    productor: { id: prodLocal.id },
                                    transportista: { id: transLocal.id }
                                };
                                await fetch('http://localhost:8080/api/viajes', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(nuevoViajePost)
                                });
                                viajesNuevosCont++;
                            }
                        }
                    }
                    alert(`Proceso finalizado.\nClientes nuevos: ${clientesNuevosCont}\nViajes nuevos: ${viajesNuevosCont}\nEl resto ya existía y fue omitido.`);
                    cargarDatos();
                }
            } catch (err) {
                alert("Error al procesar el archivo JSON.");
            }
        };
        reader.readAsText(file);
    };

    const mostrarFechaSencilla = (fechaStr) => {
        if (!fechaStr) return 'S/F';
        const [anio, mes, dia] = fechaStr.split('-');
        return `${dia}/${mes}/${anio}`;
    };

    // --- LÓGICA DE FILTRADO Y ORDENAMIENTO DE VIAJES ---
    const viajesFiltrados = viajes
        .filter(v => {
            const [anioViaje, mesViaje] = v.fecha ? v.fecha.split('-') : ['', ''];

            const coincideCliente = filtroClienteId
                ? (v.productor?.id.toString() === filtroClienteId || v.transportista?.id.toString() === filtroClienteId)
                : true;

            const coincideDesde = filtroFechaDesde ? v.fecha >= filtroFechaDesde : true;
            const coincideHasta = filtroFechaHasta ? v.fecha <= filtroFechaHasta : true;
            const coincideAnio = filtroAnio ? anioViaje === filtroAnio : true;
            const coincideMes = filtroMes ? mesViaje === filtroMes : true;

            return coincideCliente && coincideDesde && coincideHasta && coincideAnio && coincideMes;
        })
        .sort((a, b) => b.fecha.localeCompare(a.fecha)); // ORDENAR POR FECHA (Más nuevo primero)

    // --- LÓGICA DE FILTRADO Y ORDENAMIENTO DE CLIENTES ---
    const clientesProcesados = clientes
        .filter(c => filtroTipoCliente ? c.tipo === filtroTipoCliente : true) // Filtro por tipo
        .sort((a, b) => {
            // Condición: TRANSPORTISTAS primero, luego PRODUCTORES
            if (a.tipo === 'TRANSPORTISTA' && b.tipo === 'PRODUCTOR') return -1;
            if (a.tipo === 'PRODUCTOR' && b.tipo === 'TRANSPORTISTA') return 1;
            // Si son del mismo tipo, orden alfabético A-Z
            return a.nombre.localeCompare(b.nombre);
        });

    // --- LÓGICA DE PAGINACIÓN APLICADA ---
    const totalPaginasViajes = Math.ceil(viajesFiltrados.length / viajesPorPagina);
    const viajesPaginados = viajesFiltrados.slice((viajesPagina - 1) * viajesPorPagina, viajesPagina * viajesPorPagina);

    const totalPaginasClientes = Math.ceil(clientesProcesados.length / clientesPorPagina);
    const clientesPaginados = clientesProcesados.slice((clientesPagina - 1) * clientesPorPagina, clientesPagina * clientesPorPagina);

    // --- CÁLCULOS DE RESUMEN (VIAJES) ---
    const totalPendienteCobro = viajesFiltrados
        .filter(v => v.estado === 'PENDIENTE')
        .reduce((acc, v) => acc + (v.monto || 0), 0);

    const gananciaTotalFiltro = viajesFiltrados
        .reduce((acc, v) => acc + (v.gananciaNeta || 0), 0);

    // --- CÁLCULOS DE RESUMEN (CLIENTES) ---
    const totalProductores = clientes.filter(c => c.tipo === 'PRODUCTOR').length;
    const totalTransportistas = clientes.filter(c => c.tipo === 'TRANSPORTISTA').length;

    const transportistasConDeuda = clientes.filter(c =>
        c.tipo === 'TRANSPORTISTA' &&
        viajes.some(v => v.transportista?.id === c.id && v.estado === 'PENDIENTE')
    ).length;

    // --- FUNCIÓN GENERAR PDF ---
    const generarPDF = () => {
        try {
            const doc = new jsPDF('landscape');
            const fechaEmision = new Date().toLocaleDateString();

            doc.setFontSize(16);
            doc.text("Reporte Detallado de Cargas y Logística", 14, 15);
            doc.setFontSize(10);
            doc.text(`Fecha de emisión: ${fechaEmision}`, 14, 22);
            doc.text(`Filtros: ${filtroMes ? 'Mes ' + filtroMes : 'Período'} - ${filtroAnio}`, 14, 27);

            const columnas = ["Fecha", "C. Porte", "Productor", "Transportista", "Ruta", "Carga", "Neto", "Bruto", "Ganancia", "Estado"];

            const datosParaPdf = viajesFiltrados.map(v => [
                mostrarFechaSencilla(v.fecha),
                v.cartaDePorte || '-',
                v.productor?.nombre || '-',
                v.transportista?.nombre || '-',
                `${v.origen || ''} > ${v.destino || ''}`,
                `${v.kilos.toLocaleString()} kg`, // KG en PDF
                `$${(v.montoNeto || 0).toLocaleString()}`,
                `${v.ivaPorcentaje}%`,
                `$${(v.monto || 0).toLocaleString()}`,
                `$${(v.gananciaNeta || 0).toLocaleString()} (${v.porcentajeComision}%)`,
                v.estado || 'PENDIENTE'
            ]);

            autoTable(doc, {
                startY: 32,
                head: [columnas],
                body: datosParaPdf,
                theme: 'grid',
                headStyles: { fillColor: [0, 51, 153], textColor: [255, 255, 255] },
                styles: { fontSize: 7 },
                margin: { left: 14, right: 14 }
            });

            const finalY = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(11);
            doc.text(`RESUMEN FILTRADO:`, 14, finalY);
            doc.text(`Total Bruto Pendiente: $${totalPendienteCobro.toLocaleString()}`, 14, finalY + 7);
            doc.text(`Ganancia Neta Total: $${gananciaTotalFiltro.toLocaleString()}`, 14, finalY + 14);

            doc.save(`Reporte_Logistica_${new Date().getTime()}.pdf`);
        } catch (err) {
            alert("Error al generar PDF.");
            console.error(err);
        }
    };

    // --- FUNCIONES CRUD ---
    const guardarCliente = async (e) => {
        e.preventDefault();
        const url = nuevoCliente.id ? `http://localhost:8080/api/clientes/${nuevoCliente.id}` : 'http://localhost:8080/api/clientes';
        await fetch(url, { method: nuevoCliente.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nuevoCliente) });
        setNuevoCliente({ nombre: '', cuit: '', tipo: 'PRODUCTOR' });
        cargarDatos();
    };

    const eliminarCliente = async (id) => {
        if (window.confirm('¿Borrar cliente? No debe tener viajes asociados.')) {
            const res = await fetch(`http://localhost:8080/api/clientes/${id}`, { method: 'DELETE' });
            if (!res.ok) alert("Error: El cliente tiene viajes asociados.");
            cargarDatos();
        }
    };

    const guardarViaje = async (e) => {
        e.preventDefault();
        const url = nuevoViaje.id ? `http://localhost:8080/api/viajes/${nuevoViaje.id}` : 'http://localhost:8080/api/viajes';
        await fetch(url, { method: nuevoViaje.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nuevoViaje) });
        setNuevoViaje({
            productor: { id: '' }, transportista: { id: '' },
            origen: '', destino: '', kilos: '', precioPorTonelada: '',
            porcentajeComision: 20, ivaPorcentaje: 21, montoNeto: 0, monto: 0, gananciaNeta: 0,
            cartaDePorte: '',
            fecha: new Date().toISOString().split('T')[0], estado: 'PENDIENTE'
        });
        cargarDatos();
    };

    const eliminarViaje = async (id) => {
        if (window.confirm('¿Borrar registro?')) { await fetch(`http://localhost:8080/api/viajes/${id}`, { method: 'DELETE' }); cargarDatos(); }
    };

    const prepararEdicion = (v) => {
        setNuevoViaje({
            ...v,
            productor: v.productor ? { id: v.productor.id } : { id: '' },
            transportista: v.transportista ? { id: v.transportista.id } : { id: '' },
            cartaDePorte: v.cartaDePorte || ''
        });
        setPestana('viajes');
        window.scrollTo(0, 0);
    };

    // --- LÓGICA DE CÁLCULO POR TONELADA ---
    useEffect(() => {
        const kg = parseFloat(nuevoViaje.kilos) || 0;
        const tn = kg / 1000;
        const pxTn = parseFloat(nuevoViaje.precioPorTonelada) || 0;
        const pIva = parseFloat(nuevoViaje.ivaPorcentaje) || 0;
        const pCom = parseFloat(nuevoViaje.porcentajeComision) || 0;

        const neto = tn * pxTn;
        const bruto = neto * (1 + (pIva / 100));
        const ganancia = neto * (pCom / 100);

        if (neto !== nuevoViaje.montoNeto || bruto !== nuevoViaje.monto || ganancia !== nuevoViaje.gananciaNeta) {
            setNuevoViaje(prev => ({ ...prev, montoNeto: neto, monto: bruto, gananciaNeta: ganancia }));
        }
    }, [nuevoViaje.kilos, nuevoViaje.precioPorTonelada, nuevoViaje.ivaPorcentaje, nuevoViaje.porcentajeComision]);

    useEffect(() => { cargarDatos(); }, []);

    // Resetear a página 1 cuando cambian los filtros
    useEffect(() => { setViajesPagina(1); }, [filtroClienteId, filtroFechaDesde, filtroFechaHasta, filtroMes, filtroAnio]);
    useEffect(() => { setClientesPagina(1); }, [filtroTipoCliente]);

    return (
        <>
            {/* RESETEO TOTAL PARA ANCHO COMPLETO SIN BORDES BLANCOS */}
            <style>{`
                body, html, #root { 
                    margin: 0 !important; 
                    padding: 0 !important; 
                    width: 100% !important; 
                    max-width: 100% !important;
                    overflow-x: hidden; 
                }
                .container-main { 
                    width: 100% !important; 
                    max-width: 100% !important;
                    min-height: 100vh; 
                    background-color: #f8f9fa; 
                    margin: 0 !important;
                    padding: 0 !important;
                }
                .fluid-wrapper {
                    width: 100% !important;
                    padding-left: 2rem !important;
                    padding-right: 2rem !important;
                }
                .container-fluid {
                    width: 100% !important;
                    max-width: 100% !important;
                }
                .pagination-box { background: white; border: 1px solid #dee2e6; border-radius: 8px; padding: 8px 15px; margin-bottom: 10px; }
            `}</style>

            <div className="container-main pb-5">
                {/* PANEL DE BACKUP - SIEMPRE FULL WIDTH */}
                <div className="bg-white border-bottom shadow-sm p-3 mb-3 w-100">
                    <div className="container-fluid">
                        <div className="row align-items-center">
                            <div className="col-md-4">
                                <span className="fw-bold text-muted small text-uppercase">📦 GESTIÓN DE ARCHIVOS Y BACKUPS</span>
                            </div>
                            <div className="col-md-8 text-end d-flex gap-2 justify-content-end">
                                <button className="btn btn-outline-dark btn-sm" onClick={() => exportarDatos({clientes, viajes}, "Backup_Logistica")}>📥 EXPORTAR TODO</button>
                                <button className="btn btn-outline-primary btn-sm" onClick={() => exportarDatos({clientes, viajes: viajesFiltrados}, "Exportacion_Filtrada")}>🔍 EXPORTAR VISTA</button>
                                <label className="btn btn-outline-success btn-sm mb-0">
                                    📤 IMPORTAR SIN DUPLICADOS
                                    <input type="file" accept=".json" onChange={importarDatos} style={{display: 'none'}} />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CONTENIDO INTERNO CON PADDING CONTROLADO */}
                <div className="fluid-wrapper">
                    {/* NAVEGACIÓN PRO (TABS) */}
                    <ul className="nav nav-pills nav-fill bg-white shadow-sm rounded mb-4 p-2 border">
                        <li className="nav-item">
                            <button className={`nav-link fw-bold ${pestana === 'viajes' ? 'active bg-primary text-white' : 'text-dark'}`} onClick={() => setPestana('viajes')}>🚛 GESTIÓN DE CARGAS</button>
                        </li>
                        <li className="nav-item">
                            <button className={`nav-link fw-bold ${pestana === 'clientes' ? 'active bg-dark text-white' : 'text-dark'}`} onClick={() => setPestana('clientes')}>👥 ADMINISTRACIÓN DE CLIENTES</button>
                        </li>
                    </ul>

                    <h1 className="text-primary mb-3 text-center fw-bold display-5">Logística Profesional</h1>

                    {pestana === 'viajes' ? (
                        <>
                            {/* VISTA CARGAS */}
                            <div className="row mb-4 g-3">
                                <div className="col-md-6">
                                    <div className="card border-danger shadow-sm text-uppercase h-100 w-100">
                                        <div className="card-body py-3 text-center">
                                            <span className="text-muted small fw-bold">Bruto Pendiente Cobro</span>
                                            <h2 className="text-danger fw-bold mb-0">${totalPendienteCobro.toLocaleString()}</h2>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-md-6">
                                    <div className="card border-success shadow-sm text-uppercase h-100 w-100">
                                        <div className="card-body py-3 text-center">
                                            <span className="text-muted small fw-bold">Mi Ganancia Total</span>
                                            <h2 className="text-success fw-bold mb-0">${gananciaTotalFiltro.toLocaleString()}</h2>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="card shadow-sm border-primary mb-4 w-100">
                                <div className={`card-header text-white fw-bold py-2 ${nuevoViaje.id ? 'bg-warning text-dark' : 'bg-primary'}`}>
                                    {nuevoViaje.id ? '📝 EDITANDO VIAJE' : '🚛 CARGAR NUEVO VIAJE'}
                                </div>
                                <form onSubmit={guardarViaje} className="card-body row g-3 p-4">
                                    <div className="col-md-3">
                                        <label className="form-label small fw-bold text-success">🚜 Productor (Origen)</label>
                                        <select className="form-select border-success" value={nuevoViaje.productor?.id || ''} onChange={e => setNuevoViaje({...nuevoViaje, productor: {id: e.target.value}})} required>
                                            <option value="">-- Seleccionar Productor --</option>
                                            {clientes.filter(c => c.tipo === 'PRODUCTOR').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label small fw-bold text-primary">🚚 Transportista (Camión)</label>
                                        <select className="form-select border-primary" value={nuevoViaje.transportista?.id || ''} onChange={e => setNuevoViaje({...nuevoViaje, transportista: {id: e.target.value}})} required>
                                            <option value="">-- Seleccionar Transportista --</option>
                                            {clientes.filter(c => c.tipo === 'TRANSPORTISTA').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label small fw-bold text-danger">📜 Carta de Porte</label>
                                        <input type="text" className="form-control border-danger" placeholder="N° de Comprobante" value={nuevoViaje.cartaDePorte || ''} onChange={e => setNuevoViaje({...nuevoViaje, cartaDePorte: e.target.value})} />
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label small fw-bold">Fecha / Estado</label>
                                        <div className="input-group">
                                            <input type="date" className="form-control" value={nuevoViaje.fecha || ''} onChange={e => setNuevoViaje({...nuevoViaje, fecha: e.target.value})} required />
                                            <select className="form-select" value={nuevoViaje.estado || 'PENDIENTE'} onChange={e => setNuevoViaje({...nuevoViaje, estado: e.target.value})}>
                                                <option value="PENDIENTE">✖️ PENDIENTE</option>
                                                <option value="PAGO">✅ PAGO</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label small fw-bold">Origen / Destino</label>
                                        <div className="input-group">
                                            <input type="text" className="form-control" placeholder="Origen" value={nuevoViaje.origen || ''} onChange={e => setNuevoViaje({...nuevoViaje, origen: e.target.value})} required />
                                            <input type="text" className="form-control" placeholder="Destino" value={nuevoViaje.destino || ''} onChange={e => setNuevoViaje({...nuevoViaje, destino: e.target.value})} required />
                                        </div>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label small fw-bold text-primary">Kg / $ x Tonelada</label>
                                        <div className="input-group">
                                            <input type="number" className="form-control" placeholder="Kg" value={nuevoViaje.kilos || ''} onChange={e => setNuevoViaje({...nuevoViaje, kilos: e.target.value})} required />
                                            <input type="number" className="form-control" placeholder="$/Tn" value={nuevoViaje.precioPorTonelada || ''} onChange={e => setNuevoViaje({...nuevoViaje, precioPorTonelada: e.target.value})} required />
                                        </div>
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label small fw-bold">IVA %</label>
                                        <select className="form-select" value={nuevoViaje.ivaPorcentaje || 21} onChange={e => setNuevoViaje({...nuevoViaje, ivaPorcentaje: e.target.value})}>
                                            <option value="0">0%</option><option value="10.5">10.5%</option><option value="21">21%</option>
                                        </select>
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label small fw-bold text-success">Comisión %</label>
                                        <input type="number" className="form-control border-success text-success fw-bold" value={nuevoViaje.porcentajeComision || 0} onChange={e => setNuevoViaje({...nuevoViaje, porcentajeComision: e.target.value})} />
                                    </div>
                                    <div className="col-md-2 d-grid pt-4">
                                        <button className="btn btn-success shadow fw-bold">💾 GUARDAR</button>
                                    </div>
                                    <div className="col-md-12 text-center pt-2">
                                        <div className="d-inline-block p-2 bg-light border rounded shadow-sm">
                                            <span className="fw-bold me-3">Subtotal Neto: ${nuevoViaje.montoNeto.toLocaleString()}</span>
                                            <span className="fw-bold text-success">Ganancia Estimada: ${nuevoViaje.gananciaNeta.toLocaleString()}</span>
                                        </div>
                                        {nuevoViaje.id && <button type="button" className="btn btn-link btn-sm ms-3 text-secondary" onClick={() => setNuevoViaje({productor:{id:''}, transportista:{id:''}, origen:'', destino:'', kilos:'', precioPorTonelada:'', porcentajeComision:20, ivaPorcentaje:21, montoNeto:0, monto:0, gananciaNeta:0, cartaDePorte:'', fecha:new Date().toISOString().split('T')[0], estado:'PENDIENTE'})}>Cancelar</button>}
                                    </div>
                                </form>
                            </div>

                            {/* FILTROS VIAJES */}
                            <div className="card shadow-sm mb-3 border-info bg-light w-100">
                                <div className="card-body row g-2 align-items-end p-3">
                                    <div className="col-md-2"><label className="form-label small fw-bold text-uppercase">Cliente</label>
                                        <select className="form-select form-select-sm" value={filtroClienteId} onChange={e => setFiltroClienteId(e.target.value)}>
                                            <option value="">Todos</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-4"><label className="form-label small fw-bold text-danger text-uppercase">Intervalo (Desde - Hasta)</label>
                                        <div className="input-group input-group-sm">
                                            <input type="date" className="form-control border-danger" value={filtroFechaDesde} onChange={e => setFiltroFechaDesde(e.target.value)} />
                                            <input type="date" className="form-control border-danger" value={filtroFechaHasta} onChange={e => setFiltroFechaHasta(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="col-md-3"><label className="form-label small fw-bold text-uppercase text-muted">Mes / Año</label>
                                        <div className="input-group input-group-sm">
                                            <select className="form-select" value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
                                                <option value="">Mes</option>
                                                {["01","02","03","04","05","06","07","08","09","10","11","12"].map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                            <select className="form-select" value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)}>
                                                <option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="col-md-3 text-end d-flex gap-2">
                                        <button className="btn btn-outline-secondary btn-sm w-100" onClick={() => {setFiltroClienteId(''); setFiltroFechaDesde(''); setFiltroFechaHasta(''); setFiltroMes(''); setFiltroAnio('2025')}}>LIMPIAR</button>
                                        <button className="btn btn-danger btn-sm w-100 fw-bold" onClick={generarPDF}>📄 PDF</button>
                                    </div>
                                </div>
                            </div>

                            {/* CONTROLES PAGINACIÓN VIAJES */}
                            <div className="pagination-box d-flex justify-content-between align-items-center">
                                <div className="d-flex align-items-center gap-2">
                                    <span className="small fw-bold">Mostrar:</span>
                                    <select className="form-select form-select-sm" style={{width: 'auto'}} value={viajesPorPagina} onChange={e => setViajesPorPagina(Number(e.target.value))}>
                                        {[5, 10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                    <span className="small text-muted ms-2">Registros totales: {viajesFiltrados.length}</span>
                                </div>
                                <div className="btn-group">
                                    <button className="btn btn-outline-secondary btn-sm" disabled={viajesPagina === 1} onClick={() => setViajesPagina(viajesPagina - 1)}>Anterior</button>
                                    <button className="btn btn-primary btn-sm px-4" disabled>Página {viajesPagina} de {totalPaginasViajes || 1}</button>
                                    <button className="btn btn-outline-secondary btn-sm" disabled={viajesPagina >= totalPaginasViajes} onClick={() => setViajesPagina(viajesPagina + 1)}>Siguiente</button>
                                </div>
                            </div>

                            {/* TABLA HISTORIAL */}
                            <div className="card shadow-sm border-0 overflow-hidden w-100">
                                <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center py-2 text-uppercase small">
                                    <span>Historial de Cargas (Más recientes primero)</span>
                                    <span className="badge bg-primary">Pág {viajesPagina}</span>
                                </div>
                                <div className="table-responsive w-100">
                                    <table className="table table-sm table-hover mb-0 align-middle w-100" style={{fontSize: '14px'}}>
                                        <thead className="table-light text-secondary text-uppercase">
                                        <tr>
                                            <th>Fecha</th><th>CP</th><th>Productor (🚜)</th><th>Transportista (🚚)</th><th>Ruta</th><th>Carga (KG)</th><th>Neto</th><th>Total Bruto</th><th>Ganancia</th><th>Estado</th><th className="text-center">Acciones</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {viajesPaginados.map(v => (
                                            <tr key={v.id}>
                                                <td>{mostrarFechaSencilla(v.fecha)}</td>
                                                <td className="fw-bold text-danger">{v.cartaDePorte || '-'}</td>
                                                <td><small className="fw-bold">{v.productor?.nombre || '-'}</small></td>
                                                <td><small className="fw-bold text-primary">{v.transportista?.nombre || '-'}</small></td>
                                                <td><small>{v.origen} → {v.destino}</small></td>
                                                <td>
                                                    <span className="fw-bold">{v.kilos.toLocaleString()} kg</span><br/>
                                                    <small className="text-muted">${v.precioPorTonelada}/Tn</small>
                                                </td>
                                                <td className="fw-bold text-dark">${(v.montoNeto || 0).toLocaleString()}</td>
                                                <td className="fw-bold text-primary">${(v.monto || 0).toLocaleString()}</td>
                                                <td className="fw-bold text-success">
                                                    ${(v.gananciaNeta || 0).toLocaleString()}
                                                    <small className="text-muted d-block" style={{fontSize: '10px'}}>({v.porcentajeComision || 0}%)</small>
                                                </td>
                                                <td>{v.estado === 'PENDIENTE' ? <span className="badge bg-danger">✖️ PENDIENTE</span> : <span className="badge bg-success">✅ PAGO</span>}</td>
                                                <td className="text-center">
                                                    <button className="btn btn-sm text-info p-1 me-2" onClick={() => prepararEdicion(v)}>✏️</button>
                                                    <button className="btn btn-sm text-danger p-1" onClick={() => eliminarViaje(v.id)}>🗑️</button>
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* VISTA DE CLIENTES - FULL WIDTH UNIFICADO */
                        <>
                            <div className="row mb-4 g-3 w-100 mx-0">
                                <div className="col-md-4">
                                    <div className="card border-success shadow-sm py-3 text-center text-uppercase h-100">
                                        <span className="text-muted small fw-bold">🚜 Total Productores</span>
                                        <h2 className="text-success fw-bold mb-0">{totalProductores}</h2>
                                    </div>
                                </div>
                                <div className="col-md-4">
                                    <div className="card border-primary shadow-sm py-3 text-center text-uppercase h-100">
                                        <span className="text-muted small fw-bold">🚚 Total Transportistas</span>
                                        <h2 className="text-primary fw-bold mb-0">{totalTransportistas}</h2>
                                    </div>
                                </div>
                                <div className="col-md-4">
                                    <div className="card border-warning shadow-sm py-3 text-center text-uppercase h-100">
                                        <span className="text-muted small fw-bold">⚠️ Fleteros con Pendientes</span>
                                        <h2 className="text-warning fw-bold mb-0">{transportistasConDeuda}</h2>
                                    </div>
                                </div>
                            </div>

                            <div className="card shadow-sm border-dark mb-4 w-100">
                                <div className={`card-header text-white fw-bold py-2 bg-dark`}>🏢 REGISTRAR / EDITAR CLIENTE</div>
                                <form onSubmit={guardarCliente} className="card-body p-4 row g-3 align-items-end">
                                    <div className="col-md-4">
                                        <label className="form-label small fw-bold">Nombre o Razón Social</label>
                                        <input type="text" className="form-control" value={nuevoCliente.nombre || ''} onChange={e => setNuevoCliente({...nuevoCliente, nombre: e.target.value})} required />
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label small fw-bold text-muted">CUIT / CUIL (Opcional)</label>
                                        <input type="text" className="form-control" value={nuevoCliente.cuit || ''} onChange={e => setNuevoCliente({...nuevoCliente, cuit: e.target.value})} />
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label small fw-bold text-primary">Categoría de Contacto</label>
                                        <select className="form-select border-primary" value={nuevoCliente.tipo || 'PRODUCTOR'} onChange={e => setNuevoCliente({...nuevoCliente, tipo: e.target.value})}>
                                            <option value="PRODUCTOR">🚜 PRODUCTOR (Origen)</option>
                                            <option value="TRANSPORTISTA">🚚 TRANSPORTISTA (Camión)</option>
                                        </select>
                                    </div>
                                    <div className="col-md-2 d-grid">
                                        <button className="btn btn-dark shadow fw-bold">GUARDAR</button>
                                        {nuevoCliente.id && <button type="button" className="btn btn-link btn-sm text-secondary" onClick={() => setNuevoCliente({nombre:'', cuit:'', tipo:'PRODUCTOR'})}>Cancelar</button>}
                                    </div>
                                </form>
                            </div>

                            {/* FILTRO Y PAGINACIÓN RÁPIDA PARA AGENDA */}
                            <div className="pagination-box d-flex flex-wrap justify-content-between align-items-center gap-3">
                                <div className="d-flex align-items-center gap-3">
                                    <span className="fw-bold small text-uppercase ms-2">Filtrar Agenda:</span>
                                    <div className="btn-group btn-group-sm">
                                        <button className={`btn ${filtroTipoCliente === '' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => setFiltroTipoCliente('')}>Todos</button>
                                        <button className={`btn ${filtroTipoCliente === 'TRANSPORTISTA' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setFiltroTipoCliente('TRANSPORTISTA')}>🚚 Transportistas</button>
                                        <button className={`btn ${filtroTipoCliente === 'PRODUCTOR' ? 'btn-success' : 'btn-outline-success'}`} onClick={() => setFiltroTipoCliente('PRODUCTOR')}>🚜 Productores</button>
                                    </div>
                                </div>
                                <div className="d-flex align-items-center gap-2">
                                    <span className="small fw-bold">Ver:</span>
                                    <select className="form-select form-select-sm" style={{width: 'auto'}} value={clientesPorPagina} onChange={e => setClientesPorPagina(Number(e.target.value))}>
                                        {[5, 10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                    <button className="btn btn-outline-dark btn-sm ms-2" disabled={clientesPagina === 1} onClick={() => setClientesPagina(clientesPagina - 1)}>Ant.</button>
                                    <span className="small fw-bold px-2">{clientesPagina} / {totalPaginasClientes || 1}</span>
                                    <button className="btn btn-outline-dark btn-sm" disabled={clientesPagina >= totalPaginasClientes} onClick={() => setClientesPagina(clientesPagina + 1)}>Sig.</button>
                                </div>
                            </div>

                            <div className="card shadow-sm border-0 overflow-hidden w-100">
                                <div className="table-responsive w-100">
                                    <table className="table table-hover mb-0 align-middle w-100">
                                        <thead className="table-light text-secondary text-uppercase" style={{fontSize: '12px'}}>
                                        <tr><th className="px-4">Nombre / Empresa</th><th>CUIT / CUIL</th><th>Categoría</th><th className="text-center">Acciones</th></tr>
                                        </thead>
                                        <tbody style={{fontSize: '15px'}}>
                                        {clientesPaginados.map(c => (
                                            <tr key={c.id}>
                                                <td className="fw-bold px-4">{c.nombre}</td>
                                                <td className="text-muted small">{c.cuit || 'S/D'}</td>
                                                <td>
                                                    {c.tipo === 'PRODUCTOR' ?
                                                        <span className="badge bg-success-subtle text-success border border-success px-3">🚜 PRODUCTOR</span> :
                                                        <span className="badge bg-primary-subtle text-primary border border-primary px-3">🚚 TRANSPORTISTA</span>
                                                    }
                                                </td>
                                                <td className="text-center">
                                                    <button className="btn btn-outline-info btn-sm me-3" onClick={() => setNuevoCliente(c)}>✏️ Editar</button>
                                                    <button className="btn btn-outline-danger btn-sm" onClick={() => eliminarCliente(c.id)}>🗑️ Borrar</button>
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    )
}

export default App