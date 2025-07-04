// ===== BACKGROUND.JS SIN WEBSOCKET - POLLING HTTP =====
console.log('🚀 Facebook Comment Tool - Background Script iniciado (HTTP)');

class FacebookCommentExtension {
  constructor() {
    this.isConnected = false;
    this.apiUrl = 'https://api.gestorfb.pt/api'; // Tu API REST
    this.pollingInterval = 2000; // Consultar cada 2 segundos
    this.pollingTimer = null;
    this.facebookTabs = new Map();
    
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
          result = await this.openFacebook();
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
  
  async openFacebook() {
    try {
      console.log('📘 Abrindo Facebook...');
      
      const tab = await chrome.tabs.create({
        url: 'https://facebook.com',
        active: true
      });
      
      this.facebookTabs.set(tab.id, {
        id: tab.id,
        url: tab.url,
        isLoggedIn: false,
        created: Date.now()
      });
      
      await this.waitForTabLoad(tab.id);
      const isLoggedIn = await this.checkLoginStatus(tab.id);
      
      console.log(`✅ Facebook aberto - Logado: ${isLoggedIn}`);
      
      return {
        success: true,
        tabId: tab.id,
        isLoggedIn
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

  getActiveFacebookTab() {
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
        
        emailField.value = email;
        emailField.dispatchEvent(new Event('input', { bubbles: true }));
        
        await new Promise(r => setTimeout(r, 500));
        
        passwordField.value = password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        
        await new Promise(r => setTimeout(r, 1000));
        
        const loginButton = document.querySelector('button[name="login"], button[data-testid="royal_login_button"]');
        
        if (loginButton) {
          loginButton.click();
        } else {
          passwordField.focus();
          passwordField.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        }
        
        setTimeout(() => {
          const stillHasLoginForm = document.querySelector('input[name="email"]');
          resolve({
            success: !stillHasLoginForm,
            message: stillHasLoginForm ? 'Login pode ter falhado' : 'Login realizado'
          });
        }, 5000);
        
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
        const selectors = [
          'div[role="textbox"][aria-label*="comment" i]',
          'div[role="textbox"][aria-label*="comentário" i]',
          'div[contenteditable="true"][aria-label*="comment" i]',
          'div[contenteditable="true"][role="textbox"]'
        ];
        
        let commentBox = null;
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            const rect = element.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              commentBox = element;
              break;
            }
          }
          if (commentBox) break;
        }
        
        if (!commentBox) {
          resolve({
            success: false,
            error: 'Caixa de comentários não encontrada'
          });
          return;
        }
        
        commentBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 500));
        
        commentBox.click();
        await new Promise(r => setTimeout(r, 300));
        
        commentBox.focus();
        document.execCommand('selectAll');
        document.execCommand('delete');
        
        if (humanMode) {
          for (const char of text) {
            commentBox.textContent += char;
            commentBox.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, Math.random() * 100 + 50));
          }
        } else {
          commentBox.textContent = text;
          commentBox.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        await new Promise(r => setTimeout(r, 500));
        
        const event = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          bubbles: true
        });
        commentBox.dispatchEvent(event);
        
        await new Promise(r => setTimeout(r, 1000));
        
        resolve({
          success: true,
          message: 'Comentário enviado'
        });
        
      } catch (error) {
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