const statusLine = document.getElementById('statusLine')
const transcriptList = document.getElementById('transcriptList')
const analysisBox = document.getElementById('analysisBox')
const assistantNameHeading = document.getElementById('assistantNameHeading')
const assistantNameInput = document.getElementById('assistantNameInput')
const wakePrefixInput = document.getElementById('wakePrefixInput')
const startBtn = document.getElementById('startBtn')
const stopBtn = document.getElementById('stopBtn')
const demoInput = document.getElementById('demoInput')
const demoBtn = document.getElementById('demoBtn')

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null

let recognition = null
let isListening = false
let isAwake = false

const STORAGE_KEY = 'my_ai_voice_ui_settings_v1'

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (typeof parsed.assistantName === 'string' && parsed.assistantName.trim()) {
      assistantNameInput.value = parsed.assistantName
    }
    if (typeof parsed.wakePrefix === 'string' && parsed.wakePrefix.trim()) {
      wakePrefixInput.value = parsed.wakePrefix
    }
  } catch {
    // Ignore storage corruption and continue with defaults.
  }
}

function saveSettings() {
  const settings = {
    assistantName: assistantNameInput.value,
    wakePrefix: wakePrefixInput.value,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

function assistantName() {
  const name = assistantNameInput.value.trim()
  return name.length > 0 ? name : 'Jarvis'
}

function wakePhrase() {
  return `${wakePrefixInput.value.toLowerCase()} ${assistantName().toLowerCase()}`
}

function setStatus(text) {
  statusLine.textContent = text
}

function speak(text) {
  if (!window.speechSynthesis) return
  const u = new SpeechSynthesisUtterance(text)
  u.pitch = 1.12
  u.rate = 1
  window.speechSynthesis.speak(u)
}

function addTranscript(kind, text) {
  const li = document.createElement('li')
  li.innerHTML = `<div class="tag">${kind}</div><div>${text}</div>`
  transcriptList.prepend(li)
}

function analyzeCommand(text) {
  const normalized = text.toLowerCase()
  let intent = 'general'
  let confidence = 0.62
  const entities = []
  let actionPlan = 'Respond with assistant guidance.'

  if (normalized.includes('open ') || normalized.includes('launch ')) {
    intent = 'launch_app'
    confidence = 0.92
    if (normalized.includes('vscode') || normalized.includes('code')) entities.push('VS Code')
    if (normalized.includes('browser')) entities.push('Browser')
    if (normalized.includes('unreal')) entities.push('Unreal Engine')
    actionPlan = 'Call local launcher route and confirm completion.'
  } else if (normalized.includes('search') || normalized.includes('find')) {
    intent = 'search_web'
    confidence = 0.86
    actionPlan = 'Open browser with query intent.'
  } else if (normalized.includes('clipboard')) {
    intent = 'clipboard_control'
    confidence = 0.9
    actionPlan = 'Route to clipboard read or write command.'
  } else if (normalized.includes('time')) {
    intent = 'time_request'
    confidence = 0.9
    actionPlan = 'Return current local time.'
  }

  return {
    intent,
    confidence,
    entities,
    actionPlan,
  }
}

async function runCommand(text) {
  const analysis = analyzeCommand(text)

  if (analysis.intent === 'launch_app') {
    if (text.toLowerCase().includes('vscode') || text.toLowerCase().includes('code')) {
      await postOpenApp('code', ['.'])
      return 'Opened VS Code.'
    }
    if (text.toLowerCase().includes('browser')) {
      await postOpenApp('cmd.exe', ['/c', 'start', '', 'https://www.google.com'])
      return 'Opened browser.'
    }
    if (text.toLowerCase().includes('unreal')) {
      await postOpenApp('UnrealEditor.exe', [])
      return 'Tried opening Unreal Engine.'
    }
    await postOpenApp('explorer.exe', [])
    return 'Opened file explorer.'
  }

  if (analysis.intent === 'time_request') {
    return `Current time is ${new Date().toLocaleTimeString()}.`
  }

  if (analysis.intent === 'search_web') {
    const query = encodeURIComponent(text.replace(/search|find/gi, '').trim())
    await postOpenApp('cmd.exe', ['/c', 'start', '', `https://www.google.com/search?q=${query}`])
    return 'Opened search in browser.'
  }

  if (analysis.intent === 'clipboard_control') {
    return 'Clipboard command detected. Use precise read or write request.'
  }

  return 'I heard you. Please tell me the exact task and I will do it.'
}

async function postOpenApp(appPath, args) {
  try {
    const response = await fetch('http://127.0.0.1:7823/system/open-app', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ app_path: appPath, args }),
    })
    if (!response.ok) {
      throw new Error(`launcher failed with ${response.status}`)
    }
  } catch (error) {
    // UI stays functional even when sidecar is offline.
    console.warn(error)
  }
}

