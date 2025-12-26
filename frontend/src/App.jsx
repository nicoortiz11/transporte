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

    // --- ESTADOS DE PAGINACIÓN ---
    const [viajesPagina, setViajesPagina] = useState(1);
    const [viajesPorPagina, setViajesPorPagina] = useState(20);
    const [clientesPagina, setClientesPagina] = useState(1);
    const [clientesPorPagina, setClientesPorPagina] = useState(20);

    // --- ESTADOS DE CARGA/EDICIÓN ---
    const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', cuit: '', tipo: 'PRODUCTOR' });
    const [nuevoViaje, setNuevoViaje] = useState({
        productor: { id: '' },
        transportista: { id: '' },
        kilos: '',
        precioPorTonelada: '', porcentajeComision: 20, ivaPorcentaje: 21,
        montoNeto: 0, monto: 0, gananciaNeta: 0,
        cartaDePorte: '',
        kilometros: '',
        fecha: new Date().toISOString().split('T')[0], estado: 'PENDIENTE'
    });

    // --- FUNCIÓN PARA FORMATEAR CUIT EN TIEMPO REAL ---
    const formatearCUIT = (valor) => {
        const soloNumeros = valor.replace(/\D/g, '');
        let resultado = soloNumeros;
        if (soloNumeros.length > 2) {
            resultado = soloNumeros.slice(0, 2) + '-' + soloNumeros.slice(2);
        }
        if (soloNumeros.length > 10) {
            resultado = resultado.slice(0, 11) + '-' + soloNumeros.slice(10, 11);
        }
        return resultado.slice(0, 13); // Límite de formato XX-XXXXXXXX-X
    };

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

    // --- LÓGICA DE IMPORTACIÓN INTELIGENTE (SELECTIVA) ---
    const importarDatos = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                let clientesNuevosCont = 0;
                let viajesNuevosCont = 0;

                const tieneClientes = Array.isArray(data.clientes);
                const tieneViajes = Array.isArray(data.viajes);

                if (window.confirm(`Archivo detectado:\n- Clientes: ${tieneClientes ? data.clientes.length : 0}\n- Viajes: ${tieneViajes ? data.viajes.length : 0}\n\n¿Desea proceder con la importación?`)) {

                    if (tieneClientes) {
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
                    }

                    const resC = await fetch('http://localhost:8080/api/clientes');
                    const dbClientesActualizados = await resC.json();

                    if (tieneViajes) {
                        for (const v of data.viajes) {
                            const existeViaje = viajes.some(dbV =>
                                dbV.fecha === v.fecha &&
                                dbV.cartaDePorte === v.cartaDePorte &&
                                dbV.kilos === v.kilos &&
                                dbV.kilometros === v.kilometros
                            );

                            if (!existeViaje) {
                                const prodLocal = dbClientesActualizados.find(c => c.nombre === v.productor?.nombre);
                                const transLocal = dbClientesActualizados.find(c => c.nombre === v.transportista?.nombre);

                                if (prodLocal && transLocal) {
                                    const nuevoViajePost = {
                                        ...v,
                                        id: null,
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
                    }
                    alert(`Proceso finalizado.\nClientes nuevos: ${clientesNuevosCont}\nViajes nuevos: ${viajesNuevosCont}`);
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
            const coincideCliente = filtroClienteId ? (v.productor?.id.toString() === filtroClienteId || v.transportista?.id.toString() === filtroClienteId) : true;
            const coincideDesde = filtroFechaDesde ? v.fecha >= filtroFechaDesde : true;
            const coincideHasta = filtroFechaHasta ? v.fecha <= filtroFechaHasta : true;
            const coincideAnio = filtroAnio ? anioViaje === filtroAnio : true;
            const coincideMes = filtroMes ? mesViaje === filtroMes : true;
            return coincideCliente && coincideDesde && coincideHasta && coincideAnio && coincideMes;
        })
        .sort((a, b) => b.fecha.localeCompare(a.fecha));

    // --- LÓGICA DE FILTRADO Y ORDENAMIENTO DE CLIENTES ---
    const clientesProcesados = clientes
        .filter(c => filtroTipoCliente ? c.tipo === filtroTipoCliente : true)
        .sort((a, b) => {
            if (a.tipo === 'TRANSPORTISTA' && b.tipo === 'PRODUCTOR') return -1;
            if (a.tipo === 'PRODUCTOR' && b.tipo === 'TRANSPORTISTA') return 1;
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
            doc.setFontSize(16);
            doc.text("Reporte Detallado de Cargas y Logística", 14, 15);
            const columnas = ["Fecha", "CP", "Productor", "Transportista", "KM", "Carga", "Neto", "Bruto", "Ganancia", "Estado"];
            const datosParaPdf = viajesFiltrados.map(v => [
                mostrarFechaSencilla(v.fecha),
                v.cartaDePorte || '-',
                v.productor?.nombre || '-',
                v.transportista?.nombre || '-',
                `${v.kilometros} km`,
                `${v.kilos.toLocaleString()} kg`,
                `$${(v.montoNeto || 0).toLocaleString()}`,
                `$${(v.monto || 0).toLocaleString()}`,
                `$${(v.gananciaNeta || 0).toLocaleString()} (${v.porcentajeComision}%)`,
                v.estado
            ]);
            autoTable(doc, { startY: 32, head: [columnas], body: datosParaPdf, theme: 'grid', styles: { fontSize: 7 } });
            doc.save(`Reporte_Logistica.pdf`);
        } catch (err) { alert("Error al generar PDF."); }
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
        if (window.confirm('¿Borrar cliente?')) {
            await fetch(`http://localhost:8080/api/clientes/${id}`, { method: 'DELETE' });
            cargarDatos();
        }
    };

    const guardarViaje = async (e) => {
        e.preventDefault();
        const url = nuevoViaje.id ? `http://localhost:8080/api/viajes/${nuevoViaje.id}` : 'http://localhost:8080/api/viajes';
        await fetch(url, { method: nuevoViaje.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nuevoViaje) });
        setNuevoViaje({ productor: { id: '' }, transportista: { id: '' }, kilos: '', precioPorTonelada: '', porcentajeComision: 20, ivaPorcentaje: 21, montoNeto: 0, monto: 0, gananciaNeta: 0, cartaDePorte: '', kilometros: '', fecha: new Date().toISOString().split('T')[0], estado: 'PENDIENTE' });
        cargarDatos();
    };

    const eliminarViaje = async (id) => {
        if (window.confirm('¿Borrar registro?')) { await fetch(`http://localhost:8080/api/viajes/${id}`, { method: 'DELETE' }); cargarDatos(); }
    };

    const prepararEdicion = (v) => {
        setNuevoViaje({
            ...v,
            productor: { id: v.productor.id },
            transportista: { id: v.transportista.id },
            cartaDePorte: v.cartaDePorte || '',
            kilometros: v.kilometros || ''
        });
        setPestana('viajes');
        window.scrollTo(0, 0);
    };

    // --- LÓGICA DE CÁLCULO ---
    useEffect(() => {
        const kg = parseFloat(nuevoViaje.kilos) || 0;
        const tn = kg / 1000;
        const km = parseFloat(nuevoViaje.kilometros) || 0;
        const pxTn = parseFloat(nuevoViaje.precioPorTonelada) || 0;
        const pIva = parseFloat(nuevoViaje.ivaPorcentaje) || 0;
        const pCom = parseFloat(nuevoViaje.porcentajeComision) || 0;

        const neto = tn * pxTn * km;
        const bruto = neto * (1 + (pIva / 100));
        const ganancia = neto * (pCom / 100);

        if (neto !== nuevoViaje.montoNeto || bruto !== nuevoViaje.monto || ganancia !== nuevoViaje.gananciaNeta) {
            setNuevoViaje(prev => ({ ...prev, montoNeto: neto, monto: bruto, gananciaNeta: ganancia }));
        }
    }, [nuevoViaje.kilos, nuevoViaje.precioPorTonelada, nuevoViaje.ivaPorcentaje, nuevoViaje.porcentajeComision, nuevoViaje.kilometros]);

    useEffect(() => { cargarDatos(); }, []);
    useEffect(() => { setViajesPagina(1); }, [filtroClienteId, filtroFechaDesde, filtroFechaHasta, filtroMes, filtroAnio, viajesPorPagina]);
    useEffect(() => { setClientesPagina(1); }, [filtroTipoCliente, clientesPorPagina]);

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
                
                body, html, #root { 
                    margin: 0 !important; 
                    padding: 0 !important; 
                    width: 100% !important; 
                    max-width: 100% !important;
                    overflow-x: hidden;
                    font-family: 'Inter', sans-serif;
                    background-color: #f3f4f6;
                }
                
                .app-header {
                    background: #1e293b;
                    color: white;
                    padding: 1rem 2rem;
                    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
                }

                .nav-modern {
                    background: white;
                    border-radius: 12px;
                    padding: 0.5rem;
                    display: flex;
                    gap: 0.5rem;
                    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
                }

                .nav-modern button {
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 8px;
                    font-weight: 600;
                    transition: all 0.2s;
                }

                .nav-active { background: #3b82f6 !important; color: white !important; }
                .nav-inactive { background: transparent; color: #64748b; }
                .nav-inactive:hover { background: #f1f5f9; }

                .metric-card {
                    background: white;
                    border-radius: 16px;
                    padding: 1.5rem;
                    border: 1px solid #e2e8f0;
                    transition: transform 0.2s;
                }
                
                .metric-card:hover { transform: translateY(-2px); }

                .card-modern {
                    background: white;
                    border-radius: 16px;
                    border: none;
                    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
                    overflow: hidden;
                }

                .card-header-modern {
                    background: #f8fafc;
                    border-bottom: 1px solid #e2e8f0;
                    padding: 1rem 1.5rem;
                    font-weight: 700;
                    color: #1e293b;
                }

                .form-label { font-weight: 600; color: #475569; font-size: 0.85rem; }
                .form-control, .form-select {
                    border-radius: 8px;
                    border: 1px solid #cbd5e1;
                    padding: 0.5rem 0.75rem;
                }
                
                /* FIX PARA FLECHITA DE SELECTS EN PAGINACIÓN */
                .pagination-box .form-select {
                    appearance: none !important;
                    -webkit-appearance: none !important;
                    -moz-appearance: none !important;
                    padding-right: 2.5rem !important;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E") !important;
                    background-repeat: no-repeat !important;
                    background-position: right 0.75rem center !important;
                    background-size: 1rem !important;
                }

                .table-modern thead { background: #f1f5f9; }
                .table-modern th { 
                    text-transform: uppercase; 
                    font-size: 0.75rem; 
                    letter-spacing: 0.05em; 
                    color: #64748b;
                    padding: 1rem;
                }

                .btn-primary-modern { background: #3b82f6; border: none; border-radius: 8px; font-weight: 600; padding: 0.6rem 1.2rem; }
                .btn-primary-modern:hover { background: #2563eb; }
                
                .pagination-box {
                    background: white;
                    padding: 1rem;
                    border-radius: 12px;
                    margin: 1rem 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border: 1px solid #e2e8f0;
                }
                
                .status-badge {
                    padding: 0.4rem 0.8rem;
                    border-radius: 9999px;
                    font-size: 0.75rem;
                    font-weight: 700;
                }
            `}</style>

            <div className="container-main pb-5">
                {/* CABECERA TOP BAR */}
                <header className="app-header d-flex justify-content-between align-items-center mb-4">
                    <div className="d-flex align-items-center gap-3">
                        <div style={{background: '#3b82f6', padding: '8px', borderRadius: '10px'}}>🚛</div>
                        <h2 className="mb-0 fw-bold" style={{letterSpacing: '-0.02em'}}>Logistica<span style={{color: '#60a5fa'}}>Transporte</span></h2>
                    </div>
                    <div className="d-flex gap-3">
                        <button className="btn btn-outline-light btn-sm px-3" onClick={() => exportarDatos({clientes, viajes}, "Backup")}>Exportar JSON</button>
                        <label className="btn btn-primary btn-sm px-3 mb-0" style={{cursor: 'pointer'}}>
                            Importar JSON
                            <input type="file" accept=".json" onChange={importarDatos} style={{display: 'none'}} />
                        </label>
                    </div>
                </header>

                <div className="container-fluid px-5">
                    {/* TABS NAVEGACION */}
                    <div className="nav-modern mb-4">
                        <button className={pestana === 'viajes' ? 'nav-active' : 'nav-inactive'} onClick={() => setPestana('viajes')}>Gestión de Cargas</button>
                        <button className={pestana === 'clientes' ? 'nav-active' : 'nav-inactive'} onClick={() => setPestana('clientes')}>Base de Clientes</button>
                    </div>

                    {pestana === 'viajes' ? (
                        <>
                            {/* DASHBOARD VIAJES */}
                            <div className="row mb-4 g-4">
                                <div className="col-md-6">
                                    <div className="metric-card" style={{borderLeft: '6px solid #ef4444'}}>
                                        <span className="text-muted small fw-bold">BRUTO PENDIENTE DE COBRO</span>
                                        <h2 className="fw-bold mb-0 mt-1" style={{color: '#b91c1c'}}>${totalPendienteCobro.toLocaleString()}</h2>
                                    </div>
                                </div>
                                <div className="col-md-6">
                                    <div className="metric-card" style={{borderLeft: '6px solid #10b981'}}>
                                        <span className="text-muted small fw-bold">GANANCIA NETA TOTAL (FILTRO)</span>
                                        <h2 className="fw-bold mb-0 mt-1" style={{color: '#047857'}}>${gananciaTotalFiltro.toLocaleString()}</h2>
                                    </div>
                                </div>
                            </div>

                            {/* FORMULARIO VIAJE */}
                            <div className="card-modern mb-4">
                                <div className={`card-header-modern d-flex justify-content-between ${nuevoViaje.id ? 'bg-warning text-dark' : ''}`}>
                                    <span>{nuevoViaje.id ? '📝 EDITANDO REGISTRO' : '➕ CARGAR NUEVO VIAJE'}</span>
                                    {nuevoViaje.id && <button className="btn btn-link btn-sm p-0 text-danger fw-bold" onClick={() => setNuevoViaje({productor:{id:''}, transportista:{id:''}, kilos:'', precioPorTonelada:'', porcentajeComision:20, ivaPorcentaje:21, montoNeto:0, monto:0, gananciaNeta:0, cartaDePorte:'', kilometros:'', fecha:new Date().toISOString().split('T')[0], estado:'PENDIENTE'})}>CANCELAR EDICIÓN</button>}
                                </div>
                                <form onSubmit={guardarViaje} className="p-4 row g-3">
                                    <div className="col-md-3">
                                        <label className="form-label">PRODUCTOR</label>
                                        <select className="form-select" value={nuevoViaje.productor?.id || ''} onChange={e => setNuevoViaje({...nuevoViaje, productor: {id: e.target.value}})} required>
                                            <option value="">Seleccionar...</option>
                                            {clientes.filter(c => c.tipo === 'PRODUCTOR').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">TRANSPORTISTA</label>
                                        <select className="form-select" value={nuevoViaje.transportista?.id || ''} onChange={e => setNuevoViaje({...nuevoViaje, transportista: {id: e.target.value}})} required>
                                            <option value="">Seleccionar...</option>
                                            {clientes.filter(c => c.tipo === 'TRANSPORTISTA').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label">CARTA DE PORTE</label>
                                        <input type="text" className="form-control" placeholder="N°" value={nuevoViaje.cartaDePorte || ''} onChange={e => setNuevoViaje({...nuevoViaje, cartaDePorte: e.target.value})} />
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label">FECHA</label>
                                        <input type="date" className="form-control" value={nuevoViaje.fecha || ''} onChange={e => setNuevoViaje({...nuevoViaje, fecha: e.target.value})} required />
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label">ESTADO</label>
                                        <select className="form-select fw-bold" value={nuevoViaje.estado || 'PENDIENTE'} onChange={e => setNuevoViaje({...nuevoViaje, estado: e.target.value})}>
                                            <option value="PENDIENTE">✖️ PENDIENTE</option>
                                            <option value="PAGO">✅ PAGO</option>
                                        </select>
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label">KILOS</label>
                                        <input type="number" className="form-control" value={nuevoViaje.kilos || ''} onChange={e => setNuevoViaje({...nuevoViaje, kilos: e.target.value})} required />
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label">DISTANCIA (KM)</label>
                                        <input type="number" className="form-control" value={nuevoViaje.kilometros || ''} onChange={e => setNuevoViaje({...nuevoViaje, kilometros: e.target.value})} required />
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label">$/TN (TARIFA)</label>
                                        <input type="number" className="form-control" value={nuevoViaje.precioPorTonelada || ''} onChange={e => setNuevoViaje({...nuevoViaje, precioPorTonelada: e.target.value})} required />
                                    </div>
                                    <div className="col-md-1">
                                        <label className="form-label">IVA %</label>
                                        <select className="form-select" value={nuevoViaje.ivaPorcentaje || 21} onChange={e => setNuevoViaje({...nuevoViaje, ivaPorcentaje: e.target.value})}>
                                            <option value="0">0%</option><option value="10.5">10.5%</option><option value="21">21%</option>
                                        </select>
                                    </div>
                                    <div className="col-md-1">
                                        <label className="form-label">COM %</label>
                                        <input type="number" className="form-control" value={nuevoViaje.porcentajeComision || 0} onChange={e => setNuevoViaje({...nuevoViaje, porcentajeComision: e.target.value})} />
                                    </div>
                                    <div className="col-md-2 d-grid align-items-end">
                                        <button className="btn btn-primary-modern text-white">GUARDAR VIAJE</button>
                                    </div>
                                    <div className="col-12 mt-3">
                                        <div className="p-3 rounded-4 bg-light d-flex justify-content-center gap-5 border">
                                            <div className="text-center">
                                                <span className="text-muted small d-block">SUBTOTAL NETO</span>
                                                <span className="fw-bold h5 mb-0">${nuevoViaje.montoNeto.toLocaleString()}</span>
                                            </div>
                                            <div className="text-center" style={{color: '#059669'}}>
                                                <span className="small d-block fw-bold">GANANCIA ESTIMADA</span>
                                                <span className="fw-bold h5 mb-0">${nuevoViaje.gananciaNeta.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                </form>
                            </div>

                            {/* FILTROS Y TABLA VIAJES */}
                            <div className="card-modern p-4 mb-3 border-info" style={{background: '#f8fafc'}}>
                                <div className="row g-3 align-items-end">
                                    <div className="col-md-2"><label className="form-label">FILTRAR CLIENTE</label><select className="form-select form-select-sm" value={filtroClienteId} onChange={e => setFiltroClienteId(e.target.value)}><option value="">Todos</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
                                    <div className="col-md-4"><label className="form-label">INTERVALO DE FECHAS</label><div className="input-group input-group-sm"><input type="date" className="form-control" value={filtroFechaDesde} onChange={e => setFiltroFechaDesde(e.target.value)}/><input type="date" className="form-control" value={filtroFechaHasta} onChange={e => setFiltroFechaHasta(e.target.value)}/></div></div>
                                    <div className="col-md-3"><label className="form-label">MES / AÑO</label><div className="input-group input-group-sm"><select className="form-select" value={filtroMes} onChange={e => setFiltroMes(e.target.value)}><option value="">Mes</option>{["01","02","03","04","05","06","07","08","09","10","11","12"].map(m => <option key={m} value={m}>{m}</option>)}</select><select className="form-select" value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)}><option value="2024">2024</option><option value="2025">2025</option></select></div></div>
                                    <div className="col-md-3 d-flex gap-2"><button className="btn btn-secondary btn-sm w-100 fw-bold" onClick={() => {setFiltroClienteId(''); setFiltroFechaDesde(''); setFiltroFechaHasta(''); setFiltroMes(''); setFiltroAnio('2025')}}>LIMPIAR</button><button className="btn btn-danger btn-sm w-100 fw-bold" onClick={generarPDF}>DESCARGAR PDF</button></div>
                                </div>
                            </div>

                            <div className="pagination-box">
                                <div className="d-flex align-items-center gap-3">
                                    <span className="small fw-bold text-muted">VISTA:</span>
                                    <select className="form-select form-select-sm w-auto" value={viajesPorPagina} onChange={e => setViajesPorPagina(Number(e.target.value))}>
                                        {[5, 10, 20, 50, 100].map(n => <option key={n} value={n}>{n} filas</option>)}
                                    </select>
                                </div>
                                <div className="btn-group gap-2">
                                    <button className="btn btn-sm btn-outline-secondary px-3" disabled={viajesPagina === 1} onClick={() => setViajesPagina(viajesPagina - 1)}>Anterior</button>
                                    <span className="align-self-center fw-bold small text-primary">Página {viajesPagina} / {totalPaginasViajes || 1}</span>
                                    <button className="btn btn-sm btn-outline-secondary px-3" disabled={viajesPagina >= totalPaginasViajes} onClick={() => setViajesPagina(viajesPagina + 1)}>Siguiente</button>
                                </div>
                            </div>

                            <div className="card-modern shadow-sm border-0">
                                <div className="table-responsive">
                                    <table className="table table-hover table-modern mb-0 align-middle">
                                        <thead>
                                        <tr><th>Fecha</th><th>CP</th><th>Productor (🚜)</th><th>Transportista (🚚)</th><th>KM</th><th>Carga</th><th>Monto Bruto</th><th>Mi Ganancia</th><th>Estado</th><th className="text-center">Acciones</th></tr>
                                        </thead>
                                        <tbody>
                                        {viajesPaginados.map(v => (
                                            <tr key={v.id} style={{borderBottom: '1px solid #f1f5f9'}}>
                                                <td className="fw-bold text-dark">{mostrarFechaSencilla(v.fecha)}</td>
                                                <td className="text-danger fw-bold">{v.cartaDePorte || '-'}</td>
                                                <td><div className="fw-bold small">{v.productor?.nombre}</div></td>
                                                <td><div className="fw-bold small">{v.transportista?.nombre}</div></td>
                                                <td><span className="badge bg-slate-100 text-slate-700 border" style={{color: '#475569'}}>{v.kilometros} km</span></td>
                                                <td>
                                                    <div className="fw-bold">{v.kilos.toLocaleString()} kg</div>
                                                    <div className="text-muted small">${v.precioPorTonelada}/Tn-Km</div>
                                                </td>
                                                <td className="fw-bold text-dark">${(v.monto || 0).toLocaleString()}</td>
                                                <td>
                                                    <div className="fw-bold text-success">${(v.gananciaNeta || 0).toLocaleString()}</div>
                                                    <div className="text-muted small">({v.porcentajeComision}%)</div>
                                                </td>
                                                <td>
                                                        <span className={`status-badge ${v.estado === 'PENDIENTE' ? 'bg-danger text-white' : 'bg-success text-white'}`}>
                                                            {v.estado === 'PENDIENTE' ? '✖️ PENDIENTE' : '✅ PAGO'}
                                                        </span>
                                                </td>
                                                <td className="text-center">
                                                    <button className="btn btn-sm p-1 me-2" onClick={() => prepararEdicion(v)}>✏️</button>
                                                    <button className="btn btn-sm p-1 text-danger" onClick={() => eliminarViaje(v.id)}>🗑️</button>
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* VISTA CLIENTES MODERNA */
                        <>
                            <div className="row mb-4 g-4 w-100 mx-0">
                                <div className="col-md-4"><div className="metric-card border-success text-center">🚜 <span className="small fw-bold text-muted d-block">PRODUCTORES</span><h3 className="fw-bold mb-0 text-success">{totalProductores}</h3></div></div>
                                <div className="col-md-4"><div className="metric-card border-primary text-center">🚚 <span className="small fw-bold text-muted d-block">TRANSPORTISTAS</span><h3 className="fw-bold mb-0 text-primary">{totalTransportistas}</h3></div></div>
                                <div className="col-md-4"><div className="metric-card border-warning text-center">⚠️ <span className="small fw-bold text-muted d-block">CON SALDO PENDIENTE</span><h3 className="fw-bold mb-0 text-warning">{transportistasConDeuda}</h3></div></div>
                            </div>

                            {/* FORMULARIO CLIENTE CON CABECERA DINÁMICA */}
                            <div className="card-modern mb-4">
                                <div className={`card-header-modern d-flex justify-content-between ${nuevoCliente.id ? 'bg-warning text-dark' : ''}`}>
                                    <span>{nuevoCliente.id ? '📝 EDITANDO CLIENTE' : '👤 REGISTRAR CLIENTE / EMPRESA'}</span>
                                    {nuevoCliente.id && <button className="btn btn-link btn-sm p-0 text-danger fw-bold" onClick={() => setNuevoCliente({nombre:'', cuit:'', tipo:'PRODUCTOR'})}>CANCELAR EDICIÓN</button>}
                                </div>
                                <form onSubmit={guardarCliente} className="p-4 row g-3 align-items-end">
                                    <div className="col-md-4"><label className="form-label">RAZÓN SOCIAL</label><input type="text" className="form-control" value={nuevoCliente.nombre || ''} onChange={e => setNuevoCliente({...nuevoCliente, nombre: e.target.value})} required /></div>
                                    <div className="col-md-3">
                                        <label className="form-label">CUIT / CUIL</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="XX-XXXXXXXX-X"
                                            value={nuevoCliente.cuit || ''}
                                            onChange={e => setNuevoCliente({...nuevoCliente, cuit: formatearCUIT(e.target.value)})}
                                        />
                                    </div>
                                    <div className="col-md-3"><label className="form-label">CATEGORÍA</label><select className="form-select border-primary" value={nuevoCliente.tipo || 'PRODUCTOR'} onChange={e => setNuevoCliente({...nuevoCliente, tipo: e.target.value})}><option value="PRODUCTOR">🚜 PRODUCTOR</option><option value="TRANSPORTISTA">🚚 TRANSPORTISTA</option></select></div>
                                    <div className="col-md-2 d-grid"><button className="btn btn-primary-modern text-white">GUARDAR</button></div>
                                </form>
                            </div>

                            <div className="pagination-box">
                                <div className="d-flex gap-3">
                                    <button className={`btn btn-sm ${filtroTipoCliente === '' ? 'btn-dark' : 'btn-outline-dark'}`} onClick={() => setFiltroTipoCliente('')}>Todos</button>
                                    <button className={`btn btn-sm ${filtroTipoCliente === 'TRANSPORTISTA' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setFiltroTipoCliente('TRANSPORTISTA')}>🚚 Transportistas</button>
                                    <button className={`btn ${filtroTipoCliente === 'PRODUCTOR' ? 'btn-success' : 'btn-outline-success'}`} onClick={() => setFiltroTipoCliente('PRODUCTOR')}>🚜 Productores</button>
                                </div>
                                <div className="d-flex align-items-center gap-2">
                                    <span className="small fw-bold text-muted">MOSTRAR:</span>
                                    <select className="form-select form-select-sm w-auto" value={clientesPorPagina} onChange={e => setClientesPorPagina(Number(e.target.value))}>
                                        {[5, 10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                    <button className="btn btn-sm btn-outline-secondary ms-2" disabled={clientesPagina === 1} onClick={() => setClientesPagina(clientesPagina - 1)}>Ant.</button>
                                    <span className="small fw-bold px-2">{clientesPagina} / {totalPaginasClientes || 1}</span>
                                    <button className="btn btn-sm btn-outline-secondary" disabled={clientesPagina >= totalPaginasClientes} onClick={() => setClientesPagina(clientesPagina + 1)}>Sig.</button>
                                </div>
                            </div>

                            <div className="card-modern">
                                <div className="table-responsive">
                                    <table className="table table-hover table-modern mb-0 align-middle w-100">
                                        <thead><tr><th className="px-4">Nombre / Empresa</th><th>CUIT / CUIL</th><th>Categoría</th><th className="text-center">Acciones</th></tr></thead>
                                        <tbody>
                                        {clientesPaginados.map(c => (
                                            <tr key={c.id}>
                                                <td className="fw-bold px-4 text-dark">{c.nombre}</td>
                                                <td className="text-muted small">{c.cuit || 'S/D'}</td>
                                                <td>{c.tipo === 'PRODUCTOR' ? <span className="status-badge bg-emerald-100 text-emerald-700" style={{background: '#dcfce7', color: '#047857'}}>🚜 PRODUCTOR</span> : <span className="status-badge bg-blue-100 text-blue-700" style={{background: '#dbeafe', color: '#1d4ed8'}}>🚚 TRANSPORTISTA</span>}</td>
                                                <td className="text-center"><button className="btn btn-sm p-1 me-3" onClick={() => setNuevoCliente(c)}>✏️</button><button className="btn btn-sm p-1 text-danger" onClick={() => eliminarCliente(c.id)}>🗑️</button></td>
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