/**
 * LEX — CONSUMER AI AGENT (FRONTEND CONTROLLER)
 * Sidebar estilo Grok Bot, histórico de conversas com busca, paleta pitch-black,
 * raposa com micro-animações expressivas, 100% ícones SVG e zero emojis.
 */

// ============================================================================
// 1. ESTADO GLOBAL DA APLICAÇÃO (AppState)
// ============================================================================
const AppState = {
  lexState: 'idle', // 'idle' | 'listening' | 'thinking' | 'success' | 'confused'
  backpack: {
    tables: [],
    flashcards: [],
    agenda: [],
    summaries: [],
    total_items: 0
  },
  conversations: [], // [ { id, title, preview, timestamp, updatedAt, colorScheme, messages: [] } ]
  activeConversationId: null,
  messages: [], // Mensagens da conversa atualmente ativa
  searchQuery: '',
  selectedDeckId: null,
  currentFlashcardIndex: 0,
  activeBackpackTab: 'tables',
  attachedPhotoBase64: null,
  isRecording: false,
  mediaRecorder: null,
  audioChunks: [],
  audioStream: null,
  audioContext: null,
  deferredPwaPrompt: null
};

// ============================================================================
// 2. SINTETIZADOR DE SONS WEB AUDIO API
// ============================================================================
function getAudioContext() {
  if (!AppState.audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      AppState.audioContext = new AudioContextClass();
    }
  }
  if (AppState.audioContext && AppState.audioContext.state === 'suspended') {
    AppState.audioContext.resume();
  }
  return AppState.audioContext;
}

function playSound(type) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'pop') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'success') {
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = 'triangle';
        o.frequency.setValueAtTime(freq, now + idx * 0.07);
        g.gain.setValueAtTime(0.09, now + idx * 0.07);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.22);
        o.start(now + idx * 0.07);
        o.stop(now + idx * 0.07 + 0.22);
      });
    } else if (type === 'confused') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.linearRampToValueAtTime(490, now + 0.16);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'flip') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.08);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'delete') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.09);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.09);
    }
  } catch (err) {
    console.debug('Web Audio indisponível:', err);
  }
}

// ============================================================================
// 3. TOAST DE NOTIFICAÇÕES
// ============================================================================
let toastTimeout = null;
function showToast(msg, duration = 2800) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.hidden = false;
  toast.classList.add('visible');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => { toast.hidden = true; }, 220);
  }, duration);
}

// ============================================================================
// 4. CONTROLE DOS ESTADOS DO LEX (setLexState)
// ============================================================================
function setLexState(state) {
  AppState.lexState = state;
  const body = document.body;
  const liveStatusText = document.getElementById('live-status-text');

  body.classList.remove('state-idle', 'state-listening', 'state-thinking', 'state-success', 'state-confused');
  body.classList.add(`state-${state}`);

  const statusLabels = {
    idle: 'Online',
    listening: 'Ouvindo...',
    thinking: 'Computador...',
    success: 'Pronto!',
    confused: 'Dúvida'
  };

  if (liveStatusText) {
    liveStatusText.textContent = statusLabels[state] || statusLabels.idle;
  }

  if (state === 'confused') playSound('confused');
}

// ============================================================================
// 5. AVATAR DOCKING (HERO <-> TOPBAR DOCK)
// ============================================================================
function syncAvatarDock() {
  const stage = document.getElementById('avatar-stage');
  const dock = document.getElementById('avatar-dock');
  const home = document.getElementById('avatar-home');
  const body = document.body;

  if (!stage || !dock || !home) return;

  const hasMessages = AppState.messages.length > 0;

  if (hasMessages) {
    body.classList.remove('mode-welcome');
    body.classList.add('mode-chat');
    if (stage.parentElement !== dock) {
      dock.appendChild(stage);
    }
  } else {
    body.classList.remove('mode-chat');
    body.classList.add('mode-welcome');
    if (stage.parentElement !== home) {
      home.appendChild(stage);
    }
  }
}

// ============================================================================
// 6. HISTÓRICO DE MÚLTIPLAS CONVERSAS (SIDEBAR & LOCALSTORAGE)
// ============================================================================
const STORAGE_THREADS_KEY = 'lex_threads_grok_v3';

function initConversations() {
  try {
    const raw = localStorage.getItem(STORAGE_THREADS_KEY);
    if (raw) {
      AppState.conversations = JSON.parse(raw);
    }
  } catch (e) {
    AppState.conversations = [];
  }

  // Se não houver conversas salvas, cria conversas de exemplo acolhedoras
  if (!AppState.conversations || AppState.conversations.length === 0) {
    AppState.conversations = [
      {
        id: 'chat_' + Date.now(),
        title: 'Lex - Geral',
        preview: 'Como posso organizar seu dia hoje?',
        timestamp: formatTimestamp(new Date()),
        updatedAt: Date.now(),
        colorScheme: 'orange',
        messages: []
      },
      {
        id: 'chat_financas_sample',
        title: 'Finanças & Controle',
        preview: 'Almoço e Freelance registrados na Mochila',
        timestamp: 'Ontem',
        updatedAt: Date.now() - 86400000,
        colorScheme: 'emerald',
        messages: []
      },
      {
        id: 'chat_estudos_sample',
        title: 'Estudos & Flashcards',
        preview: 'Baralho de Inglês para Viagens disponível',
        timestamp: '25 Out',
        updatedAt: Date.now() - 172800000,
        colorScheme: 'cyan',
        messages: []
      }
    ];
    saveConversations();
  }

  // Seleciona a primeira conversa por padrão
  AppState.activeConversationId = AppState.conversations[0].id;
  AppState.messages = AppState.conversations[0].messages || [];

  renderConversationsList();
  syncAvatarDock();
  renderChatTimeline();
}

