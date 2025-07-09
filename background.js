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
    
    // Verificar si es el mismo token que ya tenemos
    if (this.isRegistered && this.userToken === token) {
      console.log('✅ Ya registrado con el mismo token, no hacer nada');
      return true;
    }
    
    // Solo limpiar si es un usuario diferente
    const needsCleanup = this.isRegistered && this.userId && this.userToken !== token;
    
    if (needsCleanup) {
      console.log('🔄 Token diferente, verificando si cambió el usuario...');
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
      const newUserId = data.userId;
      
      // Solo limpiar si REALMENTE cambió el usuario
      if (needsCleanup && oldUserId !== newUserId) {
        console.log(`👤 Usuario cambió de ${oldUserId} a ${newUserId}, limpiando datos...`);
        
        // Detener polling
        if (this.pollingTimer) {
          clearInterval(this.pollingTimer);
          this.pollingTimer = null;
        }
        
        // Limpiar tabs del usuario anterior
        await this.cleanupUserTabs();
      } else if (oldUserId === newUserId) {
        console.log('✅ Mismo usuario, manteniendo tabs existentes');
      }
      
      this.userToken = token;
      this.userId = newUserId;
      this.isRegistered = true;
      
      console.log(`✅ Extensión registrada para usuario ${this.userId}`);
      
      // Solo iniciar polling si no está ya corriendo
      if (!this.pollingTimer) {
        this.startPolling();
      }
      
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
    console.log('🔍 TabId en result:', result.tabId); // Añade este log
    
    const payload = {
      commandId,
      success: result.success || false,
      result: result.success ? result : undefined,
      error: result.success ? undefined : (result.error || 'Error desconhecido')
    };
    
    console.log(`📤 Payload a enviar:`, payload);
    // Verifica que result.tabId esté en payload.result
    console.log('🔍 TabId en payload.result:', payload.result?.tabId);
      
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
    
    // Debug: mostrar todas las tabs en memoria
    for (const [tabId, tabInfo] of this.facebookTabs.entries()) {
      console.log('🔍 Tab en memoria:', {
        tabId: tabId,
        profile: tabInfo.profile,
        userId: tabInfo.userId
      });
    }
    
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
    console.error('❌ Error obteniendo status de tabs:', error);
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
    let realTabId;
    
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
      realTabId = tab.id;
      await chrome.tabs.update(realTabId, { active: true });
      
      if (tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      
      console.log(`✅ Usando pestaña existente de Facebook - Perfil: ${profile}`);
    } else {
      // Crear nueva pestaña o ventana
      if (newWindow || profile !== 'default') {
        const windowConfig = {
          url: 'https://www.facebook.com',
          type: 'normal',
          state: 'normal',
          focused: true,
          width: 1200,
          height: 800,
          incognito: false
        };
        
        const window = await chrome.windows.create(windowConfig);
        console.log('🪟 Window creada:', window);
        console.log('🪟 Window ID:', window.id);
        
        // Esperar un poco más para que Chrome estabilice la ventana
        await new Promise(r => setTimeout(r, 2000));
        
        // Obtener TODAS las tabs activas para encontrar la nuestra
        const allTabs = await chrome.tabs.query({ active: true });
        console.log('📑 Todas las tabs activas:', allTabs);
        
        // Buscar la tab en la ventana que acabamos de crear
        const windowTabs = await chrome.tabs.query({ windowId: window.id });
        console.log('📑 Tabs en la ventana creada:', windowTabs);
        
        if (windowTabs.length > 0) {
          tab = windowTabs[0];
          realTabId = tab.id;
          console.log('✅ Tab encontrada con ID real:', realTabId);
        } else {
          // Si no encontramos tabs, buscar por URL
          const fbTabs = await chrome.tabs.query({ url: '*://*.facebook.com/*' });
          console.log('📑 Tabs de Facebook encontradas:', fbTabs);
          
          if (fbTabs.length > 0) {
            // Tomar la más reciente
            tab = fbTabs[fbTabs.length - 1];
            realTabId = tab.id;
            console.log('✅ Tab de Facebook encontrada:', realTabId);
          } else {
            throw new Error('No se pudo encontrar la tab creada');
          }
        }
        
        if (profile !== 'default') {
          this.profiles.set(profile, {
            windowId: window.id,
            tabId: realTabId,
            name: profile
          });
        }
      } else {
        // Crear tab normal
        tab = await chrome.tabs.create({
          url: 'https://www.facebook.com',
          active: true
        });
        
        realTabId = tab.id;
        console.log('📑 Tab creada con ID:', realTabId);
      }
    }
    
    if (!tab || !realTabId) {
      throw new Error('No se pudo crear o encontrar la pestaña');
    }
    
    console.log('🔍 Tab ID final a usar:', realTabId);
    console.log('🔍 Tab object:', tab);
    
    // Verificar que la tab existe con el ID correcto
    try {
      const tabVerification = await chrome.tabs.get(realTabId);
      console.log('✅ Tab verificada:', tabVerification);
    } catch (e) {
      console.error('❌ Error verificando tab:', e);
      // Intentar encontrar la tab de otra manera
      const recentTabs = await chrome.tabs.query({ 
        url: '*://*.facebook.com/*',
        windowId: tab.windowId 
      });
      if (recentTabs.length > 0) {
        tab = recentTabs[0];
        realTabId = tab.id;
        console.log('🔄 Tab recuperada con nuevo ID:', realTabId);
      } else {
        throw new Error('No se pudo verificar la tab');
      }
    }
    
    // Registrar la tab con el ID correcto
    this.facebookTabs.set(realTabId, {
      id: realTabId,
      tabId: realTabId,
      url: tab.url || 'https://www.facebook.com',
      isLoggedIn: false,
      profile: profile,
      created: Date.now(),
      userId: this.userId
    });
    
    console.log(`📌 Tab registrada con ID ${realTabId}:`, {
      profile: profile,
      userId: this.userId,
      totalTabs: this.facebookTabs.size
    });
    
    // Esperar a que cargue
    await this.waitForTabLoadSafe(realTabId, 15000);
    
    // Verificar estado de login
    const isLoggedIn = await this.checkLoginStatus(realTabId);
    
    if (isLoggedIn) {
      const tabInfo = this.facebookTabs.get(realTabId);
      if (tabInfo) {
        tabInfo.isLoggedIn = true;
      }
    }
    
    console.log(`✅ Facebook abierto - Tab: ${realTabId} - Perfil: ${profile} - Logado: ${isLoggedIn}`);
    
    this.updateIcon('connected');
    
    const result = {
      success: true,
      tabId: realTabId,
      isLoggedIn: isLoggedIn,
      profile: profile
    };
    
    console.log('🔄 Devolviendo resultado final:', result);
    
    return result;
    
  } catch (error) {
    console.error('❌ Error abriendo Facebook:', error);
    return {
      success: false,
      error: error.message
    };
  }
}


