// ===== BACKGROUND.JS SIN WEBSOCKET - POLLING HTTP =====
console.log('🚀 Facebook Comment Tool - Background Script iniciado (HTTP)');

class FacebookCommentExtension {
  constructor() {
    this.isConnected = false;
    this.apiUrl = 'https://api.gestorfb.pt/api';
    this.pollingInterval = 2000;
    this.pollingTimer = null;
    this.facebookTabs = new Map();
    this.executingCommands = new Set();
    this.profiles = new Map(); // ✅ Nuevo: gestión de perfiles

    this.init();
  }

  async init() {
    console.log('🔧 Inicializando extensão...');
    console.log(`🔗 API configurada: ${this.apiUrl}`);

    // Iniciar polling
    this.startPolling();

    // Configurar listeners
    this.setupTabListeners();
    this.setupMessageListeners();

    // Verificar se já existem abas do Facebook
    await this.checkExistingFacebookTabs();
  }

  // ✅ Nueva función para crear perfil separado
  async createNewProfile(profileName) {
    try {
      console.log(`🆕 Creando nuevo perfil: ${profileName}`);

      // Crear ventana con perfil separado
      const window = await chrome.windows.create({
        url: 'https://facebook.com',
        incognito: false,
        width: 1200,
        height: 800,
        left: Math.floor(Math.random() * 200),
        top: Math.floor(Math.random() * 200)
      });

      const tab = window.tabs[0];

      // Guardar información del perfil
      this.profiles.set(profileName, {
        windowId: window.id,
        tabId: tab.id,
        name: profileName,
        created: Date.now()
      });

      // También guardar en facebookTabs
      this.facebookTabs.set(tab.id, {
        id: tab.id,
        url: tab.url,
        isLoggedIn: false,
        profile: profileName,
        created: Date.now()
      });

      return {
        success: true,
        tabId: tab.id,
        windowId: window.id,
        profile: profileName
      };

    } catch (error) {
      console.error('❌ Error creando perfil:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ===== POLLING PARA COMANDOS =====
  startPolling() {
    console.log('🔄 Iniciando polling para comandos...');

    this.pollingTimer = setInterval(async () => {
      try {
        await this.checkForCommands();
      } catch (error) {
        console.error('❌ Erro no polling:', error);
      }
    }, this.pollingInterval);
  }

  stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      console.log('⏹️ Polling parado');
    }
  }

  async checkForCommands() {
    try {
      const response = await fetch(`${this.apiUrl}/extension/next-command`);

      if (!response.ok) {
        if (!this.isConnected) {
          console.log('🔌 API não acessível');
        }
        this.isConnected = false;
        this.updateIcon('disconnected');
        return;
      }

      // Primeira conexão bem-sucedida
      if (!this.isConnected) {
        console.log('✅ Conectado à API');
        this.isConnected = true;
        this.updateIcon('connected');
      }

      const data = await response.json();

      if (data.hasCommand) {
        console.log(`📨 Comando recebido: ${data.command.action}`);
        await this.executeCommand(data.command);
      }

    } catch (error) {
      if (this.isConnected) {
        console.log('🔌 Perdeu conexão com API');
        this.isConnected = false;
        this.updateIcon('disconnected');
      }
    }
  }

  async executeCommand(command) {
    const { id, action, data } = command;
    let result = { success: false, error: 'Comando não implementado' };

    try {
      switch (action) {
        case 'open_facebook':
          result = await this.openFacebook(data);
          break;
        case 'create_profile':  // ✅ Nuevo caso
          result = await this.createNewProfile(data.profile);
          break;
        case 'login_facebook':
          result = await this.loginFacebook(data);
          break;
        case 'navigate_to':
          result = await this.navigateTo(data);
          break;
        case 'comment':
          result = await this.comment(data);
          break;
        case 'multi_comment':
          result = await this.multiComment(data);
          break;
        case 'close_tabs':
          result = await this.closeFacebookTabs();
          break;
        default:
          result = { success: false, error: `Ação não reconhecida: ${action}` };
      }
    } catch (error) {
      console.error(`❌ Erro executando ${action}:`, error);
      result = { success: false, error: error.message };
    }

    // Enviar resultado de volta para API
    await this.sendResult(id, result);
  }

  async sendResult(commandId, result) {
    try {
      const response = await fetch(`${this.apiUrl}/extension/command-result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          commandId,
          success: result.success,
          result: result.success ? result : undefined,
          error: result.success ? undefined : result.error
        })
      });

      if (response.ok) {
        console.log(`✅ Resultado enviado: ${commandId}`);
      } else {
        console.error(`❌ Erro enviando resultado: ${response.status}`);
      }

    } catch (error) {
      console.error('❌ Erro enviando resultado:', error);
    }
  }

  // ===== AÇÕES DO FACEBOOK =====

  // ✅ Modificar openFacebook para soportar perfiles
  async openFacebook(data = {}) {
    try {
      const { profile = 'default', newWindow = false } = data;

      console.log(`📘 Abrindo Facebook - Perfil: ${profile}`);

      let tab;

      if (newWindow || profile !== 'default') {
        // Crear nueva ventana para perfil separado
        const window = await chrome.windows.create({
          url: 'https://facebook.com',
          incognito: false,
          width: 1200,
          height: 800
        });

        tab = window.tabs[0];

        // Guardar información del perfil
        if (profile !== 'default') {
          this.profiles.set(profile, {
            windowId: window.id,
            tabId: tab.id,
            name: profile
          });
        }
      } else {
        // Comportamiento normal
        tab = await chrome.tabs.create({
          url: 'https://facebook.com',
          active: true
        });
      }

      this.facebookTabs.set(tab.id, {
        id: tab.id,
        url: tab.url,
        isLoggedIn: false,
        profile: profile,
        created: Date.now()
      });

      await this.waitForTabLoad(tab.id);
      const isLoggedIn = await this.checkLoginStatus(tab.id);

      console.log(`✅ Facebook aberto - Perfil: ${profile} - Logado: ${isLoggedIn}`);

      return {
        success: true,
        tabId: tab.id,
        isLoggedIn,
        profile: profile
      };

    } catch (error) {
      console.error('❌ Erro abrindo Facebook:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async loginFacebook({ email, password }) {
    try {
      console.log('🔑 Fazendo login no Facebook...');

      const facebookTab = this.getActiveFacebookTab();
      if (!facebookTab) {
        throw new Error('Nenhuma aba do Facebook encontrada');
      }

      const result = await chrome.scripting.executeScript({
        target: { tabId: facebookTab.id },
        func: loginInPage,
        args: [email, password]
      });

      const loginResult = result[0].result;

      if (loginResult.success) {
        this.facebookTabs.get(facebookTab.id).isLoggedIn = true;
      }

      console.log('✅ Login processado');
      return loginResult;

    } catch (error) {
      console.error('❌ Erro no login:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async navigateTo({ url }) {
    try {
      console.log(`🔗 Navegando para: ${url}`);

      const facebookTab = this.getActiveFacebookTab();
      if (!facebookTab) {
        throw new Error('Nenhuma aba do Facebook encontrada');
      }

      await chrome.tabs.update(facebookTab.id, { url });
      await this.waitForTabLoad(facebookTab.id);

      const currentTab = await chrome.tabs.get(facebookTab.id);

      return {
        success: true,
        finalUrl: currentTab.url,
        tabId: facebookTab.id
      };

    } catch (error) {
      console.error('❌ Erro navegando:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async comment({ text, humanMode = true }) {
    try {
      console.log(`💬 Comentando: "${text}"`);

      const facebookTab = this.getActiveFacebookTab();
      if (!facebookTab) {
        throw new Error('Nenhuma aba do Facebook encontrada');
      }

      const result = await chrome.scripting.executeScript({
        target: { tabId: facebookTab.id },
        func: commentInPage,
        args: [text, humanMode]
      });

      console.log('✅ Comentário enviado');
      return result[0].result;

    } catch (error) {
      console.error('❌ Erro comentando:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async multiComment({ comments, interval, randomize }) {
    try {
      console.log(`📨 Enviando ${comments.length} comentários...`);

      const facebookTab = this.getActiveFacebookTab();
      if (!facebookTab) {
        throw new Error('Nenhuma aba do Facebook encontrada');
      }

      const result = await chrome.scripting.executeScript({
        target: { tabId: facebookTab.id },
        func: multiCommentInPage,
        args: [comments, interval, randomize]
      });

      return result[0].result;

    } catch (error) {
      console.error('❌ Erro nos comentários múltiplos:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async closeFacebookTabs() {
    try {
      const tabIds = Array.from(this.facebookTabs.keys());

      if (tabIds.length > 0) {
        await chrome.tabs.remove(tabIds);
        this.facebookTabs.clear();
      }

      return {
        success: true,
        message: `${tabIds.length} abas fechadas`
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ===== FUNÇÕES AUXILIARES =====

  async waitForTabLoad(tabId) {
    return new Promise((resolve) => {
      const checkStatus = () => {
        chrome.tabs.get(tabId, (tab) => {
          if (tab && tab.status === 'complete') {
            resolve();
          } else {
            setTimeout(checkStatus, 500);
          }
        });
      };
      checkStatus();
    });
  }

  async checkLoginStatus(tabId) {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          return !document.querySelector('input[name="email"]');
        }
      });
      return result[0].result;
    } catch (error) {
      return false;
    }
  }

  // ✅ Obtener tab activa por perfil
  getActiveFacebookTab(profile = null) {
    if (profile) {
      // Buscar tab específica del perfil
      for (const [tabId, tabInfo] of this.facebookTabs.entries()) {
        if (tabInfo.profile === profile) {
          return tabInfo;
        }
      }
    }
    // Comportamiento por defecto
    return Array.from(this.facebookTabs.values())[0] || null;
  }

  async checkExistingFacebookTabs() {
    try {
      const tabs = await chrome.tabs.query({
        url: ['*://facebook.com/*', '*://*.facebook.com/*']
      });

      for (const tab of tabs) {
        this.facebookTabs.set(tab.id, {
          id: tab.id,
          url: tab.url,
          isLoggedIn: false,
          created: Date.now()
        });
      }
    } catch (error) {
      console.error('Erro verificando abas:', error);
    }
  }

  setupTabListeners() {
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.facebookTabs.has(tabId)) {
        this.facebookTabs.delete(tabId);
        console.log(`🗑️ Aba do Facebook removida: ${tabId}`);
      }
    });
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'getStatus') {
        sendResponse({
          connected: this.isConnected,
          facebookTabs: this.facebookTabs.size
        });
      }
      return true;
    });
  }

  updateIcon(status) {
    try {
      chrome.action.setIcon({
        path: 'icons/icon16.png'
      });
    } catch (error) {
      console.error('Erro atualizando ícone:', error);
    }
  }
}

// ===== FUNÇÕES PARA INJETAR NAS PÁGINAS =====

function loginInPage(email, password) {
  return new Promise((resolve) => {
    console.log('🔑 Executando login na página...');

    setTimeout(async () => {
      try {
        const emailField = document.querySelector('input[name="email"], input[data-testid="royal_email"]');
        const passwordField = document.querySelector('input[name="pass"], input[data-testid="royal_pass"]');

        if (!emailField || !passwordField) {
          resolve({
            success: false,
            error: 'Campos de login não encontrados'
          });
          return;
        }

        // Llenar campos
        emailField.value = email;
        emailField.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(r => setTimeout(r, 500));

        passwordField.value = password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(r => setTimeout(r, 1000));

        // Hacer click en login
        const loginButton = document.querySelector('button[name="login"], button[data-testid="royal_login_button"]');

        if (loginButton) {
          loginButton.click();
        } else {
          passwordField.focus();
          passwordField.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        }

        // ✅ RESPONDER INMEDIATAMENTE
        resolve({
          success: true,
          message: 'Login iniciado - verifique o status na página'
        });

      } catch (error) {
        resolve({
          success: false,
          error: error.message
        });
      }
    }, 2000);
  });
}

function commentInPage(text, humanMode) {
  return new Promise((resolve) => {
    console.log('💬 Executando comentário na página...');

    setTimeout(async () => {
      try {
        // ✅ PRIMERO: Verificar si estamos en la página de Watch
        const currentUrl = window.location.href;
        const isWatchPage = currentUrl.includes('/watch/');

        if (isWatchPage) {
          console.log('📺 Detectada página de Watch, buscando botón de comentar...');

          const commentButton = document.querySelector('[aria-label="Leave a comment"]') ||
            document.querySelector('[data-ad-rendering-role="comment_button"]')?.closest('[role="button"]');

          if (commentButton) {
            console.log('🔘 Botón de comentar encontrado, haciendo clic...');
            commentButton.click();
            await new Promise(r => setTimeout(r, 3000));
          }
        }

        // ✅ BUSCAR CAJA DE COMENTARIOS
        const selectors = [
          '[aria-label="Write a comment…"][role="textbox"]',
          '[aria-label="Escreva um comentário…"][role="textbox"]',
          '[data-lexical-editor="true"][contenteditable="true"]',
          'div[contenteditable="true"][role="textbox"]'
        ];

        let commentBox = null;

        for (let attempt = 0; attempt < 3; attempt++) {
          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              const rect = element.getBoundingClientRect();
              const isVisible = rect.width > 0 && rect.height > 0 &&
                element.offsetParent !== null &&
                window.getComputedStyle(element).display !== 'none';

              if (isVisible) {
                commentBox = element;
                break;
              }
            }
            if (commentBox) break;
          }

          if (commentBox) break;

          console.log(`🔍 Intento ${attempt + 1}: Caja de comentarios no encontrada, esperando...`);
          await new Promise(r => setTimeout(r, 2000));
        }

        if (!commentBox) {
          resolve({
            success: false,
            error: 'Caixa de comentários não encontrada'
          });
          return;
        }

        console.log('✅ Caja de comentarios encontrada');

        // Hacer scroll y focus
        commentBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 500));

        // Hacer clic y focus
        commentBox.click();
        commentBox.focus();
        await new Promise(r => setTimeout(r, 500));

        // ✅ MÉTODO SIMPLIFICADO PARA ESCRIBIR
        if (humanMode) {
          // Limpiar contenido
          commentBox.focus();
          document.execCommand('selectAll');
          document.execCommand('delete');

          // Escribir letra por letra
          for (const char of text) {
            // Usar execCommand que es más compatible
            document.execCommand('insertText', false, char);

            // Disparar eventos
            commentBox.dispatchEvent(new Event('input', { bubbles: true }));

            // Pequeña pausa para simular escritura humana
            await new Promise(r => setTimeout(r, Math.random() * 100 + 50));
          }
        } else {
          // Modo rápido - escribir todo de una vez
          commentBox.focus();
          document.execCommand('selectAll');
          document.execCommand('delete');
          document.execCommand('insertText', false, text);

          // Disparar eventos
          commentBox.dispatchEvent(new Event('input', { bubbles: true }));
          commentBox.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            data: text,
            inputType: 'insertText'
          }));
        }

        await new Promise(r => setTimeout(r, 1000));

        // ✅ BUSCAR Y HACER CLIC EN EL BOTÓN DE ENVIAR
        console.log('🔍 Buscando botón de enviar...');

        // Buscar el botón por varios selectores
        let submitButton = null;
        const submitSelectors = [
          '[aria-label="Comment"]:not([aria-disabled="true"])',
          '[aria-label="Comentar"]:not([aria-disabled="true"])',
          'div[role="button"] i[style*="background-position: 0px -338px"]',
          '#focused-state-composer-submit div[role="button"]:not([aria-disabled="true"])',
          // Selector más genérico para el botón con el ícono
          'div[role="button"]:not([aria-disabled="true"]) i.x1b0d499'
        ];

        // Esperar a que el botón se habilite
        for (let attempt = 0; attempt < 5; attempt++) {
          for (const selector of submitSelectors) {
            const element = document.querySelector(selector);
            if (element) {
              // Si encontramos el ícono, obtener el botón padre
              submitButton = element.closest('[role="button"]') || element;

              // Verificar que no esté deshabilitado
              if (submitButton.getAttribute('aria-disabled') !== 'true') {
                break;
              }
            }
          }

          if (submitButton && submitButton.getAttribute('aria-disabled') !== 'true') {
            break;
          }

          console.log(`⏳ Esperando botón... (intento ${attempt + 1})`);
          await new Promise(r => setTimeout(r, 1000));
        }

        if (submitButton && submitButton.getAttribute('aria-disabled') !== 'true') {
          console.log('✅ Botón de enviar encontrado');

          // Hacer clic en el botón
          submitButton.click();

          await new Promise(r => setTimeout(r, 2000));

          resolve({
            success: true,
            message: 'Comentário enviado com sucesso'
          });
        } else {
          // Intentar con Enter si no encuentra el botón
          console.log('⚠️ Intentando con Enter...');

          commentBox.focus();
          const event = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          });

          commentBox.dispatchEvent(event);

          // También intentar con Ctrl+Enter
          const ctrlEnterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            ctrlKey: true
          });

          commentBox.dispatchEvent(ctrlEnterEvent);

          await new Promise(r => setTimeout(r, 2000));

          resolve({
            success: true,
            message: 'Comentário enviado (via teclado)'
          });
        }

      } catch (error) {
        console.error('❌ Error en commentInPage:', error);
        resolve({
          success: false,
          error: error.message
        });
      }
    }, 1000);
  });
}

function multiCommentInPage(comments, interval, randomize) {
  return new Promise(async (resolve) => {
    console.log('📨 Executando comentários múltiplos...');

    const results = [];
    let commentList = [...comments];

    if (randomize) {
      commentList.sort(() => Math.random() - 0.5);
    }

    for (let i = 0; i < commentList.length; i++) {
      try {
        if (i > 0) {
          const waitTime = randomize
            ? (interval * 0.7 + Math.random() * interval * 0.6) * 1000
            : interval * 1000;
          await new Promise(r => setTimeout(r, waitTime));
        }

        const comment = commentList[i];
        const commentResult = await commentInPage(comment, true);

        results.push({
          comment,
          status: commentResult.success ? 'enviado' : 'erro',
          error: commentResult.success ? undefined : commentResult.error
        });

      } catch (error) {
        results.push({
          comment: commentList[i],
          status: 'erro',
          error: error.message
        });
      }
    }

    resolve({
      success: true,
      results
    });
  });
}

// ===== INICIALIZAR EXTENSÃO =====
const extension = new FacebookCommentExtension();
self.facebookCommentExtension = extension;