function saveConversations() {
  try {
    // Sincroniza as mensagens ativas com o item correspondente
    const active = AppState.conversations.find((c) => c.id === AppState.activeConversationId);
    if (active) {
      active.messages = AppState.messages;
      if (AppState.messages.length > 0) {
        const last = AppState.messages[AppState.messages.length - 1];
        active.preview = last.text ? last.text.slice(0, 60) : 'Anexo enviado';
        active.timestamp = formatTimestamp(new Date());
        active.updatedAt = Date.now();
      }
    }
    localStorage.setItem(STORAGE_THREADS_KEY, JSON.stringify(AppState.conversations));
  } catch (e) {
    console.debug('Erro ao salvar conversas:', e);
  }
}

function createNewConversation() {
  playSound('pop');
  const colors = ['orange', 'cyan', 'purple', 'emerald'];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  const newChat = {
    id: 'chat_' + Date.now(),
    title: 'Nova conversa',
    preview: 'Comece a conversar...',
    timestamp: formatTimestamp(new Date()),
    updatedAt: Date.now(),
    colorScheme: randomColor,
    messages: []
  };

  AppState.conversations.unshift(newChat);
  AppState.activeConversationId = newChat.id;
  AppState.messages = [];
  saveConversations();

  renderConversationsList();
  syncAvatarDock();
  renderChatTimeline();
  setLexState('idle');

  // Fecha a sidebar no mobile ao criar conversa
  closeSidebarMobile();

  // Foca no campo de texto
  const input = document.getElementById('chat-input-text');
  if (input) input.focus();

  showToast('Nova conversa iniciada');
}

function switchConversation(chatId) {
  if (chatId === AppState.activeConversationId) return;
  playSound('pop');

  // Salva estado da conversa anterior
  saveConversations();

  const chat = AppState.conversations.find((c) => c.id === chatId);
  if (!chat) return;

  AppState.activeConversationId = chat.id;
  AppState.messages = chat.messages || [];

  renderConversationsList();
  syncAvatarDock();
  renderChatTimeline();
  setLexState('idle');
  closeSidebarMobile();
}

function deleteConversation(chatId, e) {
  if (e) e.stopPropagation();
  playSound('delete');

  AppState.conversations = AppState.conversations.filter((c) => c.id !== chatId);

  if (AppState.conversations.length === 0) {
    createNewConversation();
    return;
  }

  if (AppState.activeConversationId === chatId) {
    AppState.activeConversationId = AppState.conversations[0].id;
    AppState.messages = AppState.conversations[0].messages || [];
  }

  saveConversations();
  renderConversationsList();
  syncAvatarDock();
  renderChatTimeline();
  showToast('Conversa removida');
}

function renderConversationsList() {
  const container = document.getElementById('conversations-list');
  if (!container) return;

  const query = (AppState.searchQuery || '').toLowerCase().trim();
  const filtered = AppState.conversations.filter((c) => {
    if (!query) return true;
    return (c.title || '').toLowerCase().includes(query) || (c.preview || '').toLowerCase().includes(query);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px 12px; text-align: center; color: var(--text-muted); font-size: 0.78rem;">
        Nenhuma conversa encontrada
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((c) => {
    const isActive = c.id === AppState.activeConversationId;
    const colorClass = `conversation-squircle--${c.colorScheme || 'orange'}`;
    const initial = (c.title || 'L')[0].toUpperCase();

    return `
      <div class="conversation-item ${isActive ? 'active' : ''}" onclick="switchConversation('${escapeHTML(c.id)}')">
        <div class="conversation-squircle ${colorClass}" aria-hidden="true">
          <span>${escapeHTML(initial)}</span>
        </div>
        <div class="conversation-meta">
          <div class="conversation-top-line">
            <span class="conversation-title">${escapeHTML(c.title)}</span>
            <span class="conversation-time">${escapeHTML(c.timestamp)}</span>
          </div>
          <span class="conversation-preview">${escapeHTML(c.preview || 'Sem mensagens')}</span>
        </div>
        <button type="button" class="conversation-del-btn" onclick="deleteConversation('${escapeHTML(c.id)}', event)" title="Excluir conversa">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    `;
  }).join('');
}

function formatTimestamp(dateObj) {
  try {
    const d = new Date(dateObj);
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  } catch (e) {
    return 'Agora';
  }
}

// ============================================================================
// 7. RENDERIZADOR DO CHAT COM ÍCONES VETORIAIS (ZERO EMOJIS)
// ============================================================================
function renderChatTimeline() {
  const container = document.getElementById('chat-timeline');
  if (!container) return;

  if (AppState.messages.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = AppState.messages.map((msg) => {
    if (msg.role === 'user') {
      const voiceTag = msg.isVoice ? `
        <span class="voice-tag">
          <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
          Mensagem de voz
        </span>
      ` : '';
      const photoTag = msg.photo ? `<img class="user-thumb" src="${msg.photo}" alt="Foto anexada">` : '';
      return `
        <div class="msg-row msg-row--user" id="msg-${msg.id}">
          <div class="bubble-user">
            ${voiceTag}
            ${photoTag}
            <div>${escapeHTML(msg.text)}</div>
          </div>
        </div>
      `;
    } else {
      // Mensagem do Lex
      const stepsHtml = (msg.computer_steps && msg.computer_steps.length > 0) ? `
        <details class="computer-widget">
          <summary class="computer-widget-header">
            <span class="computer-widget-title">
              <svg viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
              Computador do Lex (${msg.computer_steps.length} etapas)
            </span>
            <span style="font-size: 0.7rem; color: var(--text-muted);">▾</span>
          </summary>
          <ul class="computer-widget-steps">
            ${msg.computer_steps.map((st) => `
              <li>
                <svg class="step-icon-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                <span>${escapeHTML(st)}</span>
              </li>
            `).join('')}
          </ul>
        </details>
      ` : '';

      const cardHtml = msg.confirmation_card ? `
        <div class="confirm-card">
          <span class="confirm-card-badge">
            <svg viewBox="0 0 24 24">${getBadgeIconSvg(msg.confirmation_card.backpack_tab)}</svg>
            ${escapeHTML(msg.confirmation_card.badge || 'Tarefa Concluída')}
          </span>
          <h4 class="confirm-card-title">${escapeHTML(msg.confirmation_card.title)}</h4>
          <p class="confirm-card-detail">${escapeHTML(msg.confirmation_card.detail)}</p>
          <div class="confirm-card-actions">
            <button type="button" class="btn-pill" onclick="executeUndo()">
              <svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
              Desfazer
            </button>
            <button type="button" class="btn-pill btn-pill--accent" onclick="openBackpack('${escapeHTML(msg.confirmation_card.backpack_tab || 'tables')}', '${escapeHTML(msg.confirmation_card.target_id || '')}')">
              <svg viewBox="0 0 24 24"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
              Abrir na Mochila
            </button>
          </div>
        </div>
      ` : '';

      return `
        <div class="msg-row msg-row--lex" id="msg-${msg.id}">
          <div class="lex-chip" aria-hidden="true" title="Lex">
            <svg viewBox="0 0 300 320" xmlns="http://www.w3.org/2000/svg">
              <path d="M 65 130 L 52 28 Q 50 12 64 22 L 135 80 Z" fill="#FF4800"/>
              <path d="M 73 108 L 64 42 Q 63 34 71 40 L 116 76 Q 122 81 114 86 L 80 110 Q 74 114 73 108 Z" fill="#FFFFFF"/>
              <path d="M 235 130 L 248 28 Q 250 12 236 22 L 165 80 Z" fill="#FF4800"/>
              <path d="M 227 108 L 236 42 Q 237 34 229 40 L 184 76 Q 178 81 186 86 L 220 110 Q 226 114 227 108 Z" fill="#FFFFFF"/>
              <circle cx="150" cy="175" r="102" fill="#FF4800"/>
              <rect x="82" y="116" width="44" height="72" rx="22" fill="#FFFFFF"/>
              <rect x="174" y="116" width="44" height="72" rx="22" fill="#FFFFFF"/>
              <circle cx="150" cy="268" r="33" fill="#000000"/>
            </svg>
          </div>
          <div class="lex-content-wrapper">
            <div class="bubble-lex">
              ${formatLexText(msg.text)}
            </div>
            ${stepsHtml}
            ${cardHtml}
          </div>
        </div>
      `;
    }
  }).join('');

  scrollToBottom();
}

function getBadgeIconSvg(tab) {
  if (tab === 'flashcards') {
    return '<rect width="16" height="18" x="4" y="3" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/>';
  } else if (tab === 'agenda') {
    return '<rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>';
  } else if (tab === 'summaries') {
    return '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>';
  }
  return '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/>';
}

function scrollToBottom() {
  const viewport = document.getElementById('main');
  if (viewport) {
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: 'smooth'
    });
  }
}

function formatLexText(text) {
  if (!text) return '';
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    let formatted = escapeHTML(line);
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    return `<p>${formatted}</p>`;
  }).join('');
}

