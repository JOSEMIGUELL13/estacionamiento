const express = require('express');
const router = express.Router();
const db = require('../db');

// Registrar entrada
router.post('/entrada', async (req, res) => {
  const { nombre, placa } = req.body;
  
  // Validar entrada
  if (!nombre || !placa) {
    return res.status(400).json({ message: 'Nombre y placa son obligatorios' });
  }
  
  const ahora = new Date();

  try {
    // Verificar si ya existe una entrada activa con la misma placa
    const [existente] = await db.query(
      'SELECT * FROM registros WHERE placa = ? AND hora_salida IS NULL', 
      [placa]
    );
    
    if (existente.length > 0) {
      return res.status(409).json({ 
        message: 'Ya existe un vehículo activo con esta placa' 
      });
    }

    await db.query(
      'INSERT INTO registros (nombre, placa, hora_entrada) VALUES (?, ?, ?)', 
      [nombre, placa, ahora]
    );
    
    res.status(201).json({ message: 'Entrada registrada exitosamente' });
  } catch (err) {
    console.error('Error al registrar entrada:', err);
    res.status(500).json({ message: 'Error al registrar entrada' });
  }
});

// Registrar salida y calcular costo
router.post('/salida', async (req, res) => {
  const { placa } = req.body;
  
  if (!placa) {
    return res.status(400).json({ message: 'Placa es obligatoria' });
  }
  
  const ahora = new Date();

  try {
    // Buscar entrada activa
    const [registros] = await db.query(
      'SELECT * FROM registros WHERE placa = ? AND hora_salida IS NULL ORDER BY hora_entrada DESC LIMIT 1', 
      [placa]
    );

    if (registros.length === 0) {
      return res.status(404).json({ 
        message: 'No se encontró ingreso activo para esta placa' 
      });
    }

    const registro = registros[0];
    const entrada = new Date(registro.hora_entrada);
    const minutos = Math.max(1, Math.ceil((ahora - entrada) / (1000 * 60)));

    const [[tarifa]] = await db.query('SELECT * FROM tarifas LIMIT 1');

    let costo = 0;
    if (minutos <= tarifa.tiempo_gracia) {
      // Incluso en tiempo de gracia, cobrar tarifa mínima de 10 pesos
      costo = 10.00;
    } else if (minutos <= 60) {
      costo = Math.max(10.00, tarifa.tarifa_por_hora);
    } else {
      const horasCompletas = Math.floor(minutos / 60);
      const minutosExtra = minutos % 60;
      costo = (horasCompletas * tarifa.tarifa_por_hora) + (minutosExtra * (tarifa.tarifa_extra / 60));
      costo = Math.max(10.00, costo); // Asegurar tarifa mínima
    }

    // Redondear a 2 decimales
    costo = Math.ceil(costo * 100) / 100;

    // Actualizar salida
    await db.query(
      'UPDATE registros SET hora_salida = ?, tiempo_total = ?, costo = ? WHERE id = ?', 
      [ahora, minutos, costo, registro.id]
    );

    res.json({ 
      id: registro.id,
      placa: registro.placa, 
      nombre: registro.nombre,
      hora_entrada: registro.hora_entrada,
      hora_salida: ahora,
      minutos: minutos, 
      costo: costo 
    });
  } catch (err) {
    console.error('Error al registrar salida:', err);
    res.status(500).json({ message: 'Error al registrar salida' });
  }
});

// Obtener todos los registros 
router.get('/', async (req, res) => {
  try {
    const { fecha, fecha_inicio, fecha_fin } = req.query;
    let query = '';
    let params = [];
    
    console.log('Parámetros recibidos:', req.query);
    
    if (fecha) {
      // Filtrar por un día específico 
      query = `SELECT * FROM registros 
               WHERE YEAR(hora_entrada) = ? 
               AND MONTH(hora_entrada) = ? 
               AND DAY(hora_entrada) = ? 
               ORDER BY hora_entrada DESC`;
      
      const fechaObj = new Date(fecha);
      const año = fechaObj.getFullYear();
      const mes = fechaObj.getMonth() + 1;
      const dia = fechaObj.getDate();
      
      params = [año, mes, dia];
      console.log(`Filtrando por fecha específica: ${año}-${mes}-${dia}`);
    } else if (fecha_inicio && fecha_fin) {
      // Filtrar por rango de fechas
      query = `SELECT * FROM registros 
               WHERE hora_entrada >= ? 
               AND hora_entrada <= DATE_ADD(?, INTERVAL 1 DAY)
               ORDER BY hora_entrada DESC`;
      
      // Asegurarse de que fecha_fin incluya todo el día
      params = [fecha_inicio, fecha_fin];
      console.log('Filtrando por rango de fechas:', fecha_inicio, 'a', fecha_fin);
    } else {
      // Sin filtro, traer todos los registros
      query = 'SELECT * FROM registros ORDER BY hora_entrada DESC';
      console.log('Sin filtro de fechas, trayendo todos los registros');
    }
    
    console.log('Query SQL:', query);
    console.log('Parámetros SQL:', params);
    
    const [rows] = await db.query(query, params);
    console.log('Registros encontrados:', rows.length);
    
    res.json(rows);
  } catch (err) {
    console.error('Error al obtener registros:', err);
    res.status(500).json({ message: 'Error al obtener registros' });
  }
});