async waitForTabLoadSafe(tabId, maxTime = 15000) {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const checkStatus = async () => {
      try {
        // Intentar obtener la tab
        const tab = await chrome.tabs.get(tabId);
        
        console.log(`⏳ Tab ${tabId} - Estado: ${tab.status}, URL: ${tab.url || 'cargando...'}`);
        
        if (tab.status === 'complete') {
          console.log(`✅ Tab ${tabId} carga completa`);
          resolve(true);
        } else if (Date.now() - startTime > maxTime) {
          console.log('⚠️ Timeout esperando carga, continuando...');
          resolve(true);
        } else {
          setTimeout(checkStatus, 1000);
        }
      } catch (error) {
        console.log(`⚠️ Error verificando tab ${tabId}, continuando:`, error.message);
        resolve(true); // Continuar aunque haya error
      }
    };
    
    checkStatus();
  });
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
    
    // Verificar si tenemos la tab en memoria
    if (!tabId || !this.facebookTabs.has(tabId)) {
      console.error('❌ Tab no encontrada en memoria:', tabId);
      throw new Error('Tab não encontrada');
    }
    
    // Intentar obtener la tab actual
    let currentTab;
    try {
      currentTab = await chrome.tabs.get(tabId);
      console.log('✅ Tab encontrada:', currentTab);
    } catch (error) {
      console.error('❌ Tab no existe, intentando recuperar...');
      
      // Intentar encontrar la tab por perfil
      const tabInfo = this.facebookTabs.get(tabId);
      if (tabInfo && tabInfo.profile) {
        // Buscar tabs de Facebook
        const fbTabs = await chrome.tabs.query({ url: '*://*.facebook.com/*' });
        
        // Buscar por ventana si tenemos el windowId
        for (const fbTab of fbTabs) {
          // Verificar si es la misma ventana/perfil
          const profileInfo = this.profiles.get(tabInfo.profile);
          if (profileInfo && profileInfo.windowId === fbTab.windowId) {
            console.log('✅ Tab recuperada por perfil:', fbTab.id);
            
            // Actualizar el ID en nuestra memoria
            this.facebookTabs.delete(tabId);
            this.facebookTabs.set(fbTab.id, {
              ...tabInfo,
              id: fbTab.id,
              tabId: fbTab.id
            });
            
            currentTab = fbTab;
            tabId = fbTab.id; // Usar el nuevo ID
            break;
          }
        }
      }
      
      if (!currentTab) {
        throw new Error('No se pudo recuperar la tab');
      }
    }
    
    // Navegar a la URL
    await chrome.tabs.update(tabId, { url, active: true });
    
    // Esperar a que cargue
    await this.waitForTabLoadSafe(tabId, 10000);
    
    // Obtener la tab actualizada
    const updatedTab = await chrome.tabs.get(tabId);
    
    // Actualizar información en memoria
    const tabInfo = this.facebookTabs.get(tabId);
    if (tabInfo) {
      tabInfo.url = updatedTab.url;
      tabInfo.lastAction = `Navegou para: ${url.substring(0, 30)}...`;
    }
    
    return {
      success: true,
      finalUrl: updatedTab.url,
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
    
    // Verificar si tenemos la tab en memoria
    if (!tabId || !this.facebookTabs.has(tabId)) {
      console.error('❌ Tab no encontrada en memoria:', tabId);
      throw new Error('Tab não encontrada');
    }
    
    // Verificar que la tab existe
    let validTabId = tabId;
    try {
      await chrome.tabs.get(tabId);
    } catch (error) {
      console.log('⚠️ Tab no existe, intentando recuperar...');
      
      // Intentar recuperar la tab
      const tabInfo = this.facebookTabs.get(tabId);
      if (tabInfo && tabInfo.profile) {
        const fbTabs = await chrome.tabs.query({ url: '*://*.facebook.com/*' });
        
        for (const fbTab of fbTabs) {
          const profileInfo = this.profiles.get(tabInfo.profile);
          if (profileInfo && profileInfo.windowId === fbTab.windowId) {
            console.log('✅ Tab recuperada:', fbTab.id);
            
            // Actualizar referencias
            this.facebookTabs.delete(tabId);
            this.facebookTabs.set(fbTab.id, {
              ...tabInfo,
              id: fbTab.id,
              tabId: fbTab.id
            });
            
            validTabId = fbTab.id;
            break;
          }
        }
      }
    }
    
    // Ejecutar el comentario
    const result = await chrome.scripting.executeScript({
      target: { tabId: validTabId },
      func: commentInPage,
      args: [text, humanMode]
    });
    
    // Actualizar información
    const tabInfo = this.facebookTabs.get(validTabId);
    if (tabInfo) {
      tabInfo.lastAction = `Comentou: ${text.substring(0, 20)}...`;
    }
    
    console.log(`✅ Comentário enviado - Tab: ${validTabId}`);
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
  // Listener para cuando se cierra una pestaña
  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (this.facebookTabs.has(tabId)) {
      console.log(`🗑️ Tab ${tabId} cerrada por usuario/sistema - Info:`, removeInfo);
      this.facebookTabs.delete(tabId);
      this.updateIcon('connected');
    }
  });
  
  // Listener para actualizaciones de pestañas
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (this.facebookTabs.has(tabId)) {
      const tabInfo = this.facebookTabs.get(tabId);
      
      // Solo actualizar URL si está completa
      if (changeInfo.status === 'complete' && tab.url) {
        tabInfo.url = tab.url;
        console.log(`📍 Tab ${tabId} navegó a: ${tab.url}`);
        
        // Solo eliminar si REALMENTE salió de Facebook y no es una URL temporal
        if (!tab.url.includes('facebook.com') && 
            !tab.url.includes('about:blank') &&
            !tab.url.includes('chrome://')) {
          
          console.log(`⚠️ Tab ${tabId} salió de Facebook a: ${tab.url}`);
          // Opcional: mantener la tab pero marcarla como "fuera de Facebook"
          tabInfo.outOfFacebook = true;
          // NO eliminar automáticamente
          // this.facebookTabs.delete(tabId);
        }
      }
    }
  });
}

 setupMessageListeners() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Mensaje recibido en background:', request);
    
    if (request.action === 'getStatus') {
      const response = {
        connected: this.isConnected,
        registered: this.isRegistered,
        userId: this.userId,
        extensionId: this.extensionId,
        facebookTabs: Array.from(this.facebookTabs.values()).filter(tab => tab.userId === this.userId).length,
        tabs: Array.from(this.facebookTabs.values()).filter(tab => tab.userId === this.userId)
      };
      console.log('📤 Enviando status:', response);
      sendResponse(response);
    } else if (request.action === 'setToken') {
      // Verificar si es el mismo token antes de re-registrar
      if (this.userToken === request.token && this.isRegistered) {
        console.log('✅ Mismo token, no re-registrar');
        sendResponse({ success: true, userId: this.userId });
      } else {
        console.log('🔑 Token diferente o no registrado, procediendo...');
        this.registerWithToken(request.token).then(success => {
          console.log('📤 Resultado de registro:', { success, userId: this.userId });
          sendResponse({ success, userId: this.userId });
        });
      }
      return true; // Indica que la respuesta es asíncrona
    } else if (request.action === 'logout') {
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