// ============================================================================
// 8. ENVIO DE MENSAGENS COM HISTÓRICO CONTEXTUAL
// ============================================================================
async function submitUserMessage(explicitText = null, isVoice = false) {
  const inputEl = document.getElementById('chat-input-text');
  const text = (explicitText !== null ? explicitText : (inputEl ? inputEl.value : '')).trim();
  const photo = AppState.attachedPhotoBase64;

  if (!text && !photo) return;

  if (explicitText === null && inputEl) {
    inputEl.value = '';
    autoResizeTextarea();
    syncSendButtonState();
  }
  clearPhotoAttachment();

  playSound('pop');

  const userMsgId = 'usr_' + Date.now();
  AppState.messages.push({
    id: userMsgId,
    role: 'user',
    text: text || 'Foto enviada para análise',
    isVoice: isVoice,
    photo: photo,
    timestamp: new Date().toISOString()
  });

  // Atualiza título inteligente da conversa se for a primeira mensagem
  const currentChat = AppState.conversations.find((c) => c.id === AppState.activeConversationId);
  if (currentChat && (currentChat.title === 'Nova conversa' || currentChat.title === 'Lex - Geral')) {
    if (text) {
      currentChat.title = text.length > 24 ? text.slice(0, 22) + '…' : text;
    }
  }

  syncAvatarDock();
  renderChatTimeline();
  saveConversations();
  renderConversationsList();

  // Indicador animado de thinking
  setLexState('thinking');
  const thinkingId = 'think_' + Date.now();
  const timelineEl = document.getElementById('chat-timeline');
  if (timelineEl) {
    const thinkingRow = document.createElement('div');
    thinkingRow.id = thinkingId;
    thinkingRow.className = 'msg-row msg-row--lex';
    thinkingRow.innerHTML = `
      <div class="lex-chip" aria-hidden="true" title="Lex">
        <svg viewBox="0 0 300 320" xmlns="http://www.w3.org/2000/svg">
          <circle cx="150" cy="175" r="102" fill="#FF4800"/>
          <rect x="82" y="116" width="44" height="72" rx="22" fill="#FFFFFF"/>
          <rect x="174" y="116" width="44" height="72" rx="22" fill="#FFFFFF"/>
          <circle cx="150" cy="268" r="33" fill="#000000"/>
        </svg>
      </div>
      <div class="bubble-thinking">
        <div class="thinking-dots">
          <span></span><span></span><span></span>
        </div>
        <span>Lex está organizando no computador dele...</span>
      </div>
    `;
    timelineEl.appendChild(thinkingRow);
    scrollToBottom();
  }

  // Prepara histórico contextual (últimas 10 mensagens)
  const historyPayload = AppState.messages
    .filter((m) => m.id !== userMsgId && m.text)
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.text }));

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        image: photo,
        history: historyPayload
      })
    });

    const thRow = document.getElementById(thinkingId);
    if (thRow) thRow.remove();

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Falha na resposta do servidor');
    }

    const data = await res.json();
    handleBackendResponse(data);
  } catch (err) {
    console.error('Erro na requisição ao Lex:', err);
    const thRow = document.getElementById(thinkingId);
    if (thRow) thRow.remove();

    setLexState('confused');
    AppState.messages.push({
      id: 'lex_err_' + Date.now(),
      role: 'assistant',
      text: `Tive um probleminha para me comunicar com a inteligência: ${err.message}. Verifique a conexão com a internet ou a chave da Groq.`,
      computer_steps: ['Erro de comunicação com o backend'],
      confirmation_card: null,
      timestamp: new Date().toISOString()
    });
    saveConversations();
    renderChatTimeline();
  }
}