// Obtener vehículos activos
router.get('/activos', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM registros WHERE hora_salida IS NULL ORDER BY hora_entrada DESC'
    );
    
    // Calcular tiempo transcurrido para cada vehículo
    const ahora = new Date();
    const vehiculosActivos = rows.map(vehiculo => {
      const entrada = new Date(vehiculo.hora_entrada);
      const minutos = Math.ceil((ahora - entrada) / (1000 * 60));
      
      return {
        ...vehiculo,
        tiempo_actual: minutos
      };
    });
    
    res.json(vehiculosActivos);
  } catch (err) {
    console.error('Error al obtener vehículos activos:', err);
    res.status(500).json({ message: 'Error al obtener vehículos activos' });
  }
});

// Obtener estadísticas por día 
router.get('/por-dia', async (req, res) => {
  const { fecha } = req.query;
  
  // Si no se proporciona fecha
  const fechaConsulta = fecha ? new Date(fecha) : new Date();
  
  // Formatear fecha para consulta SQL (YYYY-MM-DD)
  const fechaFormateada = fechaConsulta.toISOString().split('T')[0];
  
  try {
    // Obtener registros del día
    const [registros] = await db.query(
      `SELECT * FROM registros 
       WHERE DATE(hora_entrada) = ? 
       ORDER BY hora_entrada DESC`,
      [fechaFormateada]
    );
    
    // Obtener estadísticas
    const [[estadisticas]] = await db.query(
      `SELECT 
        COUNT(*) as total_vehiculos,
        SUM(CASE WHEN hora_salida IS NULL THEN 1 ELSE 0 END) as vehiculos_activos,
        SUM(CASE WHEN hora_salida IS NOT NULL THEN 1 ELSE 0 END) as vehiculos_completados,
        SUM(CASE WHEN hora_salida IS NOT NULL THEN costo ELSE 0 END) as ingresos_totales
       FROM registros 
       WHERE DATE(hora_entrada) = ?`,
      [fechaFormateada]
    );
    
    res.json({
      fecha: fechaFormateada,
      estadisticas,
      registros
    });
  } catch (err) {
    console.error('Error al obtener estadísticas por día:', err);
    res.status(500).json({ message: 'Error al obtener estadísticas por día' });
  }
});

// Obtener resumen mensual
router.get('/resumen-mensual', async (req, res) => {
  const { mes, anio } = req.query;
  
  // Si no se proporcionan mes y año, usar el mes y año actual
  const fechaActual = new Date();
  const mesConsulta = mes ? parseInt(mes) : fechaActual.getMonth() + 1; // JavaScript meses son 0-11
  const anioConsulta = anio ? parseInt(anio) : fechaActual.getFullYear();
  
  try {
    // Obtener resumen diario para el mes
    const [resumenDiario] = await db.query(
      `SELECT 
        DATE(hora_entrada) as fecha,
        COUNT(*) as total_vehiculos,
        SUM(CASE WHEN hora_salida IS NOT NULL THEN costo ELSE 0 END) as ingresos
       FROM registros 
       WHERE MONTH(hora_entrada) = ? AND YEAR(hora_entrada) = ?
       GROUP BY DATE(hora_entrada)
       ORDER BY fecha`,
      [mesConsulta, anioConsulta]
    );
    
    // Obtener estadísticas mensuales
    const [[estadisticasMensuales]] = await db.query(
      `SELECT 
        COUNT(*) as total_vehiculos,
        SUM(CASE WHEN hora_salida IS NOT NULL THEN costo ELSE 0 END) as ingresos_totales,
        AVG(CASE WHEN hora_salida IS NOT NULL THEN costo ELSE NULL END) as ingreso_promedio
       FROM registros 
       WHERE MONTH(hora_entrada) = ? AND YEAR(hora_entrada) = ?`,
      [mesConsulta, anioConsulta]
    );
    
    res.json({
      mes: mesConsulta,
      anio: anioConsulta,
      estadisticas: estadisticasMensuales,
      resumen_diario: resumenDiario
    });
  } catch (err) {
    console.error('Error al obtener resumen mensual:', err);
    res.status(500).json({ message: 'Error al obtener resumen mensual' });
  }
});

module.exports = router;