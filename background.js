// ===== BACKGROUND.JS CON CONTROL COMPLETO POR TABS Y MULTI-USUARIO =====
console.log('🚀 Facebook Comment Tool - Background Script iniciado (Multi-Usuario)');

class FacebookCommentExtension {
  constructor() {
    this.isConnected = false;
    this.apiUrl = 'https://api.gestorfb.pt/api';
    this.pollingInterval = 2000;
    this.pollingTimer = null;
    this.facebookTabs = new Map();
    this.executingCommands = new Set();
    this.profiles = new Map();
    
    // Propiedades para usuario
    this.extensionId = this.generateExtensionId();
    this.userToken = null;
    this.userId = null;
    this.isRegistered = false;
    
    this.init();
  }

  generateExtensionId() {
    return `ext_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async init() {
    console.log('🔧 Inicializando extensão...');
    console.log(`🔗 Extension ID: ${this.extensionId}`);
    console.log(`🔗 API configurada: ${this.apiUrl}`);
    
    // Intentar obtener token guardado
    const stored = await chrome.storage.local.get(['userToken']);
    if (stored.userToken) {
      await this.registerWithToken(stored.userToken);
    }
    
    this.setupTabListeners();
    this.setupMessageListeners();
    // NO registrar tabs existentes automáticamente
  }

  async registerWithToken(token) {
    try {
      console.log('🔐 Registrando extensión con token...');
      
      // Si ya estábamos registrados con otro usuario, limpiar primero
      if (this.isRegistered && this.userId) {
        console.log('🔄 Cambiando de usuario, limpiando datos anteriores...');
        
        // Detener polling
        if (this.pollingTimer) {
          clearInterval(this.pollingTimer);
          this.pollingTimer = null;
        }
        
        // Limpiar tabs del usuario anterior
        await this.cleanupUserTabs();
      }
      
      const response = await fetch(`${this.apiUrl}/extension/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: token,
          extensionId: this.extensionId
        })
      });

      if (response.ok) {
        const data = await response.json();
        const oldUserId = this.userId;
        
        this.userToken = token;
        this.userId = data.userId;
        this.isRegistered = true;
        
        console.log(`✅ Extensión registrada para usuario ${this.userId}`);
        
        // Si cambió el usuario, notificar
        if (oldUserId && oldUserId !== this.userId) {
          console.log(`👤 Usuario cambió de ${oldUserId} a ${this.userId}`);
        }
        
        // Iniciar polling solo después de registrarse
        this.startPolling();
        
        return true;
      } else {
        console.error('❌ Token inválido o expirado');
        await chrome.storage.local.remove(['userToken']);
        this.isRegistered = false;
        this.userId = null;
        return false;
      }
    } catch (error) {
      console.error('❌ Error registrando extensión:', error);
      this.isRegistered = false;
      this.userId = null;
      return false;
    }
  }

  async cleanupUserTabs() {
    console.log('🧹 Limpiando tabs del usuario anterior...');
    
    // Cerrar todas las tabs de Facebook del usuario anterior
    const tabIds = Array.from(this.facebookTabs.keys());
    if (tabIds.length > 0) {
      try {
        await chrome.tabs.remove(tabIds);
      } catch (error) {
        console.error('Error cerrando tabs:', error);
      }
    }
    
    // Limpiar mapas
    this.facebookTabs.clear();
    this.profiles.clear();
    this.executingCommands.clear();
  }

  async unregister() {
    console.log('🚪 Desregistrando extensión...');
    
    // Detener polling
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    
    // Limpiar datos
    await this.cleanupUserTabs();
    
    // Limpiar storage
    await chrome.storage.local.remove(['userToken']);
    
    // Resetear estado
    this.userToken = null;
    this.userId = null;
    this.isRegistered = false;
    this.isConnected = false;
    
    this.updateIcon('disconnected');
    
    console.log('✅ Extensión desregistrada');
  }

  // ===== POLLING Y COMANDOS =====
  startPolling() {
    if (!this.isRegistered) {
      console.log('⚠️ No se puede iniciar polling sin registro');
      return;
    }
    
    console.log('🔄 Iniciando polling para comandos...');
    
    this.pollingTimer = setInterval(async () => {
      try {
        await this.checkForCommands();
      } catch (error) {
        console.error('❌ Erro no polling:', error);
      }
    }, this.pollingInterval);
  }

  async checkForCommands() {
    if (!this.isRegistered) return;
    
    try {
      const response = await fetch(`${this.apiUrl}/extension/next-command`, {
        headers: {
          'X-Extension-Id': this.extensionId
        }
      });
      
      if (!response.ok) {
        if (this.isConnected) {
          console.log('🔌 API não acessível');
          this.isConnected = false;
          this.updateIcon('disconnected');
        }
        return;
      }

      if (!this.isConnected) {
        console.log('✅ Conectado à API');
        this.isConnected = true;
        this.updateIcon('connected');
      }

      const data = await response.json();
      
      if (data.hasCommand) {
        console.log(`📨 Comando recebido: ${data.command.action} para usuário ${data.command.userId}`);
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
    
    console.log(`🎯 Ejecutando comando: ${action}`, data);
    
    if (this.executingCommands.has(id)) {
      console.log(`⚠️ Comando ${id} já está em execução`);
      return;
    }
    
    this.executingCommands.add(id);
    
    let result = { success: false, error: 'Comando não implementado' };

    try {
      switch (action) {
        case 'open_facebook':
          result = await this.openFacebook(data);
          console.log(`✅ Resultado de open_facebook:`, result);
          break;
        case 'create_profile':
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
        case 'close_tab':
          result = await this.closeTab(data);
          break;
        case 'get_tabs_status':
          result = await this.getTabsStatus();
          break;
        default:
          result = { success: false, error: `Ação não reconhecida: ${action}` };
      }
    } catch (error) {
      console.error(`❌ Erro executando ${action}:`, error);
      result = { success: false, error: error.message };
    }

    console.log(`📤 Enviando resultado para comando ${id}:`, result);
    await this.sendResult(id, result);
    this.executingCommands.delete(id);
  }

  async sendResult(commandId, result) {
    if (!this.isRegistered) return;
    
    try {
      console.log(`📨 Preparando para enviar resultado del comando ${commandId}:`, result);
      
      const payload = {
        commandId,
        success: result.success || false,
        result: result.success ? result : undefined,
        error: result.success ? undefined : (result.error || 'Error desconhecido')
      };
      
      console.log(`📤 Payload a enviar:`, payload);
      
      const response = await fetch(`${this.apiUrl}/extension/command-result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Extension-Id': this.extensionId
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log(`✅ Resultado enviado exitosamente: ${commandId}`);
      } else {
        console.error(`❌ Error enviando resultado - Status: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Erro enviando resultado:', error);
    }
  }

  // ===== GESTÃO DE TABS =====
  
  async getTabsStatus() {
    try {
      console.log(`📊 Obteniendo estado de tabs para usuario ${this.userId}...`);
      console.log('Tabs en memoria:', this.facebookTabs.size);
      
      const tabs = [];
      
      for (const [tabId, tabInfo] of this.facebookTabs.entries()) {
        try {
          // Verificar si la tab todavía existe
          const chromeTab = await chrome.tabs.get(parseInt(tabId));
          
          // Verificar si sigue siendo una tab de Facebook
          if (chromeTab && chromeTab.url && chromeTab.url.includes('facebook.com')) {
            // Verificar login status
            const isLoggedIn = await this.checkLoginStatus(chromeTab.id);
            
            const tabData = {
              tabId: parseInt(tabId),
              profile: tabInfo.profile || 'default',
              isLoggedIn: isLoggedIn,
              url: chromeTab.url,
              status: chromeTab.active ? 'active' : 'inactive',
              email: tabInfo.email,
              created: tabInfo.created,
              lastAction: tabInfo.lastAction,
              userId: this.userId
            };
            
            tabs.push(tabData);
            
            // Actualizar status de login en memoria
            tabInfo.isLoggedIn = isLoggedIn;
            
            console.log(`✅ Tab ${tabId} incluida:`, tabData);
          } else {
            console.log(`⚠️ Tab ${tabId} no es de Facebook o no tiene URL`);
            this.facebookTabs.delete(tabId);
          }
        } catch (error) {
          // Tab no existe más
          console.log(`❌ Tab ${tabId} no existe, removiendo...`);
          this.facebookTabs.delete(tabId);
        }
      }
      
      const result = {
        success: true,
        tabs: tabs,
        userId: this.userId
      };
      
      console.log('📤 Retornando estado de tabs:', result);
      
      return result;
      
    } catch (error) {
      console.error('❌ Erro obtendo status das tabs:', error);
      return {
        success: false,
        error: error.message,
        tabs: [],
        userId: this.userId
      };
    }
  }

  async createNewProfile(profileName) {
    try {
      console.log(`🆕 Criando novo perfil: ${profileName}`);
      
      const window = await chrome.windows.create({
        url: 'https://facebook.com',
        type: 'normal',
        state: 'normal',
        focused: true,
        width: 1200,
        height: 800,
        left: Math.floor(Math.random() * 200),
        top: Math.floor(Math.random() * 200)
      });
      
      const tab = window.tabs[0];
      
      this.profiles.set(profileName, {
        windowId: window.id,
        tabId: tab.id,
        name: profileName,
        created: Date.now()
      });
      
      this.facebookTabs.set(tab.id, {
        id: tab.id,
        url: tab.url,
        isLoggedIn: false,
        profile: profileName,
        created: Date.now(),
        userId: this.userId
      });
      
      return {
        success: true,
        tabId: tab.id,
        windowId: window.id,
        profile: profileName
      };
      
    } catch (error) {
      console.error('❌ Erro criando perfil:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async openFacebook(data = {}) {
    try {
      const { profile = 'default', newWindow = false } = data;
      
      console.log(`📘 Abriendo Facebook - Perfil: ${profile} - Usuario: ${this.userId}`);
      
      let tab;
      
      // Verificar si ya hay una pestaña de Facebook abierta para este perfil
      const existingTabs = await chrome.tabs.query({ 
        url: ['*://facebook.com/*', '*://*.facebook.com/*'] 
      });
      
      // Buscar tab existente con el mismo perfil
      let existingProfileTab = null;
      for (const existingTab of existingTabs) {
        if (this.facebookTabs.has(existingTab.id)) {
          const tabInfo = this.facebookTabs.get(existingTab.id);
          if (tabInfo.profile === profile && tabInfo.userId === this.userId) {
            existingProfileTab = existingTab;
            break;
          }
        }
      }
      
      if (existingProfileTab && !newWindow) {
        // Usar pestaña existente del mismo perfil
        tab = existingProfileTab;
        await chrome.tabs.update(tab.id, { active: true });
        
        if (tab.windowId) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
        
        console.log(`✅ Usando pestaña existente de Facebook - Perfil: ${profile}`);
      } else {
        // Crear nueva pestaña o ventana
        if (newWindow || profile !== 'default') {
          const windowConfig = {
            url: 'https://facebook.com',
            type: 'normal',
            state: 'normal',
            focused: true,
            width: 1200,
            height: 800
          };
          
          const window = await chrome.windows.create(windowConfig);
          await new Promise(r => setTimeout(r, 500));
          
          tab = window.tabs[0];
          
          if (profile !== 'default') {
            this.profiles.set(profile, {
              windowId: window.id,
              tabId: tab.id,
              name: profile
            });
          }
        } else {
          try {
            tab = await chrome.tabs.create({
              url: 'https://facebook.com',
              active: true
            });
            
            if (tab.windowId) {
              await chrome.windows.update(tab.windowId, { focused: true });
            }
          } catch (error) {
            console.error('❌ Error creando pestaña, intentando método alternativo:', error);
            
            const window = await chrome.windows.getCurrent();
            tab = await chrome.tabs.create({
              url: 'https://facebook.com',
              windowId: window.id,
              active: true
            });
          }
        }
      }
      
      if (!tab || !tab.id) {
        throw new Error('No se pudo crear o encontrar la pestaña');
      }
      
      // IMPORTANTE: Asegurar que el tabId es un número
      const tabId = parseInt(tab.id);
      
      this.facebookTabs.set(tabId, {
        id: tabId,
        tabId: tabId,
        url: tab.url || 'https://facebook.com',
        isLoggedIn: false,
        profile: profile,
        created: Date.now(),
        userId: this.userId
      });
      
      console.log(`📌 Tab registrada:`, {
        tabId: tabId,
        profile: profile,
        userId: this.userId,
        totalTabs: this.facebookTabs.size
      });
      
      await this.waitForTabLoad(tabId, 10000);
      
      const isLoggedIn = await this.checkLoginStatus(tabId);
      
      if (isLoggedIn) {
        this.facebookTabs.get(tabId).isLoggedIn = true;
      }
      
      console.log(`✅ Facebook aberto - Tab: ${tabId} - Perfil: ${profile} - Logado: ${isLoggedIn}`);
      
      this.updateIcon('connected');
      
      const result = {
        success: true,
        tabId: tabId,
        isLoggedIn: isLoggedIn,
        profile: profile
      };
      
      console.log('🔄 Devolviendo resultado:', result);
      
      return result;
      
    } catch (error) {
      console.error('❌ Erro abrindo Facebook:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async loginFacebook({ email, password, tabId }) {
    try {
      console.log(`🔑 Login no Facebook - Tab: ${tabId} - Usuario: ${this.userId}`);
      
      if (!tabId || !this.facebookTabs.has(tabId)) {
        throw new Error('Tab não encontrada');
      }
      
      const result = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: loginInPage,
        args: [email, password]
      });
      
      const loginResult = result[0].result;
      
      if (loginResult.success) {
        const tabInfo = this.facebookTabs.get(tabId);
        tabInfo.isLoggedIn = true;
        tabInfo.email = email;
        tabInfo.lastAction = 'Login realizado';
      }
      
      console.log(`✅ Login processado - Tab: ${tabId}`);
      return loginResult;
      
    } catch (error) {
      console.error('❌ Erro no login:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async navigateTo({ url, tabId }) {
    try {
      console.log(`🔗 Navegando - Tab: ${tabId} - URL: ${url}`);
      
      if (!tabId || !this.facebookTabs.has(tabId)) {
        throw new Error('Tab não encontrada');
      }
      
      await chrome.tabs.update(tabId, { url, active: true });
      await this.waitForTabLoad(tabId);
      
      const currentTab = await chrome.tabs.get(tabId);
      
      const tabInfo = this.facebookTabs.get(tabId);
      tabInfo.url = currentTab.url;
      tabInfo.lastAction = `Navegou para: ${url.substring(0, 30)}...`;
      
      return {
        success: true,
        finalUrl: currentTab.url,
        tabId: tabId
      };
      
    } catch (error) {
      console.error('❌ Erro navegando:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async comment({ text, humanMode = true, tabId }) {
    try {
      console.log(`💬 Comentando - Tab: ${tabId} - Texto: "${text}"`);
      
      if (!tabId || !this.facebookTabs.has(tabId)) {
        throw new Error('Tab não encontrada');
      }
      
      const result = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: commentInPage,
        args: [text, humanMode]
      });
      
      const tabInfo = this.facebookTabs.get(tabId);
      tabInfo.lastAction = `Comentou: ${text.substring(0, 20)}...`;
      
      console.log(`✅ Comentário enviado - Tab: ${tabId}`);
      return result[0].result;
      
    } catch (error) {
      console.error('❌ Erro comentando:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async multiComment({ comments, interval, randomize, tabId }) {
    try {
      console.log(`📨 Enviando ${comments.length} comentários - Tab: ${tabId}`);
      
      if (!tabId || !this.facebookTabs.has(tabId)) {
        throw new Error('Tab não encontrada');
      }
      
      const result = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: multiCommentInPage,
        args: [comments, interval, randomize]
      });
      
      const tabInfo = this.facebookTabs.get(tabId);
      tabInfo.lastAction = `Enviou ${comments.length} comentários`;
      
      return result[0].result;
      
    } catch (error) {
      console.error('❌ Erro nos comentários múltiplos:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async closeTab({ tabId }) {
    try {
      console.log(`🚪 Fechando tab: ${tabId}`);
      
      if (tabId && this.facebookTabs.has(tabId)) {
        await chrome.tabs.remove(tabId);
        this.facebookTabs.delete(tabId);
      }
      
      this.updateIcon('connected');
      
      return {
        success: true,
        message: 'Tab fechada'
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async closeFacebookTabs() {
    try {
      console.log(`🚪 Cerrando todas las tabs del usuario ${this.userId}...`);
      
      const tabIds = Array.from(this.facebookTabs.keys());
      const tabCount = tabIds.length;
      
      console.log(`📊 Tabs a cerrar: ${tabCount}`);
      
      if (tabIds.length > 0) {
        await chrome.tabs.remove(tabIds);
        this.facebookTabs.clear();
        console.log('✅ Todas las tabs cerradas');
      }
      
      this.updateIcon('connected');
      
      return {
        success: true,
        message: `${tabCount} abas fechadas`,
        count: tabCount
      };
      
    } catch (error) {
      console.error('❌ Error cerrando tabs:', error);
      return {
        success: false,
        error: error.message,
        count: 0
      };
    }
  }

  // ===== FUNÇÕES AUXILIARES =====
  
  async waitForTabLoad(tabId, maxTime = 10000) {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkStatus = async () => {
        try {
          const tab = await chrome.tabs.get(tabId);
          
          if (tab && tab.status === 'complete') {
            resolve();
          } else if (Date.now() - startTime > maxTime) {
            console.log('⚠️ Timeout esperando carga de pestaña');
            resolve();
          } else {
            setTimeout(checkStatus, 500);
          }
        } catch (error) {
          console.error('Error verificando estado de pestaña:', error);
          resolve();
        }
      };
      
      checkStatus();
    });
  }

  async checkLoginStatus(tabId) {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Verificar múltiples indicadores de login
          const hasLoginForm = document.querySelector('input[name="email"]');
          const hasNavBar = document.querySelector('[role="navigation"]');
          const hasUserMenu = document.querySelector('[aria-label*="conta"]') || 
                             document.querySelector('[aria-label*="Account"]');
          const hasComposer = document.querySelector('[role="main"] [role="textbox"]');
          
          return !hasLoginForm && (hasNavBar || hasUserMenu || hasComposer);
        }
      });
      return result[0].result;
    } catch (error) {
      return false;
    }
  }

  getActiveFacebookTab(profile = null) {
    if (profile) {
      for (const [tabId, tabInfo] of this.facebookTabs.entries()) {
        if (tabInfo.profile === profile && tabInfo.userId === this.userId) {
          return tabInfo;
        }
      }
    }
    return Array.from(this.facebookTabs.values()).find(tab => tab.userId === this.userId) || null;
  }

  async checkExistingFacebookTabs() {
    // Solo ejecutar si ya estamos registrados
    if (!this.isRegistered) {
      console.log('⚠️ No registrado, saltando verificación de tabs existentes');
      return;
    }
    
    try {
      const tabs = await chrome.tabs.query({ 
        url: ['*://facebook.com/*', '*://*.facebook.com/*'] 
      });
      
      // Solo registrar tabs si no tenemos tabs registradas
      if (this.facebookTabs.size === 0 && tabs.length > 0) {
        console.log(`⚠️ ${tabs.length} tabs de Facebook encontradas, pero no las registramos automáticamente`);
        // NO registrar automáticamente las tabs existentes
      }
      
      this.updateIcon('connected');
    } catch (error) {
      console.error('Erro verificando tabs:', error);
    }
  }

  setupTabListeners() {
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.facebookTabs.has(tabId)) {
        this.facebookTabs.delete(tabId);
        console.log(`🗑️ Tab ${tabId} removida`);
        this.updateIcon('connected');
      }
    });
    
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (this.facebookTabs.has(tabId) && changeInfo.url) {
        const tabInfo = this.facebookTabs.get(tabId);
        tabInfo.url = changeInfo.url;
        
        // Se saiu do Facebook, remover da lista
        if (!changeInfo.url.includes('facebook.com')) {
          this.facebookTabs.delete(tabId);
          console.log(`🔄 Tab ${tabId} saiu do Facebook`);
          this.updateIcon('connected');
        }
      }
    });
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'getStatus') {
        const tabsArray = Array.from(this.facebookTabs.values())
          .filter(tab => tab.userId === this.userId); // Solo tabs del usuario actual
        
        sendResponse({
          connected: this.isConnected,
          registered: this.isRegistered,
          userId: this.userId,
          extensionId: this.extensionId,
          facebookTabs: tabsArray.length,
          tabs: tabsArray
        });
      } else if (request.action === 'setToken') {
        // Recibir token desde el popup o content script
        this.registerWithToken(request.token).then(success => {
          sendResponse({ success, userId: this.userId });
        });
        return true; // Indica que la respuesta es asíncrona
      } else if (request.action === 'logout') {
        // Manejar logout
        this.unregister().then(() => {
          sendResponse({ success: true });
        });
        return true;
      }
      return true;
    });
  }

  updateIcon(status) {
    try {
      chrome.action.setIcon({
        path: 'icons/icon16.png'
      });
      
      // Mostrar número de tabs activas del usuario actual
      const userTabs = Array.from(this.facebookTabs.values())
        .filter(tab => tab.userId === this.userId).length;
      
      chrome.action.setBadgeText({
        text: userTabs > 0 ? userTabs.toString() : ''
      });
      
      chrome.action.setBadgeBackgroundColor({
        color: status === 'connected' && this.isRegistered ? '#4CAF50' : '#F44336'
      });
      
      // Mostrar userId en el título
      chrome.action.setTitle({
        title: this.isRegistered ? 
          `Facebook Tool - Usuario: ${this.userId}` : 
          'Facebook Tool - No registrado'
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
        
        emailField.focus();
        emailField.value = email;
        emailField.dispatchEvent(new Event('input', { bubbles: true }));
        
        await new Promise(r => setTimeout(r, 500));
        
        passwordField.focus();
        passwordField.value = password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        
        await new Promise(r => setTimeout(r, 1000));
        
        const loginButton = document.querySelector('button[name="login"], button[data-testid="royal_login_button"]');
        
        if (loginButton) {
          loginButton.click();
        } else {
          passwordField.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        }
        
        resolve({
          success: true,
          message: 'Login iniciado - verifique o status'
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
        // Verificar si estamos en la página de Watch
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
        
        // Buscar caja de comentarios
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
        
        commentBox.click();
        commentBox.focus();
        await new Promise(r => setTimeout(r, 500));
        
        // Escribir comentario
        if (humanMode) {
          commentBox.focus();
          document.execCommand('selectAll');
          document.execCommand('delete');
          
          for (const char of text) {
            document.execCommand('insertText', false, char);
            commentBox.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, Math.random() * 100 + 50));
          }
        } else {
          commentBox.focus();
          document.execCommand('selectAll');
          document.execCommand('delete');
          document.execCommand('insertText', false, text);
          
          commentBox.dispatchEvent(new Event('input', { bubbles: true }));
          commentBox.dispatchEvent(new InputEvent('input', { 
            bubbles: true,
            data: text,
            inputType: 'insertText'
          }));
        }
        
        await new Promise(r => setTimeout(r, 1000));
        
        // Buscar botón de enviar
        console.log('🔍 Buscando botón de enviar...');
        
        let submitButton = null;
        const submitSelectors = [
          '[aria-label="Comment"]:not([aria-disabled="true"])',
          '[aria-label="Comentar"]:not([aria-disabled="true"])',
          'div[role="button"] i[style*="background-position: 0px -338px"]',
          '#focused-state-composer-submit div[role="button"]:not([aria-disabled="true"])',
          'div[role="button"]:not([aria-disabled="true"]) i.x1b0d499'
        ];
        
        for (let attempt = 0; attempt < 5; attempt++) {
          for (const selector of submitSelectors) {
            const element = document.querySelector(selector);
            if (element) {
              submitButton = element.closest('[role="button"]') || element;
              
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
          submitButton.click();
          
          await new Promise(r => setTimeout(r, 2000));
          
          resolve({
            success: true,
            message: 'Comentário enviado com sucesso'
          });
        } else {
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