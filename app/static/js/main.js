const logo = document.querySelector(".logo")
const notesContainer = document.getElementById("notes-container")
const newNoteBtn = document.querySelector(".new-note-btn")
const authBtn = document.querySelector(".auth-btn")
const userChip = document.getElementById("user-chip")

const authOverlay = document.getElementById("auth-overlay")
const authModal = document.getElementById("auth-modal")
const authClose = document.getElementById("auth-close")
const loginView = document.getElementById("login-view")
const registerView = document.getElementById("register-view")
const authMessage = document.getElementById("auth-message")

const loginUsername = document.getElementById("login-username")
const loginPassword = document.getElementById("login-password")
const loginSubmit = document.getElementById("login-submit")
const openRegister = document.getElementById("open-register")

const registerUsername = document.getElementById("register-username")
const registerPassword = document.getElementById("register-password")
const registerConfirm = document.getElementById("register-confirm")
const registerSubmit = document.getElementById("register-submit")
const openLogin = document.getElementById("open-login")

let zIndex = 1
let currentUser = null

function buildCrystalLogo() {
    const text = logo.textContent.trim()
    logo.textContent = ""
    const modes = ["steady", "blink", "pulse", "dim", "half"]

    for (const char of text) {
        const span = document.createElement("span")
        span.className = "crystal-letter"
        span.textContent = char
        span.dataset.letter = char.toLowerCase()
        span.dataset.mode = modes[Math.floor(Math.random() * modes.length)]
        span.style.setProperty("--delay", `${Math.random() * 7}s`)
        logo.appendChild(span)
    }
}

function showAuthMessage(message, isError = false) {
    authMessage.textContent = message
    authMessage.classList.toggle("error", isError)
}

function openAuthModal(mode = "login") {
    authOverlay.classList.remove("hidden")
    authModal.classList.add("pop")
    showAuthView(mode)
}

function closeAuthModal() {
    authOverlay.classList.add("hidden")
    authModal.classList.remove("pop")
    showAuthMessage("")
}

function showAuthView(mode) {
    const isLogin = mode === "login"
    loginView.classList.toggle("hidden", !isLogin)
    registerView.classList.toggle("hidden", isLogin)
    showAuthMessage("")
}

function updateAuthUi() {
    const isLogged = Boolean(currentUser)
    newNoteBtn.disabled = !isLogged

    if (isLogged) {
        authBtn.textContent = "LOGOUT"
        userChip.textContent = `@${currentUser}`
        userChip.classList.remove("hidden")
    } else {
        authBtn.textContent = "AUTH"
        userChip.classList.add("hidden")
    }
}

// Frontend requests to backend API live here (fetch wrappers).
function formatApiError(detail) {
    if (typeof detail === "string") return detail
    if (Array.isArray(detail)) {
        const first = detail[0]
        if (!first) return "Validation error"
        if (typeof first === "string") return first
        if (first.msg) return first.msg
    }
    if (detail && typeof detail === "object" && detail.msg) return detail.msg
    return "Request failed"
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        method: options.method || "GET",
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        credentials: "include",
        body: options.body ? JSON.stringify(options.body) : undefined,
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
        const error = new Error(formatApiError(data.detail))
        error.status = response.status
        throw error
    }
    return data
}

function humanAuthError(err, fallback) {
    if (!err) return fallback
    if (err.status === 422) return "Please fill in all required fields."
    if (err.status === 401) return "Invalid username or password."
    if (err.status === 409) return "This username is already taken."
    if (err.message === "Passwords do not match") return "Passwords do not match."
    return fallback
}

function debounce(fn, delay = 250) {
    let timer = null
    return (...args) => {
        clearTimeout(timer)
        timer = setTimeout(() => fn(...args), delay)
    }
}

function clearNotes() {
    notesContainer.innerHTML = ""
}

function notePayloadFromElement(note) {
    return {
        id: note.dataset.id || null,
        title: note.querySelector(".note-name").value,
        content: note.querySelector("textarea").value,
        x: note.offsetLeft,
        y: note.offsetTop,
        width: note.offsetWidth,
        height: note.offsetHeight,
        collapsed: note.classList.contains("collapsed"),
    }
}

async function persistNote(note) {
    if (!currentUser) return
    const payload = notePayloadFromElement(note)
    const result = await api("/notes", { method: "POST", body: payload })
    note.dataset.id = result.note.id
}