function handleBackendResponse(data) {
  // 1. Atualiza Mochila com auto-seleção de novo baralho
  if (data.backpack) {
    AppState.backpack = data.backpack;

    if (data.confirmation_card && data.confirmation_card.target_id) {
      if (data.confirmation_card.backpack_tab === 'flashcards') {
        AppState.selectedDeckId = data.confirmation_card.target_id;
        AppState.currentFlashcardIndex = 0;
      }
    } else if (data.confirmation_card && data.confirmation_card.backpack_tab === 'flashcards') {
      const decks = AppState.backpack.flashcards || [];
      if (decks.length > 0) {
        AppState.selectedDeckId = decks[decks.length - 1].id;
        AppState.currentFlashcardIndex = 0;
      }
    }

    updateBackpackBadge();
    renderBackpackContent();
  }

  // 2. Estado do Lex
  const nextState = data.state || (data.confirmation_card ? 'success' : 'idle');
  setLexState(nextState);

  // 3. Adiciona mensagem da resposta
  AppState.messages.push({
    id: 'lex_' + Date.now(),
    role: 'assistant',
    text: data.message || 'Prontinho!',
    computer_steps: data.computer_steps || [],
    confirmation_card: data.confirmation_card || null,
    timestamp: new Date().toISOString()
  });

  saveConversations();
  renderChatTimeline();
  renderConversationsList();

  if (nextState === 'success') {
    playSound('success');
  }
}

// ============================================================================
// 9. MICROFONE & TRANSCRIÇÃO VIA GROQ WHISPER
// ============================================================================
async function toggleAudioRecording() {
  const micBtn = document.getElementById('btn-mic-record');

  if (AppState.isRecording) {
    AppState.isRecording = false;
    if (micBtn) {
      micBtn.classList.remove('recording');
      micBtn.setAttribute('aria-pressed', 'false');
    }
    if (AppState.mediaRecorder && AppState.mediaRecorder.state !== 'inactive') {
      AppState.mediaRecorder.stop();
    }
    if (AppState.audioStream) {
      AppState.audioStream.getTracks().forEach((t) => t.stop());
    }
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    AppState.audioStream = stream;
    AppState.isRecording = true;
    AppState.audioChunks = [];

    if (micBtn) {
      micBtn.classList.add('recording');
      micBtn.setAttribute('aria-pressed', 'true');
    }

    setLexState('listening');
    playSound('pop');

    const mediaRecorder = new MediaRecorder(stream);
    AppState.mediaRecorder = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) AppState.audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      if (micBtn) {
        micBtn.classList.remove('recording');
        micBtn.setAttribute('aria-pressed', 'false');
      }
      const audioBlob = new Blob(AppState.audioChunks, { type: 'audio/webm' });
      await processVoiceInput(audioBlob);
    };

    mediaRecorder.start();
  } catch (err) {
    console.warn('Microfone indisponível ou negado:', err);
    if (micBtn) {
      micBtn.classList.remove('recording');
      micBtn.setAttribute('aria-pressed', 'false');
    }
    AppState.isRecording = false;
    setLexState('confused');
    showToast('Não consegui acessar o microfone. Você pode digitar na caixa de texto!');
  }
}

async function processVoiceInput(audioBlob) {
  setLexState('thinking');

  const tempVoiceId = 'voice_temp_' + Date.now();
  const timelineEl = document.getElementById('chat-timeline');
  if (timelineEl) {
    syncAvatarDock();
    const row = document.createElement('div');
    row.id = tempVoiceId;
    row.className = 'msg-row msg-row--user';
    row.innerHTML = `
      <div class="bubble-user">
        <span class="voice-tag">
          <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
          Transcrevendo áudio...
        </span>
        <div>Gravando sua mensagem...</div>
      </div>
    `;
    timelineEl.appendChild(row);
    scrollToBottom();
  }

  const formData = new FormData();
  formData.append('file', audioBlob, 'gravacao.webm');

  const historyPayload = AppState.messages
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.text }));
  formData.append('history', JSON.stringify(historyPayload));

  try {
    const res = await fetch('/api/audio', {
      method: 'POST',
      body: formData
    });

    const tempRow = document.getElementById(tempVoiceId);
    if (tempRow) tempRow.remove();

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Falha ao processar áudio');
    }

    const data = await res.json();

    AppState.messages.push({
      id: 'usr_' + Date.now(),
      role: 'user',
      text: data.transcription || 'Mensagem de voz',
      isVoice: true,
      timestamp: new Date().toISOString()
    });

    handleBackendResponse(data);
  } catch (err) {
    console.error('Erro ao enviar áudio:', err);
    const tempRow = document.getElementById(tempVoiceId);
    if (tempRow) tempRow.remove();
    setLexState('confused');
    showToast('Não foi possível transcrever o áudio: ' + err.message);
  }
}

