document.addEventListener("DOMContentLoaded", () => {
  // Cache DOM elements
  const entradaForm = document.getElementById("entradaForm")
  const salidaForm = document.getElementById("salidaForm")
  const nombreInput = document.getElementById("nombre")
  const placaInput = document.getElementById("placa")
  const salidaPlacaInput = document.getElementById("salida_placa")
  const nombreError = document.getElementById("nombre-error")
  const placaError = document.getElementById("placa-error")
  const salidaPlacaError = document.getElementById("salida-placa-error")
  const modal = document.getElementById("resultModal")
  const modalTitle = document.getElementById("modal-title")
  const modalContent = document.getElementById("modal-content")
  const modalConfirm = document.getElementById("modal-confirm")
  const closeButton = document.querySelector(".close-button")
  const refreshButton = document.getElementById("refresh-button")
  const toast = document.getElementById("toast")
  const toastMessage = document.getElementById("toast-message")
  const filtroFecha = document.getElementById("filtro-fecha")

  // Detectar entorno y configurar API URL
  const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
  const API_URL = isProduction ? `${window.location.origin}/api/parking` : "http://localhost:5000/api/parking"
  
  console.log('Entorno:', isProduction ? 'Producción' : 'Desarrollo')
  console.log('API URL:', API_URL)

  // Inicializar
  init()

  function init() {
    // Cargar registros iniciales con el filtro seleccionado
    const filtroSeleccionado = filtroFecha.value
    console.log("Filtro inicial:", filtroSeleccionado)
    cargarRegistros(filtroSeleccionado)

    // Cargar estadísticas iniciales
    cargarEstadisticas()

    // Event Listeners
    entradaForm.addEventListener("submit", handleEntradaSubmit)
    salidaForm.addEventListener("submit", handleSalidaSubmit)
    refreshButton.addEventListener("click", () => {
      const filtro = filtroFecha.value
      console.log("Filtro al hacer clic en Actualizar:", filtro)
      cargarRegistros(filtro)
      cargarEstadisticas()
    })
    modalConfirm.addEventListener("click", closeModal)
    closeButton.addEventListener("click", closeModal)

    // Agregar event listener para el filtro de fecha
    filtroFecha.addEventListener("change", () => {
      const filtro = filtroFecha.value
      console.log("Filtro cambiado a:", filtro)
      cargarRegistros(filtro)
    })

    window.addEventListener("click", (event) => {
      if (event.target === modal) closeModal()
    })

    // Validación de entrada en tiempo real
    nombreInput.addEventListener("input", validateNombre)
    placaInput.addEventListener("input", validatePlaca)
    salidaPlacaInput.addEventListener("input", validateSalidaPlaca)

    // Transformar a mayúsculas automáticamente las placas
    placaInput.addEventListener("blur", () => {
      placaInput.value = placaInput.value.trim().toUpperCase()
    })

    salidaPlacaInput.addEventListener("blur", () => {
      salidaPlacaInput.value = salidaPlacaInput.value.trim().toUpperCase()
    })
  }

  function cargarEstadisticas() {
    try {
      // Obtener fecha actual formateada para la consulta (YYYY-MM-DD)
      const hoy = new Date().toISOString().split("T")[0]

      // Hacer la petición a la API para obtener estadísticas del día
      fetch(`${API_URL}/por-dia?fecha=${hoy}`)
        .then((response) => handleResponse(response))
        .then((data) => {
          console.log("Datos de estadísticas recibidos:", data)

          // Actualizar los elementos de estadísticas
          document.getElementById("vehiculos-activos").textContent = data.estadisticas.vehiculos_activos || 0

          document.getElementById("total-dia").textContent = data.estadisticas.total_vehiculos || 0

          // Verificar si existe ingresos_totales y mostrar correctamente
          if (data.estadisticas && "ingresos_totales" in data.estadisticas) {
            const ingresos = Number.parseFloat(data.estadisticas.ingresos_totales) || 0
            document.getElementById("ingresos-dia").textContent = `$${ingresos.toFixed(2)}`
          } else {
            console.warn("No se encontró la propiedad ingresos_totales en la respuesta")
            document.getElementById("ingresos-dia").textContent = "$0.00"
          }

          showToast("Estadísticas actualizadas", "success")
        })
        .catch((error) => {
          console.error("Error al cargar estadísticas:", error)
          showToast("Error al cargar estadísticas", "error")
        })
    } catch (error) {
      console.error("Error al procesar estadísticas:", error)
    }
  }

  // Funciones de manejo de formularios
  async function handleEntradaSubmit(e) {
    e.preventDefault()

    // Validar formulario
    if (!validateEntradaForm()) return

    const nombre = nombreInput.value.trim()
    const placa = placaInput.value.trim().toUpperCase()

    try {
      const response = await fetch(`${API_URL}/entrada`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, placa }),
      })

      const data = await handleResponse(response)

      if (response.ok) {
        // Limpiar el formulario
        entradaForm.reset()
        clearFormErrors()

        // Mostrar confirmación
        showModal(
          "Entrada Registrada",
          `Se ha registrado correctamente la entrada del vehículo con placa ${placa} a nombre de ${nombre}.`,
        )

        // Recargar registros y estadísticas
        cargarRegistros(filtroFecha.value)
        cargarEstadisticas()
      }
    } catch (error) {
      console.error("Error al registrar entrada:", error)
      showToast(error.message || "Error al registrar entrada", "error")
    }
  }

  async function handleSalidaSubmit(e) {
    e.preventDefault()

    // Validar formulario
    if (!validateSalidaForm()) return

    const placa = salidaPlacaInput.value.trim().toUpperCase()

    try {
      const response = await fetch(`${API_URL}/salida`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placa }),
      })

      const data = await handleResponse(response)

      if (response.ok) {
        // Limpiar el formulario
        salidaForm.reset()
        clearFormErrors()

        // Mostrar resultados
        showModal(
          "Salida Registrada",
          `
              <div class="result-details">
                <p><strong>Conductor:</strong> ${data.nombre}</p>
                <p><strong>Placa:</strong> ${data.placa}</p>
                <p><strong>Entrada:</strong> ${formatDateTime(data.hora_entrada)}</p>
                <p><strong>Salida:</strong> ${formatDateTime(data.hora_salida)}</p>
                <p><strong>Tiempo total:</strong> ${formatTiempo(data.minutos)}</p>
                <p><strong>Costo total:</strong> $${data.costo.toFixed(2)}</p>
              </div>
            `,
        )

        // Recargar registros y estadísticas
        cargarRegistros(filtroFecha.value)
        cargarEstadisticas()
      }
    } catch (error) {
      console.error("Error al registrar salida:", error)
      showToast(error.message || "Error al registrar salida", "error")
    }
  }

  // Funciones de validación
  function validateEntradaForm() {
    let isValid = true

    if (!validateNombre()) isValid = false
    if (!validatePlaca()) isValid = false

    return isValid
  }

  function validateSalidaForm() {
    return validateSalidaPlaca()
  }

  function validateNombre() {
    const nombre = nombreInput.value.trim()

    if (nombre === "") {
      showError(nombreError, "Por favor ingrese el nombre del conductor")
      return false
    } else if (nombre.length < 3) {
      showError(nombreError, "El nombre debe tener al menos 3 caracteres")
      return false
    } else {
      clearError(nombreError)
      return true
    }
  }

  function validatePlaca() {
    const placa = placaInput.value.trim()
    // Acepta formatos como ABC-123, ABC123, 123-ABC, etc.
    const placaRegex = /^[A-Z0-9]{2,7}(-[A-Z0-9]{1,4})?$/i

    if (placa === "") {
      showError(placaError, "Por favor ingrese el número de placa")
      return false
    } else if (!placaRegex.test(placa)) {
      showError(placaError, "Formato de placa inválido (Ej: ABC-123 o ABC123)")
      return false
    } else {
      clearError(placaError)
      return true
    }
  }

  function validateSalidaPlaca() {
    const placa = salidaPlacaInput.value.trim()
    const placaRegex = /^[A-Z0-9]{2,7}(-[A-Z0-9]{1,4})?$/i

    if (placa === "") {
      showError(salidaPlacaError, "Por favor ingrese el número de placa")
      return false
    } else if (!placaRegex.test(placa)) {
      showError(salidaPlacaError, "Formato de placa inválido (Ej: ABC-123 o ABC123)")
      return false
    } else {
      clearError(salidaPlacaError)
      return true
    }
  }

  // Funciones de utilidad para errores
  function showError(element, message) {
    element.textContent = message
    element.parentElement.querySelector("input").classList.add("input-error")
  }

  function clearError(element) {
    element.textContent = ""
    element.parentElement.querySelector("input").classList.remove("input-error")
  }

  function clearFormErrors() {
    clearError(nombreError)
    clearError(placaError)
    clearError(salidaPlacaError)
  }

  // Manejo de respuestas API
  async function handleResponse(response) {
    // Clonar la respuesta para poder leerla múltiples veces si es necesario
    const responseClone = response.clone()

    try {
      // Intentar parsear la respuesta como JSON
      const data = await response.json()

      if (!response.ok) {
        // Si hay un error, lanzar excepción con el mensaje
        throw new Error(data.message || `Error ${response.status}: ${response.statusText}`)
      }

      return data
    } catch (e) {
      // Si no es JSON, obtener el texto de la respuesta clonada
      const text = await responseClone.text()

      if (!response.ok) {
        throw new Error(text || `Error ${response.status}: ${response.statusText}`)
      }

      return { message: text }
    }
  }

  // Función para obtener los parámetros de fecha según el filtro seleccionado
  function obtenerParametrosFecha(filtro) {
    const hoy = new Date()
    let fechaInicio, fechaFin

    switch (filtro) {
      case "hoy":
        // Formato YYYY-MM-DD para el día actual
        return { fecha: hoy.toISOString().split("T")[0] }

      case "ayer":
        // Fecha de ayer
        const ayer = new Date(hoy)
        ayer.setDate(hoy.getDate() - 1)
        return { fecha: ayer.toISOString().split("T")[0] }

      case "semana":
        // Inicio de la semana (lunes)
        fechaInicio = new Date(hoy)
        const diaSemana = hoy.getDay() || 7 // 0 es domingo, convertimos a 7
        fechaInicio.setDate(hoy.getDate() - diaSemana + 1) // Retroceder al lunes

        // Fin de la semana (domingo)
        fechaFin = new Date(fechaInicio)
        fechaFin.setDate(fechaInicio.getDate() + 6)

        return {
          fecha_inicio: fechaInicio.toISOString().split("T")[0],
          fecha_fin: fechaFin.toISOString().split("T")[0],
        }

      case "mes":
        // Inicio del mes
        fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)

        // Fin del mes
        fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)

        return {
          fecha_inicio: fechaInicio.toISOString().split("T")[0],
          fecha_fin: fechaFin.toISOString().split("T")[0],
        }

      case "todos":
      default:
        // No enviamos parámetros de fecha para obtener todos los registros
        return {}
    }
  }

  // Cargar registros con filtro
  async function cargarRegistros(filtro = "hoy") {
    try {
      const registrosContainer = document.getElementById("registros")
      registrosContainer.innerHTML = '<tr><td colspan="7" class="text-center">Cargando registros...</td></tr>'

      // Obtener parámetros de fecha según el filtro
      const params = obtenerParametrosFecha(filtro)
      console.log("Parámetros de filtro:", params)

      // Construir la URL con los parámetros
      let url = API_URL
      if (Object.keys(params).length > 0) {
        const queryParams = new URLSearchParams()
        for (const [key, value] of Object.entries(params)) {
          queryParams.append(key, value)
        }
        url += `?${queryParams.toString()}`
      }

      console.log("URL de la petición:", url)

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log(`Registros recibidos (${filtro}):`, data.length)

      // Limpiar registros actuales
      registrosContainer.innerHTML = ""

      // Agregar nuevos registros
      if (data.length === 0) {
        const tr = document.createElement("tr")
        tr.innerHTML = '<td colspan="7" class="text-center">No hay registros disponibles</td>'
        registrosContainer.appendChild(tr)
      } else {
        data.forEach((registro) => {
          const tr = document.createElement("tr")

          const estado = registro.hora_salida
            ? '<span class="status status-completed">Completado</span>'
            : '<span class="status status-active">Activo</span>'

          const tiempoTotal = registro.tiempo_total ? formatTiempo(registro.tiempo_total) : "---"

          const costo = registro.costo ? `$${Number.parseFloat(registro.costo).toFixed(2)}` : "---"

          tr.innerHTML = `
              <td>${registro.nombre}</td>
              <td>${registro.placa}</td>
              <td>${formatDateTime(registro.hora_entrada)}</td>
              <td>${registro.hora_salida ? formatDateTime(registro.hora_salida) : "---"}</td>
              <td>${tiempoTotal}</td>
              <td>${costo}</td>
              <td>${estado}</td>
            `

          registrosContainer.appendChild(tr)
        })
      }

      showToast(`Registros ${obtenerTextoFiltro(filtro)} actualizados`, "success")
    } catch (error) {
      console.error("Error al cargar registros:", error)
      const registrosContainer = document.getElementById("registros")
      registrosContainer.innerHTML = `
          <tr>
            <td colspan="7" class="text-center">
              Error al cargar registros. <a href="#" onclick="cargarRegistros('${filtro}'); return false;">Reintentar</a>
            </td>
          </tr>
        `
      showToast("Error al cargar registros", "error")
    }
  }

  // Función para obtener texto descriptivo del filtro
  function obtenerTextoFiltro(filtro) {
    switch (filtro) {
      case "hoy":
        return "de hoy"
      case "ayer":
        return "de ayer"
      case "semana":
        return "de esta semana"
      case "mes":
        return "de este mes"
      case "todos":
        return ""
      default:
        return ""
    }
  }

  // Funciones de interfaz de usuario
  function showModal(title, content) {
    modalTitle.textContent = title
    modalContent.innerHTML = content
    modal.style.display = "block"
    document.body.style.overflow = "hidden" // Prevenir scroll
  }

  function closeModal() {
    modal.style.display = "none"
    document.body.style.overflow = "auto" // Restaurar scroll
  }

  function showToast(message, type = "info") {
    // Establecer mensaje y tipo
    toastMessage.textContent = message
    toast.className = "toast"
    toast.classList.add(type)
    toast.classList.add("show")

    // Auto ocultar después de 3 segundos
    setTimeout(() => {
      toast.classList.remove("show")
    }, 3000)
  }

  // Funciones de utilidad para formato
  function formatDateTime(dateTimeString) {
    if (!dateTimeString) return "---"

    const date = new Date(dateTimeString)

    // Verificar si la fecha es válida
    if (isNaN(date.getTime())) return dateTimeString

    return date.toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  function formatTiempo(minutos) {
    if (!minutos) return "---"

    minutos = Number.parseInt(minutos)

    if (minutos < 60) {
      return `${minutos} minutos`
    } else {
      const horas = Math.floor(minutos / 60)
      const minutosRestantes = minutos % 60

      if (minutosRestantes === 0) {
        return horas === 1 ? "1 hora" : `${horas} horas`
      } else {
        const horasTexto = horas === 1 ? "1 hora" : `${horas} horas`
        return `${horasTexto} y ${minutosRestantes} minutos`
      }
    }
  }
})