function createNoteElement(noteData) {
    const note = document.createElement("div")
    note.classList.add("note")

    const width = noteData.width || (window.innerWidth <= 768 ? Math.min(window.innerWidth * 0.86, 320) : 300)
    const height = noteData.height || 210
    const x = Math.max(0, Math.min(noteData.x ?? 12, window.innerWidth - width))
    const y = Math.max(0, Math.min(noteData.y ?? 12, window.innerHeight - height))

    note.style.left = `${x}px`
    note.style.top = `${y}px`
    note.style.width = `${width}px`
    note.style.height = `${height}px`
    note.style.zIndex = zIndex++

    if (noteData.id) note.dataset.id = noteData.id

    note.innerHTML = `
        <div class="note-header">
            <div class="drag-zone" title="Drag"></div>
            <input class="note-name" value="${escapeHtml(noteData.title || "NOTE")}" maxlength="64" />
            <button class="collapse-btn" title="Collapse">—</button>
            <button class="delete-btn">✕</button>
        </div>
        <textarea placeholder="write something...">${escapeHtml(noteData.content || "")}</textarea>
        <div class="resize-handle" title="Resize"></div>
    `

    notesContainer.appendChild(note)

    const collapseBtn = note.querySelector(".collapse-btn")
    if (noteData.collapsed) {
        note.classList.add("collapsed")
        collapseBtn.textContent = "+"
        collapseBtn.title = "Expand"
        note.style.height = "58px"
    }

    const saveDebounced = debounce(() => {
        persistNote(note).catch((err) => showAuthMessage(err.message, true))
    }, 220)

    bindNoteEvents(note, saveDebounced)
    return note
}

function bindNoteEvents(note, saveDebounced) {
    const collapseBtn = note.querySelector(".collapse-btn")
    const deleteBtn = note.querySelector(".delete-btn")
    const titleInput = note.querySelector(".note-name")
    const textarea = note.querySelector("textarea")

    enableDragging(note, saveDebounced)
    enableResizing(note, saveDebounced)

    collapseBtn.addEventListener("click", () => {
        const isCollapsed = note.classList.toggle("collapsed")
        if (isCollapsed) {
            note.dataset.prevHeight = `${note.offsetHeight}px`
            note.style.height = "58px"
            collapseBtn.textContent = "+"
            collapseBtn.title = "Expand"
        } else {
            note.style.height = note.dataset.prevHeight || "210px"
            collapseBtn.textContent = "—"
            collapseBtn.title = "Collapse"
        }
        saveDebounced()
    })

    deleteBtn.addEventListener("click", async () => {
        const noteId = note.dataset.id
        note.remove()
        if (!noteId) return
        try {
            await api(`/notes/${noteId}`, { method: "DELETE" })
        } catch (err) {
            showAuthMessage(err.message, true)
        }
    })

    titleInput.addEventListener("input", saveDebounced)
    textarea.addEventListener("input", saveDebounced)
}

async function createNote() {
    if (!currentUser) {
        openAuthModal("login")
        showAuthMessage("Login required", true)
        return
    }

    const baseWidth = window.innerWidth <= 768 ? Math.min(window.innerWidth * 0.86, 320) : 300
    const baseHeight = 210
    const btnRect = newNoteBtn.getBoundingClientRect()
    const desiredLeft = btnRect.left - baseWidth - 14
    const desiredTop = btnRect.top

    const noteData = {
        title: "NOTE",
        content: "",
        x: Math.max(10, Math.min(desiredLeft, window.innerWidth - baseWidth - 10)),
        y: Math.max(10, Math.min(desiredTop, window.innerHeight - baseHeight - 10)),
        width: baseWidth,
        height: baseHeight,
        collapsed: false,
    }

    const note = createNoteElement(noteData)
    try {
        await persistNote(note)
    } catch (err) {
        showAuthMessage(err.message, true)
    }
}

function enableDragging(note, onChange) {
    const header = note.querySelector(".note-header")
    const dragZone = note.querySelector(".drag-zone")
    const deleteBtn = note.querySelector(".delete-btn")
    const collapseBtn = note.querySelector(".collapse-btn")
    const titleInput = note.querySelector(".note-name")

    let startX = 0
    let startY = 0
    let startLeft = 0
    let startTop = 0
    let activePointerId = null

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

    const startDrag = (e) => {
        if (e.target === deleteBtn || e.target.closest(".delete-btn")) return
        if (e.target === collapseBtn || e.target.closest(".collapse-btn")) return
        if (e.target === titleInput || e.target.closest(".note-name")) return
        if (e.button !== 0 && e.pointerType !== "touch") return

        activePointerId = e.pointerId
        note.style.zIndex = zIndex++
        note.classList.add("dragging")

        startX = e.clientX
        startY = e.clientY
        startLeft = note.offsetLeft
        startTop = note.offsetTop

        header.setPointerCapture(activePointerId)
    }

    header.addEventListener("pointerdown", startDrag)
    dragZone.addEventListener("pointerdown", startDrag)

    header.addEventListener("pointermove", (e) => {
        if (activePointerId !== e.pointerId) return

        const deltaX = e.clientX - startX
        const deltaY = e.clientY - startY

        const maxLeft = window.innerWidth - note.offsetWidth
        const maxTop = window.innerHeight - note.offsetHeight

        note.style.left = `${clamp(startLeft + deltaX, 0, maxLeft)}px`
        note.style.top = `${clamp(startTop + deltaY, 0, maxTop)}px`
    })

    const endDrag = (e) => {
        if (activePointerId !== e.pointerId) return
        activePointerId = null
        note.classList.remove("dragging")
        header.releasePointerCapture(e.pointerId)
        onChange()
    }

    header.addEventListener("pointerup", endDrag)
    header.addEventListener("pointercancel", endDrag)
}