// ============================================================================
// 10. GESTÃO DA MOCHILA & DIALOG NATIVO
// ============================================================================
async function fetchBackpackData() {
  try {
    const res = await fetch('/api/backpack');
    if (res.ok) {
      const data = await res.json();
      AppState.backpack = data.backpack;
      updateBackpackBadge();
      renderBackpackContent();
    }
  } catch (e) {
    console.debug('Aguardando inicialização da Mochila...');
  }
}

function updateBackpackBadge() {
  const badge = document.getElementById('backpack-total-badge');
  const footerStat = document.getElementById('backpack-footer-stat');
  const count = AppState.backpack.total_items || 0;
  if (badge) badge.textContent = count;
  if (footerStat) footerStat.textContent = `${count} ${count === 1 ? 'item organizado' : 'itens organizados'}`;

  const tablesCount = (AppState.backpack.tables || []).length;
  const flashcardsCount = (AppState.backpack.flashcards || []).length;
  const agendaCount = (AppState.backpack.agenda || []).length;
  const summariesCount = (AppState.backpack.summaries || []).length;

  document.querySelectorAll('.tab-count[data-count="tables"]').forEach((el) => { el.textContent = tablesCount; });
  document.querySelectorAll('.tab-count[data-count="flashcards"]').forEach((el) => { el.textContent = flashcardsCount; });
  document.querySelectorAll('.tab-count[data-count="agenda"]').forEach((el) => { el.textContent = agendaCount; });
  document.querySelectorAll('.tab-count[data-count="summaries"]').forEach((el) => { el.textContent = summariesCount; });
}

window.openBackpack = function(tabName = 'tables', targetId = null) {
  const dialog = document.getElementById('backpack-dialog');
  if (!dialog) return;

  playSound('pop');

  if (targetId && tabName === 'flashcards') {
    AppState.selectedDeckId = targetId;
    AppState.currentFlashcardIndex = 0;
  }

  switchBackpackTab(tabName);
  fetchBackpackData();

  if (!dialog.open) {
    dialog.showModal();
  }
};

window.closeBackpack = function() {
  const dialog = document.getElementById('backpack-dialog');
  if (dialog && dialog.open) {
    dialog.close();
  }
};