function renderAnalysis(text, analysis, resultText) {
  analysisBox.innerHTML = `
    <p><strong>Input:</strong> ${text}</p>
    <p><strong>Intent:</strong> ${analysis.intent}</p>
    <p><strong>Confidence:</strong> ${(analysis.confidence * 100).toFixed(1)}%</p>
    <p><strong>Entities:</strong> ${analysis.entities.length ? analysis.entities.join(', ') : 'None'}</p>
    <p><strong>Action Plan:</strong> ${analysis.actionPlan}</p>
    <p><strong>Execution Result:</strong> ${resultText}</p>
  `
}

async function handleUserSpeech(text) {
  addTranscript('voice input', text)

  const lower = text.toLowerCase().trim()

  if (!isAwake) {
    if (lower.includes(wakePhrase())) {
      isAwake = true
      const greeting = `Hello, I am ${assistantName()}. Great to hear you. What should I do for you?`
      setStatus(`Awake. ${assistantName()} is ready.`)
      addTranscript('assistant', greeting)
      speak(greeting)
      return
    }
    setStatus(`Listening for wake phrase: ${wakePhrase()}`)
    return
  }

  const analysis = analyzeCommand(text)
  const result = await runCommand(text)
  renderAnalysis(text, analysis, result)
  addTranscript('assistant', result)
  speak(result)
  isAwake = false
  setStatus('Task handled. Waiting for wake word.')
}

function startListening() {
  if (!SpeechRecognition) {
    setStatus('Speech recognition is not supported in this browser.')
    return
  }
  if (isListening) return

  recognition = new SpeechRecognition()
  recognition.continuous = true
  recognition.interimResults = false
  recognition.lang = 'en-US'

  recognition.onresult = event => {
    const i = event.results.length - 1
    const text = event.results[i][0].transcript
    void handleUserSpeech(text)
  }

  recognition.onerror = event => {
    setStatus(`Mic error: ${event.error}`)
  }

  recognition.onend = () => {
    if (isListening) {
      recognition.start()
    }
  }

  recognition.start()
  isListening = true
  setStatus(`Listening. Say ${wakePhrase()} to wake me.`)
}

function stopListening() {
  isListening = false
  if (recognition) {
    recognition.stop()
  }
  setStatus('Stopped listening.')
}

assistantNameInput.addEventListener('input', () => {
  saveSettings()
  assistantNameHeading.textContent = assistantName()
  if (!isListening) {
    setStatus(`Idle. Wake phrase is ${wakePhrase()}.`)
  }
})

wakePrefixInput.addEventListener('change', () => {
  saveSettings()
  if (!isListening) {
    setStatus(`Idle. Wake phrase is ${wakePhrase()}.`)
  }
})

startBtn.addEventListener('click', () => {
  startListening()
})

stopBtn.addEventListener('click', () => {
  stopListening()
})

demoBtn.addEventListener('click', () => {
  const text = demoInput.value.trim()
  if (!text) return
  void handleUserSpeech(text)
})

setStatus(`Idle. Wake phrase is ${wakePhrase()}.`)
assistantNameHeading.textContent = assistantName()

loadSettings()
assistantNameHeading.textContent = assistantName()
setStatus(`Idle. Wake phrase is ${wakePhrase()}.`)

// Attempt hands-free startup after page load; browser mic permission may still prompt.
window.setTimeout(() => {
  startListening()
}, 700)
