document.addEventListener("DOMContentLoaded", () => {
    // Bootstrap modals
    const textModal = new bootstrap.Modal(document.getElementById("textModal"))
    const usernameModal = new bootstrap.Modal(document.getElementById("usernameModal"))
  
    // Show username modal on load
    usernameModal.show()
  
    // Username handling
    let username = ""
    document.getElementById("saveUsername").addEventListener("click", () => {
      const usernameInput = document.getElementById("usernameInput").value.trim()
      if (usernameInput) {
        username = usernameInput
        usernameModal.hide()
        initializeApp()
      } else {
        alert("Please enter your name")
      }
    })
  
    // Initialize the app after username is set
    function initializeApp() {
      // Canvas setup
      const canvas = document.getElementById("whiteboard")
      const ctx = canvas.getContext("2d")
      const container = document.querySelector(".canvas-container")
  
      // Set canvas size
      function resizeCanvas() {
        canvas.width = container.clientWidth
        canvas.height = container.clientHeight
        redrawCanvas()
      }
  
      // Initial resize
      resizeCanvas()
  
      // Resize canvas when window is resized
      window.addEventListener("resize", resizeCanvas)
  
      // Drawing state
      let isDrawing = false
      let lastX = 0
      let lastY = 0
  
      // Tool state
      let currentTool = "brush"
      let currentColor = "#000000"
      let brushSize = 5
      let fontSize = 16
  
      // Shape drawing state
      let startX = 0
      let startY = 0
  
      // History for undo/redo
      let history = []
      let historyIndex = -1
      const maxHistoryLength = 20
  
      // WebSocket connection
      let socket
      let isConnected = false
      const userId = generateUserId()
  
      // Tool selection
      document.querySelectorAll('input[name="tool"]').forEach((tool) => {
        tool.addEventListener("change", function () {
          currentTool = this.value
  
          if (currentTool === "text") {
            textModal.show()
          }
        })
      })
  
      // Color picker
      document.getElementById("colorPicker").addEventListener("input", function () {
        currentColor = this.value
      })
  
      // Brush size slider
      document.getElementById("brushSize").addEventListener("input", function () {
        brushSize = Number.parseInt(this.value)
        document.getElementById("brushSizeValue").textContent = brushSize
      })
  
      // Font size slider
      document.getElementById("fontSize").addEventListener("input", function () {
        fontSize = Number.parseInt(this.value)
        document.getElementById("fontSizeValue").textContent = fontSize
      })
  
      // Canvas drawing events
      canvas.addEventListener("mousedown", startDrawing)
      canvas.addEventListener("mousemove", draw)
      canvas.addEventListener("mouseup", stopDrawing)
      canvas.addEventListener("mouseout", stopDrawing)
  
      // Touch events for mobile
      canvas.addEventListener("touchstart", handleTouchStart)
      canvas.addEventListener("touchmove", handleTouchMove)
      canvas.addEventListener("touchend", handleTouchEnd)
  
      function handleTouchStart(e) {
        e.preventDefault()
        const touch = e.touches[0]
        const rect = canvas.getBoundingClientRect()
        const mouseEvent = new MouseEvent("mousedown", {
          clientX: touch.clientX,
          clientY: touch.clientY,
        })
        canvas.dispatchEvent(mouseEvent)
      }
  
      function handleTouchMove(e) {
        e.preventDefault()
        const touch = e.touches[0]
        const mouseEvent = new MouseEvent("mousemove", {
          clientX: touch.clientX,
          clientY: touch.clientY,
        })
        canvas.dispatchEvent(mouseEvent)
      }
  
      function handleTouchEnd(e) {
        e.preventDefault()
        const mouseEvent = new MouseEvent("mouseup", {})
        canvas.dispatchEvent(mouseEvent)
      }
  
      // Start drawing
      function startDrawing(e) {
        isDrawing = true
        const rect = canvas.getBoundingClientRect()
        lastX = e.clientX - rect.left
        lastY = e.clientY - rect.top
  
        // For shapes, store starting position
        if (currentTool === "line" || currentTool === "rectangle" || currentTool === "circle") {
          startX = lastX
          startY = lastY
        }
      }
  
      // Draw on canvas
      function draw(e) {
        if (!isDrawing) return
  
        const rect = canvas.getBoundingClientRect()
        const currentX = e.clientX - rect.left
        const currentY = e.clientY - rect.top
  
        if (currentTool === "brush") {
          ctx.beginPath()
          ctx.moveTo(lastX, lastY)
          ctx.lineTo(currentX, currentY)
          ctx.strokeStyle = currentColor
          ctx.lineWidth = brushSize
          ctx.lineCap = "round"
          ctx.lineJoin = "round"
          ctx.stroke()
  
          // Send drawing data to WebSocket
          if (isConnected) {
            socket.send(
              JSON.stringify({
                type: "draw",
                tool: "brush",
                startX: lastX,
                startY: lastY,
                endX: currentX,
                endY: currentY,
                color: currentColor,
                size: brushSize,
              }),
            )
          }
  
          lastX = currentX
          lastY = currentY
        } else if (currentTool === "eraser") {
          ctx.beginPath()
          ctx.moveTo(lastX, lastY)
          ctx.lineTo(currentX, currentY)
          ctx.strokeStyle = "#ffffff"
          ctx.lineWidth = brushSize * 2
          ctx.lineCap = "round"
          ctx.lineJoin = "round"
          ctx.stroke()
  
          // Send eraser data to WebSocket
          if (isConnected) {
            socket.send(
              JSON.stringify({
                type: "draw",
                tool: "eraser",
                startX: lastX,
                startY: lastY,
                endX: currentX,
                endY: currentY,
                size: brushSize * 2,
              }),
            )
          }
  
          lastX = currentX
          lastY = currentY
        }
      }
  
      // Stop drawing
      function stopDrawing(e) {
        if (isDrawing) {
          isDrawing = false
  
          if (e && e.type !== "mouseout") {
            const rect = canvas.getBoundingClientRect()
            const currentX = e.clientX - rect.left
            const currentY = e.clientY - rect.top
  
            // Draw shapes when mouse is released
            if (currentTool === "line") {
              drawLine(startX, startY, currentX, currentY)
            } else if (currentTool === "rectangle") {
              drawRectangle(startX, startY, currentX - startX, currentY - startY)
            } else if (currentTool === "circle") {
              const radius = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2))
              drawCircle(startX, startY, radius)
            }
          }
  
          // Save canvas state for undo/redo
          saveCanvasState()
        }
      }
  
      // Draw line
      function drawLine(x1, y1, x2, y2) {
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.strokeStyle = currentColor
        ctx.lineWidth = brushSize
        ctx.lineCap = "round"
        ctx.stroke()
  
        // Send line data to WebSocket
        if (isConnected) {
          socket.send(
            JSON.stringify({
              type: "draw",
              tool: "line",
              startX: x1,
              startY: y1,
              endX: x2,
              endY: y2,
              color: currentColor,
              size: brushSize,
            }),
          )
        }
      }
  
      // Draw rectangle
      function drawRectangle(x, y, width, height) {
        ctx.beginPath()
        ctx.rect(x, y, width, height)
        ctx.strokeStyle = currentColor
        ctx.lineWidth = brushSize
        ctx.stroke()
  
        // Send rectangle data to WebSocket
        if (isConnected) {
          socket.send(
            JSON.stringify({
              type: "draw",
              tool: "rectangle",
              x: x,
              y: y,
              width: width,
              height: height,
              color: currentColor,
              size: brushSize,
            }),
          )
        }
      }
  
      // Draw circle
      function drawCircle(x, y, radius) {
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.strokeStyle = currentColor
        ctx.lineWidth = brushSize
        ctx.stroke()
  
        // Send circle data to WebSocket
        if (isConnected) {
          socket.send(
            JSON.stringify({
              type: "draw",
              tool: "circle",
              x: x,
              y: y,
              radius: radius,
              color: currentColor,
              size: brushSize,
            }),
          )
        }
      }
  
      // Add text to canvas
      function addText(text, x, y) {
        ctx.font = `${fontSize}px Arial`
        ctx.fillStyle = currentColor
        ctx.fillText(text, x, y)
  
        // Send text data to WebSocket
        if (isConnected) {
          socket.send(
            JSON.stringify({
              type: "draw",
              tool: "text",
              text: text,
              x: x,
              y: y,
              color: currentColor,
              fontSize: fontSize,
            }),
          )
        }
  
        // Save canvas state for undo/redo
        saveCanvasState()
      }
  
      // Add text button click
      document.getElementById("addTextBtn").addEventListener("click", () => {
        const text = document.getElementById("textInput").value.trim()
  
        if (text) {
          // Position text in the center of the visible canvas
          const x = canvas.width / 2
          const y = canvas.height / 2
  
          addText(text, x, y)
  
          // Close modal
          textModal.hide()
  
          // Clear input
          document.getElementById("textInput").value = ""
  
          // Reset tool to brush
          document.getElementById("brush").checked = true
          currentTool = "brush"
        }
      })
  
      // Clear canvas
      document.getElementById("clearCanvas").addEventListener("click", () => {
        if (confirm("Are you sure you want to clear the whiteboard?")) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
  
          // Send clear command to WebSocket
          if (isConnected) {
            socket.send(
              JSON.stringify({
                type: "clear",
              }),
            )
          }
  
          // Save canvas state for undo/redo
          saveCanvasState()
        }
      })
  
      // Save canvas state for undo/redo
      function saveCanvasState() {
        // If we're not at the end of the history array, remove everything after current index
        if (historyIndex < history.length - 1) {
          history = history.slice(0, historyIndex + 1)
        }
  
        // Add current canvas state to history
        history.push(canvas.toDataURL())
  
        // Limit history length
        if (history.length > maxHistoryLength) {
          history.shift()
        }
  
        historyIndex = history.length - 1
  
        // Update undo/redo buttons
        updateUndoRedoButtons()
      }
  
      // Redraw canvas from history
      function redrawCanvas() {
        if (historyIndex >= 0 && history.length > 0) {
          const img = new Image()
          img.src = history[historyIndex]
          img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(img, 0, 0)
          }
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
      }
  
      // Update undo/redo buttons
      function updateUndoRedoButtons() {
        const undoBtn = document.getElementById("undoBtn")
        const redoBtn = document.getElementById("redoBtn")
  
        undoBtn.disabled = historyIndex <= 0
        redoBtn.disabled = historyIndex >= history.length - 1
      }
  
      // Undo action
      document.getElementById("undoBtn").addEventListener("click", () => {
        if (historyIndex > 0) {
          historyIndex--
          redrawCanvas()
          updateUndoRedoButtons()
  
          // Send undo command to WebSocket
          if (isConnected) {
            socket.send(
              JSON.stringify({
                type: "undo",
              }),
            )
          }
        }
      })
  
      // Redo action
      document.getElementById("redoBtn").addEventListener("click", () => {
        if (historyIndex < history.length - 1) {
          historyIndex++
          redrawCanvas()
          updateUndoRedoButtons()
  
          // Send redo command to WebSocket
          if (isConnected) {
            socket.send(
              JSON.stringify({
                type: "redo",
              }),
            )
          }
        }
      })
  
      // Export to PDF
      document.getElementById("exportPdf").addEventListener("click", () => {
        const { jsPDF } = window.jspdf
        const pdf = new jsPDF("landscape")
  
        // Get canvas data URL
        const dataURL = canvas.toDataURL("image/jpeg", 1.0)
  
        // Calculate PDF dimensions
        const pdfWidth = pdf.internal.pageSize.getWidth()
        const pdfHeight = pdf.internal.pageSize.getHeight()
  
        // Calculate scaling ratio to fit canvas to PDF
        const canvasRatio = canvas.width / canvas.height
        const pdfRatio = pdfWidth / pdfHeight
  
        let finalWidth, finalHeight
  
        if (canvasRatio > pdfRatio) {
          // Canvas is wider than PDF
          finalWidth = pdfWidth
          finalHeight = pdfWidth / canvasRatio
        } else {
          // Canvas is taller than PDF
          finalHeight = pdfHeight
          finalWidth = pdfHeight * canvasRatio
        }
  
        // Center the image
        const xOffset = (pdfWidth - finalWidth) / 2
        const yOffset = (pdfHeight - finalHeight) / 2
  
        // Add image to PDF
        pdf.addImage(dataURL, "JPEG", xOffset, yOffset, finalWidth, finalHeight)
  
        // Save PDF
        pdf.save("collabboard.pdf")
      })
  
      // Send chat message
      document.getElementById("sendMessage").addEventListener("click", sendChatMessage)
      document.getElementById("chatInput").addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          sendChatMessage()
        }
      })
  
      function sendChatMessage() {
        const chatInput = document.getElementById("chatInput")
        const message = chatInput.value.trim()
  
        if (message && isConnected) {
          // Send message to WebSocket
          socket.send(
            JSON.stringify({
              type: "chat",
              username: username,
              message: message,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            }),
          )
  
          // Clear input
          chatInput.value = ""
        }
      }
  
      // Add chat message to the chat panel
      function addChatMessage(sender, message, timestamp) {
        const chatMessages = document.getElementById("chatMessages")
  
        const messageElement = document.createElement("div")
        messageElement.className = "message"
  
        const messageHTML = `
          <div class="message-header">
            <span class="message-sender">${sender}</span>
            <span class="message-time">${timestamp}</span>
          </div>
          <div class="message-content">${message}</div>
        `
  
        messageElement.innerHTML = messageHTML
        chatMessages.appendChild(messageElement)
  
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight
      }
  
      // Generate a random user ID
      function generateUserId() {
        return "user_" + Math.random().toString(36).substr(2, 9)
      }
  
      // Add user to the users list
      function addUser(userId, username) {
        const usersList = document.getElementById("usersList")
  
        // Check if user already exists
        if (!document.querySelector(`.list-group-item[data-user-id="${userId}"]`)) {
          const userElement = document.createElement("li")
          userElement.className = "list-group-item d-flex align-items-center"
          userElement.setAttribute("data-user-id", userId)
  
          const initials = username
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
  
          const userHTML = `
            <span class="user-avatar">${initials}</span>
            <span class="ms-2">${username}${userId === window.userId ? " (You)" : ""}</span>
          `
  
          userElement.innerHTML = userHTML
          usersList.appendChild(userElement)
        }
      }
  
      // Remove user from the users list
      function removeUser(userId) {
        const userElement = document.querySelector(`.list-group-item[data-user-id="${userId}"]`)
        if (userElement) {
          userElement.remove()
        }
      }
  
      // Connect to WebSocket server
      function connectWebSocket() {
        socket = new WebSocket("https://collabboard-lvxk.onrender.com")
  
        socket.onopen = () => {
          isConnected = true
          updateConnectionStatus(true)
          console.log("WebSocket connection established")
  
          // Store user ID globally
          window.userId = userId
  
          // Send join message
          socket.send(
            JSON.stringify({
              type: "join",
              userId: userId,
              username: username,
            }),
          )
  
          // Add yourself to the users list
          addUser(userId, username)
  
          // Add system message
          addChatMessage(
            "System",
            "Connected to the whiteboard server.",
            new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          )
        }
  
        socket.onclose = () => {
          isConnected = false
          updateConnectionStatus(false)
          console.log("WebSocket connection closed")
  
          // Add system message
          addChatMessage(
            "System",
            "Disconnected from the whiteboard server. Trying to reconnect...",
            new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          )
  
          // Try to reconnect after 5 seconds
          setTimeout(connectWebSocket, 5000)
        }
  
        socket.onerror = (error) => {
          console.error("WebSocket error:", error)
        }
  
        socket.onmessage = (event) => {
          const data = JSON.parse(event.data)
          handleWebSocketMessage(data)
        }
      }
  
      // Update connection status indicator
      function updateConnectionStatus(connected) {
        const statusIndicator = document.querySelector(".status-indicator")
        const statusText = document.querySelector(".status-text")
  
        if (connected) {
          statusIndicator.classList.remove("disconnected")
          statusIndicator.classList.add("connected")
          statusText.textContent = "Connected"
        } else {
          statusIndicator.classList.remove("connected")
          statusIndicator.classList.add("disconnected")
          statusText.textContent = "Disconnected"
        }
      }
  
      // Handle incoming WebSocket messages
      function handleWebSocketMessage(data) {
        switch (data.type) {
          case "draw":
            handleDrawData(data)
            break
          case "clear":
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            saveCanvasState()
            break
          case "undo":
            if (historyIndex > 0) {
              historyIndex--
              redrawCanvas()
              updateUndoRedoButtons()
            }
            break
          case "redo":
            if (historyIndex < history.length - 1) {
              historyIndex++
              redrawCanvas()
              updateUndoRedoButtons()
            }
            break
          case "chat":
            addChatMessage(data.username, data.message, data.timestamp)
            break
          case "user_joined":
            addUser(data.userId, data.username)
            addChatMessage("System", `${data.username} joined the whiteboard.`, data.timestamp)
            break
          case "user_left":
            removeUser(data.userId)
            addChatMessage("System", `${data.username} left the whiteboard.`, data.timestamp)
            break
        }
      }
  
      // Handle drawing data from WebSocket
      function handleDrawData(data) {
        switch (data.tool) {
          case "brush":
          case "eraser":
            ctx.beginPath()
            ctx.moveTo(data.startX, data.startY)
            ctx.lineTo(data.endX, data.endY)
            ctx.strokeStyle = data.tool === "eraser" ? "#ffffff" : data.color
            ctx.lineWidth = data.size
            ctx.lineCap = "round"
            ctx.lineJoin = "round"
            ctx.stroke()
            break
          case "line":
            ctx.beginPath()
            ctx.moveTo(data.startX, data.startY)
            ctx.lineTo(data.endX, data.endY)
            ctx.strokeStyle = data.color
            ctx.lineWidth = data.size
            ctx.lineCap = "round"
            ctx.stroke()
            break
          case "rectangle":
            ctx.beginPath()
            ctx.rect(data.x, data.y, data.width, data.height)
            ctx.strokeStyle = data.color
            ctx.lineWidth = data.size
            ctx.stroke()
            break
          case "circle":
            ctx.beginPath()
            ctx.arc(data.x, data.y, data.radius, 0, Math.PI * 2)
            ctx.strokeStyle = data.color
            ctx.lineWidth = data.size
            ctx.stroke()
            break
          case "text":
            ctx.font = `${data.fontSize}px Arial`
            ctx.fillStyle = data.color
            ctx.fillText(data.text, data.x, data.y)
            break
        }
      }
  
      // Initialize
      saveCanvasState()
      connectWebSocket()
    }
  })
  
  