function switchBackpackTab(tabName) {
  AppState.activeBackpackTab = tabName;

  document.querySelectorAll('.drawer-tabs .drawer-tab').forEach((btn) => {
    const isActive = btn.getAttribute('data-tab') === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  document.querySelectorAll('.drawer-body .pane').forEach((pane) => {
    pane.classList.toggle('active', pane.id === `pane-${tabName}`);
  });

  renderBackpackContent();
}

function renderBackpackContent() {
  renderTablesPane();
  renderFlashcardsPane();
  renderAgendaPane();
  renderSummariesPane();
}

// 10.1 Tabelas Dinâmicas
function renderTablesPane() {
  const container = document.getElementById('pane-tables');
  if (!container) return;

  const tables = AppState.backpack.tables || [];
  if (tables.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-svg" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        <strong>Nenhuma tabela criada ainda.</strong>
        <small>Peça ao Lex: "Crie uma tabela de controle de custos" ou "Gastei R$ 42 na farmácia".</small>
      </div>
    `;
    return;
  }

  container.innerHTML = tables.map((tab) => {
    const cols = tab.columns || [];
    const rows = tab.rows || [];

    const ths = cols.map((c) => `<th>${escapeHTML(c)}</th>`).join('') + `<th style="width: 44px; text-align: center;">Ações</th>`;
    const trs = rows.map((r, rowIdx) => {
      const tds = cols.map((c) => {
        const val = r[c] || '-';
        if (c.toLowerCase().includes('tipo')) {
          const isIncome = String(val).toLowerCase().includes('receita');
          const badgeClass = isIncome ? 'badge-tag--income' : 'badge-tag--expense';
          return `<td><span class="badge-tag ${badgeClass}">${escapeHTML(val)}</span></td>`;
        }
        return `<td>${escapeHTML(val)}</td>`;
      }).join('');

      return `
        <tr>
          ${tds}
          <td style="text-align: center;">
            <button type="button" class="btn-trash" onclick="deleteTableRow('${escapeHTML(tab.id)}', ${rowIdx})" title="Excluir linha">
              <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="table-card">
        <div class="table-card-head">
          <span class="table-card-title">${escapeHTML(tab.name)}</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button type="button" class="btn-pill" onclick="exportTableToCSV('${escapeHTML(tab.name)}')">
              <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              CSV
            </button>
            <button type="button" class="btn-trash" onclick="deleteEntireTable('${escapeHTML(tab.id)}')" title="Excluir tabela inteira">
              <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>${ths}</tr></thead>
            <tbody>${trs.length > 0 ? trs : '<tr><td colspan="' + (cols.length + 1) + '" style="text-align: center; color: var(--text-muted); padding: 16px;">Tabela vazia</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');
}

// 10.2 Flashcards com Seletor Interativo
function renderFlashcardsPane() {
  const selectorEl = document.getElementById('deck-selector-bar');
  const viewerEl = document.getElementById('flashcard-viewer');
  if (!selectorEl || !viewerEl) return;

  const decks = AppState.backpack.flashcards || [];
  if (decks.length === 0) {
    selectorEl.innerHTML = '';
    viewerEl.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-svg" viewBox="0 0 24 24"><rect width="16" height="18" x="4" y="3" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        <strong>Nenhum baralho de estudo ainda.</strong>
        <small>Peça ao Lex: "Crie flashcards de Biologia sobre Mitose" ou "Flashcards de Vocabulário Espanhol".</small>
      </div>
    `;
    return;
  }

  let activeDeck = decks.find((d) => d.id === AppState.selectedDeckId);
  if (!activeDeck) {
    activeDeck = decks[0];
    AppState.selectedDeckId = activeDeck.id;
  }

  selectorEl.innerHTML = decks.map((deck) => {
    const isActive = deck.id === activeDeck.id;
    const cardCount = (deck.cards || []).length;
    return `
      <button type="button" class="deck-pill ${isActive ? 'active' : ''}" onclick="selectDeck('${escapeHTML(deck.id)}')">
        <span>${escapeHTML(deck.theme)}</span>
        <span class="deck-pill-count">${cardCount}</span>
      </button>
    `;
  }).join('');

  const cards = activeDeck.cards || [];
  if (cards.length === 0) {
    viewerEl.innerHTML = `
      <div class="flashcard-deck">
        <div class="deck-meta">
          <span class="deck-meta-title">${escapeHTML(activeDeck.theme)}</span>
          <button type="button" class="btn-trash" onclick="deleteDeck('${escapeHTML(activeDeck.id)}')" title="Excluir baralho">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
        <div class="empty-state">
          <small>Este baralho ainda não tem cartões cadastrados.</small>
        </div>
      </div>
    `;
    return;
  }

  const cardIndex = Math.min(AppState.currentFlashcardIndex, Math.max(0, cards.length - 1));
  const card = cards[cardIndex];

  viewerEl.innerHTML = `
    <div class="flashcard-deck">
      <div class="deck-meta">
        <span class="deck-meta-title">${escapeHTML(activeDeck.theme)}</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="deck-counter">${cardIndex + 1} de ${cards.length}</span>
          <button type="button" class="btn-trash" onclick="deleteDeck('${escapeHTML(activeDeck.id)}')" title="Excluir baralho">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>

      <!-- Cartão 3D que Gira -->
      <div class="scene-3d" id="flashcard-scene" onclick="toggleCardFlip()" title="Clique para virar o cartão">
        <div class="card-3d" id="card-3d-element">
          <div class="card-face card-face--front">
            <span class="card-tag">Pergunta / Desafio</span>
            <p class="card-text">${escapeHTML(card.question)}</p>
            <span class="card-hint">Toque para ver a resposta</span>
          </div>
          <div class="card-face card-face--back">
            <span class="card-tag">Resposta</span>
            <p class="card-text">${escapeHTML(card.answer)}</p>
            <span class="card-hint">Toque para voltar à pergunta</span>
          </div>
        </div>
      </div>

      <!-- Controles de Navegação -->
      <div class="card-controls">
        <button type="button" class="btn-pill" onclick="navFlashcard(-1)" ${cardIndex === 0 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
          Anterior
        </button>
        <button type="button" class="btn-pill" onclick="markCardMastery(false)">Preciso rever</button>
        <button type="button" class="btn-pill btn-pill--accent" onclick="markCardMastery(true)">Acertei!</button>
        <button type="button" class="btn-pill" onclick="navFlashcard(1)" ${cardIndex >= cards.length - 1 ? 'disabled' : ''}>
          Próximo
          <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>
    </div>
  `;
}

window.selectDeck = function(deckId) {
  AppState.selectedDeckId = deckId;
  AppState.currentFlashcardIndex = 0;
  playSound('pop');
  renderFlashcardsPane();
};

window.toggleCardFlip = function() {
  const cardEl = document.getElementById('card-3d-element');
  if (cardEl) {
    cardEl.classList.toggle('flipped');
    playSound('flip');
  }
};

window.navFlashcard = function(delta) {
  const decks = AppState.backpack.flashcards || [];
  const currentDeck = decks.find((d) => d.id === AppState.selectedDeckId);
  if (!currentDeck) return;
  const cards = currentDeck.cards || [];
  const nextIdx = AppState.currentFlashcardIndex + delta;
  if (nextIdx >= 0 && nextIdx < cards.length) {
    AppState.currentFlashcardIndex = nextIdx;
    playSound('pop');
    renderFlashcardsPane();
  }
};

window.markCardMastery = function(mastered) {
  playSound(mastered ? 'success' : 'pop');
  window.navFlashcard(1);
};

// 10.3 Agenda
function renderAgendaPane() {
  const container = document.getElementById('pane-agenda');
  if (!container) return;

  const events = AppState.backpack.agenda || [];
  if (events.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-svg" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <strong>Sua agenda está livre!</strong>
        <small>Peça ao Lex: "Marca dentista sexta às 14h" ou "Lembrete de reunião amanhã 10h".</small>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="agenda-list">
      ${events.map((evt) => `
        <div class="agenda-item ${evt.completed ? 'completed' : ''}">
          <input 
            type="checkbox" 
            class="agenda-check" 
            ${evt.completed ? 'checked' : ''} 
            onchange="toggleAgendaItem('${escapeHTML(evt.id)}')"
            title="Marcar como concluído"
          >
          <div class="agenda-info">
            <h4 class="agenda-title">${escapeHTML(evt.title)}</h4>
            <div class="agenda-meta">
              <span>${escapeHTML(evt.date)} às ${escapeHTML(evt.time)}</span>
              <span class="agenda-cat">${escapeHTML(evt.category || 'Geral')}</span>
            </div>
          </div>
          <button type="button" class="btn-trash" onclick="deleteAgendaItem('${escapeHTML(evt.id)}')" title="Excluir compromisso">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

window.toggleAgendaItem = async function(id) {
  playSound('pop');
  try {
    const res = await fetch(`/api/backpack/agenda/${id}/toggle`, { method: 'PATCH' });
    if (res.ok) {
      const data = await res.json();
      if (data.backpack) {
        AppState.backpack = data.backpack;
        updateBackpackBadge();
        renderAgendaPane();
      }
    }
  } catch (e) {
    console.error('Erro ao alternar status do compromisso:', e);
  }
};

// 10.4 Resumos
function renderSummariesPane() {
  const container = document.getElementById('pane-summaries');
  if (!container) return;

  const summaries = AppState.backpack.summaries || [];
  if (summaries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-svg" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <strong>Nenhum resumo salvo ainda.</strong>
        <small>Peça ao Lex: "Pesquise sobre computação quântica e faça um resumo estruturado".</small>
      </div>
    `;
    return;
  }

  container.innerHTML = summaries.map((sum) => `
    <div class="summary-item">
      <div class="summary-head">
        <h3>${escapeHTML(sum.title)}</h3>
        <button type="button" class="btn-trash" onclick="deleteSummaryItem('${escapeHTML(sum.id)}')" title="Excluir resumo">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
      <ul class="summary-list">
        ${(sum.points || []).map((p) => `<li>${escapeHTML(p)}</li>`).join('')}
      </ul>
    </div>
  `).join('');
}

// ============================================================================
// 11. EXCLUSÕES & DESFAZER (DELETE & UNDO)
// ============================================================================
window.deleteTableRow = async function(tableId, rowIdx) {
  if (!confirm('Deseja excluir esta linha da tabela?')) return;
  playSound('delete');
  try {
    const res = await fetch(`/api/backpack/table/${tableId}/row/${rowIdx}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.backpack) {
      AppState.backpack = data.backpack;
      updateBackpackBadge();
      renderTablesPane();
    }
  } catch (e) {
    console.error('Erro ao excluir linha:', e);
  }
};

window.deleteEntireTable = async function(tableId) {
  if (!confirm('Deseja excluir esta tabela inteira da Mochila?')) return;
  playSound('delete');
  try {
    const res = await fetch(`/api/backpack/table/${tableId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.backpack) {
      AppState.backpack = data.backpack;
      updateBackpackBadge();
      renderTablesPane();
    }
  } catch (e) {
    console.error('Erro ao excluir tabela:', e);
  }
};

window.deleteDeck = async function(deckId) {
  if (!confirm('Deseja excluir este baralho de flashcards?')) return;
  playSound('delete');
  try {
    const res = await fetch(`/api/backpack/flashcard/${deckId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.backpack) {
      AppState.backpack = data.backpack;
      AppState.selectedDeckId = null;
      AppState.currentFlashcardIndex = 0;
      updateBackpackBadge();
      renderFlashcardsPane();
    }
  } catch (e) {
    console.error('Erro ao excluir baralho:', e);
  }
};

window.deleteAgendaItem = async function(eventId) {
  playSound('delete');
  try {
    const res = await fetch(`/api/backpack/agenda/${eventId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.backpack) {
      AppState.backpack = data.backpack;
      updateBackpackBadge();
      renderAgendaPane();
    }
  } catch (e) {
    console.error('Erro ao excluir compromisso:', e);
  }
};

window.deleteSummaryItem = async function(summaryId) {
  playSound('delete');
  try {
    const res = await fetch(`/api/backpack/summary/${summaryId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.backpack) {
      AppState.backpack = data.backpack;
      updateBackpackBadge();
      renderSummariesPane();
    }
  } catch (e) {
    console.error('Erro ao excluir resumo:', e);
  }
};

window.executeUndo = async function() {
  playSound('pop');
  try {
    const res = await fetch('/api/undo', { method: 'POST' });
    const data = await res.json();
    if (data.backpack) {
      AppState.backpack = data.backpack;
      updateBackpackBadge();
      renderBackpackContent();
    }
    setLexState('idle');
    showToast(data.message || 'Desfiz a última alteração com sucesso!');
  } catch (err) {
    showToast('Não foi possível desfazer a alteração.');
  }
};

window.exportTableToCSV = function(tableName) {
  const tables = AppState.backpack.tables || [];
  const table = tables.find((t) => t.name.toLowerCase() === tableName.toLowerCase());
  if (!table) return;

  const cols = table.columns;
  const rows = table.rows;

  let csvContent = 'data:text/csv;charset=utf-8,\uFEFF';
  csvContent += cols.map((c) => `"${c}"`).join(';') + '\r\n';

  rows.forEach((r) => {
    const line = cols.map((c) => `"${(r[c] || '').replace(/"/g, '""')}"`).join(';');
    csvContent += line + '\r\n';
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `${tableName.toLowerCase().replace(/\s+/g, '_')}_lex.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  playSound('pop');
  showToast('Planilha CSV exportada com sucesso!');
};

// ============================================================================
// 12. FOTO ATTACHMENT
// ============================================================================
function handlePhotoSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    AppState.attachedPhotoBase64 = event.target.result;
    const bar = document.getElementById('photo-preview-bar');
    const thumb = document.getElementById('photo-preview-img');
    const name = document.getElementById('photo-preview-name');
    if (bar && thumb && name) {
      thumb.src = AppState.attachedPhotoBase64;
      name.textContent = file.name;
      bar.hidden = false;
    }
    syncSendButtonState();
    playSound('pop');
  };
  reader.readAsDataURL(file);
}

function clearPhotoAttachment() {
  AppState.attachedPhotoBase64 = null;
  const bar = document.getElementById('photo-preview-bar');
  const input = document.getElementById('file-photo-input');
  if (bar) bar.hidden = true;
  if (input) input.value = '';
  syncSendButtonState();
}

// ============================================================================
// 13. COMPOSER HELPERS
// ============================================================================
function autoResizeTextarea() {
  const textarea = document.getElementById('chat-input-text');
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
}

function syncSendButtonState() {
  const input = document.getElementById('chat-input-text');
  const btn = document.getElementById('btn-send-message');
  if (!btn) return;
  const hasText = input && input.value.trim().length > 0;
  const hasPhoto = Boolean(AppState.attachedPhotoBase64);
  btn.disabled = !(hasText || hasPhoto);
}

// ============================================================================
// 14. INTERAÇÕES DA SIDEBAR (TOGGLE, SEARCH & MOBILE)
// ============================================================================
function toggleSidebar() {
  document.body.classList.toggle('sidebar-open');
}

function closeSidebarMobile() {
  document.body.classList.remove('sidebar-open');
}

function setupDialogBackdropDismiss(dialogId) {
  const dialog = document.getElementById(dialogId);
  if (!dialog) return;

  dialog.addEventListener('click', (e) => {
    const rect = dialog.getBoundingClientRect();
    const isInDialog = (
      rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX && e.clientX <= rect.left + rect.width
    );
    if (!isInDialog) {
      dialog.close();
    }
  });
}

// ============================================================================
// 15. INICIALIZAÇÃO GERAL
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // 1. Inicializa o histórico de conversas e restaura a conversa ativa
  initConversations();

  // 2. Avatar interativo no centro (toque lúdico)
  const avatarStage = document.getElementById('avatar-stage');
  if (avatarStage) {
    avatarStage.addEventListener('click', () => {
      if (AppState.lexState === 'idle') {
        playSound('success');
        setLexState('success');
        showToast('Oi! Sou o Lex. Como posso ajudar você agora?');
        setTimeout(() => setLexState('idle'), 2000);
      }
    });
  }

  // 3. Botões da Sidebar
  document.getElementById('btn-new-chat-sidebar')?.addEventListener('click', createNewConversation);

  // Busca na Sidebar
  const searchInput = document.getElementById('sidebar-search-input');
  const clearSearchBtn = document.getElementById('btn-clear-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      AppState.searchQuery = e.target.value;
      if (clearSearchBtn) clearSearchBtn.hidden = !e.target.value;
      renderConversationsList();
    });
  }
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      AppState.searchQuery = '';
      clearSearchBtn.hidden = true;
      renderConversationsList();
    });
  }

  // Menu da Sidebar
  const proDialog = document.getElementById('pro-dialog');
  document.getElementById('btn-menu-pro')?.addEventListener('click', () => {
    playSound('pop');
    if (proDialog) proDialog.showModal();
  });
  document.getElementById('btn-menu-settings')?.addEventListener('click', () => {
    playSound('pop');
    showToast('Configurações: Tudo pronto com modelo openai/gpt-oss-120b');
  });
  document.getElementById('btn-menu-help')?.addEventListener('click', () => {
    playSound('pop');
    showToast('Ajuda: Peça ao Lex para criar tabelas, flashcards ou tarefas');
  });
  document.getElementById('btn-user-options')?.addEventListener('click', () => {
    playSound('pop');
    if (proDialog) proDialog.showModal();
  });

  // PWA Install Prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    AppState.deferredPwaPrompt = e;
  });
  document.getElementById('btn-menu-pwa')?.addEventListener('click', async () => {
    if (AppState.deferredPwaPrompt) {
      AppState.deferredPwaPrompt.prompt();
      const choice = await AppState.deferredPwaPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        showToast('Lex instalado com sucesso!');
      }
      AppState.deferredPwaPrompt = null;
    } else {
      showToast('Para instalar no iOS/Desktop, use "Adicionar à Tela de Início" no navegador');
    }
  });

  // Toggle da Sidebar no Header & Backdrop
  document.getElementById('btn-toggle-sidebar')?.addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-backdrop')?.addEventListener('click', closeSidebarMobile);

  // Botões do Topbar
  document.getElementById('btn-clear-chat')?.addEventListener('click', () => {
    if (AppState.messages.length === 0) return;
    playSound('delete');
    AppState.messages = [];
    saveConversations();
    syncAvatarDock();
    renderChatTimeline();
    renderConversationsList();
    setLexState('idle');
    showToast('Conversa limpa');
  });

  document.getElementById('btn-open-backpack')?.addEventListener('click', () => {
    window.openBackpack(AppState.activeBackpackTab || 'tables');
  });

  document.getElementById('btn-close-backpack')?.addEventListener('click', () => {
    window.closeBackpack();
  });

  document.getElementById('btn-simulate-pro-upgrade')?.addEventListener('click', () => {
    playSound('success');
    showToast('🎉 Assinatura do Lex Pro ativada com sucesso!');
    if (proDialog) proDialog.close();
  });

  // Configura fechar ao clicar no backdrop para diálogos
  setupDialogBackdropDismiss('backpack-dialog');
  setupDialogBackdropDismiss('pro-dialog');

  // Abas da Mochila
  document.querySelectorAll('.drawer-tabs .drawer-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      playSound('pop');
      switchBackpackTab(tabBtn.getAttribute('data-tab'));
    });
  });

  document.getElementById('btn-drawer-undo')?.addEventListener('click', window.executeUndo);

  // 4. Composer Form
  const composerForm = document.getElementById('composer-form');
  const textInput = document.getElementById('chat-input-text');

  if (textInput) {
    textInput.addEventListener('input', () => {
      autoResizeTextarea();
      syncSendButtonState();
    });

    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitUserMessage();
      }
    });
  }

  if (composerForm) {
    composerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitUserMessage();
    });
  }

  // 5. Botões de Sugestão no Hero
  document.querySelectorAll('.suggestion-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fill = btn.getAttribute('data-fill') || '';
      if (textInput) {
        textInput.value = fill;
        textInput.focus();
        autoResizeTextarea();
        syncSendButtonState();
        playSound('pop');
      }
    });
  });

  // 6. Microfone
  document.getElementById('btn-mic-record')?.addEventListener('click', toggleAudioRecording);

  // 7. Foto
  const photoInput = document.getElementById('file-photo-input');
  document.getElementById('btn-trigger-photo')?.addEventListener('click', () => {
    if (photoInput) photoInput.click();
  });
  if (photoInput) photoInput.addEventListener('change', handlePhotoSelect);
  document.getElementById('btn-remove-photo')?.addEventListener('click', clearPhotoAttachment);

  // 8. Carrega dados da Mochila
  fetchBackpackData();

  // 9. Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.debug('SW registration not available in current origin:', err);
    });
  }
});

// Helper de escape XSS
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