function enableResizing(note, onChange) {
    const handle = note.querySelector(".resize-handle")
    if (!handle) return

    let startX = 0
    let startY = 0
    let startWidth = 0
    let startHeight = 0
    let activePointerId = null

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

    handle.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 && e.pointerType !== "touch") return
        e.preventDefault()
        e.stopPropagation()

        activePointerId = e.pointerId
        note.style.zIndex = zIndex++

        startX = e.clientX
        startY = e.clientY
        startWidth = note.offsetWidth
        startHeight = note.offsetHeight

        handle.setPointerCapture(activePointerId)
    })

    handle.addEventListener("pointermove", (e) => {
        if (activePointerId !== e.pointerId) return

        const maxWidth = Math.max(160, window.innerWidth - note.offsetLeft)
        const maxHeight = Math.max(58, window.innerHeight - note.offsetTop)

        const nextWidth = clamp(startWidth + (e.clientX - startX), 150, maxWidth)
        const nextHeight = clamp(startHeight + (e.clientY - startY), 58, maxHeight)

        note.style.width = `${nextWidth}px`
        note.style.height = `${nextHeight}px`
    })

    const endResize = (e) => {
        if (activePointerId !== e.pointerId) return
        activePointerId = null
        handle.releasePointerCapture(e.pointerId)
        onChange()
    }

    handle.addEventListener("pointerup", endResize)
    handle.addEventListener("pointercancel", endResize)
}

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
}

async function loadNotes() {
    clearNotes()
    try {
        const data = await api("/notes")
        currentUser = data.username
        updateAuthUi()
        data.notes.forEach((note) => createNoteElement(note))
    } catch {
        currentUser = null
        updateAuthUi()
        clearNotes()
    }
}

async function handleLogin() {
    if (!loginUsername.value.trim() || !loginPassword.value) {
        showAuthMessage("Please enter username and password.", true)
        return
    }

    try {
        const data = await api("/login", {
            method: "POST",
            body: {
                username: loginUsername.value.trim(),
                password: loginPassword.value,
            },
        })

        currentUser = data.username
        updateAuthUi()
        closeAuthModal()
        await loadNotes()
    } catch (err) {
        showAuthMessage(humanAuthError(err, "Unable to login right now."), true)
    }
}

async function handleRegister() {
    if (!registerUsername.value.trim() || !registerPassword.value || !registerConfirm.value) {
        showAuthMessage("Please fill all fields.", true)
        return
    }

    try {
        await api("/register", {
            method: "POST",
            body: {
                username: registerUsername.value.trim(),
                password: registerPassword.value,
                confirm_password: registerConfirm.value,
            },
        })
        showAuthMessage("Account created. Login now.")
        showAuthView("login")
        loginUsername.value = registerUsername.value.trim()
    } catch (err) {
        showAuthMessage(humanAuthError(err, "Unable to create account right now."), true)
    }
}

async function handleLogout() {
    try {
        await api("/logout", { method: "POST" })
    } finally {
        // User session is removed on backend; frontend clears user-bound notes.
        currentUser = null
        clearNotes()
        updateAuthUi()
    }
}

function bindUiEvents() {
    document.addEventListener("mousemove", (e) => {
        const x = (window.innerWidth / 2 - e.pageX) / 35
        const y = (window.innerHeight / 2 - e.pageY) / 35

        logo.style.transform = `
            translate(-50%,-50%)
            rotateY(${x}deg)
            rotateX(${-y}deg)
            translateZ(30px)
        `
    })

    newNoteBtn.addEventListener("click", createNote)

    authBtn.addEventListener("click", () => {
        if (currentUser) {
            handleLogout()
            return
        }
        openAuthModal("login")
    })

    authClose.addEventListener("click", closeAuthModal)
    authOverlay.addEventListener("click", (e) => {
        if (e.target === authOverlay) closeAuthModal()
    })

    openRegister.addEventListener("click", () => showAuthView("register"))
    openLogin.addEventListener("click", () => showAuthView("login"))

    loginSubmit.addEventListener("click", handleLogin)
    registerSubmit.addEventListener("click", handleRegister)

    window.addEventListener("resize", () => {
        document.querySelectorAll(".note").forEach((note) => {
            const maxLeft = Math.max(0, window.innerWidth - note.offsetWidth)
            const maxTop = Math.max(0, window.innerHeight - note.offsetHeight)
            note.style.left = `${Math.min(note.offsetLeft, maxLeft)}px`
            note.style.top = `${Math.min(note.offsetTop, maxTop)}px`
        })
    })
}

buildCrystalLogo()
bindUiEvents()
updateAuthUi()
loadNotes()
