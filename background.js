// ===== BACKGROUND.JS =====
console.log('🚀 Facebook Comment Tool - Background Script iniciado');

class FacebookCommentExtension {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.serverUrl = 'wss://api.gestorfb.pt'; // ou ws://localhost:3000 para desenvolvimento
    this.reconnectInterval = 5000;
    this.facebookTabs = new Map();
    
    this.init();
  }

  async init() {
    console.log('🔧 Inicializando extensão...');
    
    // Conectar ao servidor
    this.connectToServer();
    
    // Configurar listeners
    this.setupTabListeners();
    this.setupMessageListeners();
    
    // Verificar se já existem abas do Facebook
    await this.checkExistingFacebookTabs();
  }

  connectToServer() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    console.log('🔗 Conectando ao servidor...');
    
    try {
      this.socket = new WebSocket(this.serverUrl);
      
      this.socket.onopen = () => {
        console.log('✅ Conectado ao servidor');
        this.isConnected = true;
        
        // Identificar como extensão
        this.socket.send(JSON.stringify({
          type: 'extension_connect',
          version: '1.0.0',
          timestamp: Date.now()
        }));
        
        this.updateIcon('connected');
      };
      
      this.socket.onmessage = (event) => {
        this.handleServerMessage(event.data);
      };
      
      this.socket.onclose = () => {
        console.log('🔌 Desconectado do servidor');
        this.isConnected = false;
        this.updateIcon('disconnected');
        
        // Reconectar após intervalo
        setTimeout(() => {
          this.connectToServer();
        }, this.reconnectInterval);
      };
      
      this.socket.onerror = (error) => {
        console.error('❌ Erro WebSocket:', error);
        this.updateIcon('error');
      };
      
    } catch (error) {
      console.error('❌ Erro conectando:', error);
      setTimeout(() => {
        this.connectToServer();
      }, this.reconnectInterval);
    }
  }

  async handleServerMessage(data) {
    try {
      const message = JSON.parse(data);
      console.log('📨 Comando recebido:', message);
      
      const { id, action, data: commandData } = message;
      
      let result = { success: false, error: 'Comando não implementado' };
      
      switch (action) {
        case 'open_facebook':
          result = await this.openFacebook();
          break;
        case 'login_facebook':
          result = await this.loginFacebook(commandData);
          break;
        case 'navigate_to':
          result = await this.navigateTo(commandData);
          break;
        case 'comment':
          result = await this.comment(commandData);
          break;
        case 'multi_comment':
          result = await this.multiComment(commandData);
          break;
        case 'close_tabs':
          result = await this.closeFacebookTabs();
          break;
        default:
          result = { success: false, error: `Ação não reconhecida: ${action}` };
      }
      
      // Enviar resultado de volta
      this.sendResult(id, result);
      
    } catch (error) {
      console.error('❌ Erro processando comando:', error);
      this.sendResult(message.id, { 
        success: false, 
        error: error.message 
      });
    }
  }

  sendResult(commandId, result) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'command_result',
        commandId,
        success: result.success,
        result: result.success ? result : undefined,
        error: result.success ? undefined : result.error,
        timestamp: Date.now()
      }));
    }
  }

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
      
      // Aguardar carregamento
      await this.waitForTabLoad(tab.id);
      
      // Verificar se está logado
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
        func: this.injectLogin,
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
        func: this.injectComment,
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
        func: this.injectMultiComment,
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

  // ===== FUNÇÕES INJETADAS NAS PÁGINAS =====
  
  async injectLogin(email, password) {
    return new Promise((resolve) => {
      console.log('🔑 Executando login na página...');
      
      setTimeout(async () => {
        try {
          // Buscar campos
          const emailField = document.querySelector('input[name="email"], input[data-testid="royal_email"]');
          const passwordField = document.querySelector('input[name="pass"], input[data-testid="royal_pass"]');
          
          if (!emailField || !passwordField) {
            resolve({
              success: false,
              error: 'Campos de login não encontrados'
            });
            return;
          }
          
          // Preencher campos
          emailField.value = email;
          emailField.dispatchEvent(new Event('input', { bubbles: true }));
          
          await new Promise(r => setTimeout(r, 500));
          
          passwordField.value = password;
          passwordField.dispatchEvent(new Event('input', { bubbles: true }));
          
          await new Promise(r => setTimeout(r, 1000));
          
          // Buscar botão de login
          const loginButton = document.querySelector('button[name="login"], button[data-testid="royal_login_button"]');
          
          if (loginButton) {
            loginButton.click();
            
            // Aguardar processamento
            setTimeout(() => {
              const stillHasLoginForm = document.querySelector('input[name="email"]');
              resolve({
                success: !stillHasLoginForm,
                message: stillHasLoginForm ? 'Login pode ter falhado' : 'Login realizado'
              });
            }, 5000);
          } else {
            // Tentar com Enter
            passwordField.focus();
            passwordField.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
            
            setTimeout(() => {
              const stillHasLoginForm = document.querySelector('input[name="email"]');
              resolve({
                success: !stillHasLoginForm,
                message: stillHasLoginForm ? 'Login pode ter falhado' : 'Login realizado'
              });
            }, 5000);
          }
          
        } catch (error) {
          resolve({
            success: false,
            error: error.message
          });
        }
      }, 2000);
    });
  }

  async injectComment(text, humanMode) {
    return new Promise((resolve) => {
      console.log('💬 Executando comentário na página...');
      
      setTimeout(async () => {
        try {
          // Buscar caixa de comentários
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
          
          // Scroll até o elemento
          commentBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(r => setTimeout(r, 500));
          
          // Click na caixa
          commentBox.click();
          await new Promise(r => setTimeout(r, 300));
          
          // Limpar e escrever
          commentBox.focus();
          document.execCommand('selectAll');
          document.execCommand('delete');
          
          if (humanMode) {
            // Escrever como humano
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
          
          // Enviar com Enter
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

  async injectMultiComment(comments, interval, randomize) {
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
          const commentResult = await window.facebookCommentExtension.injectComment(comment, true);
          
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

  // ===== FUNÇÕES AUXILIARES =====
  
  async waitForTabLoad(tabId) {
    return new Promise((resolve) => {
      const checkStatus = () => {
        chrome.tabs.get(tabId, (tab) => {
          if (tab.status === 'complete') {
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
    const tabs = await chrome.tabs.query({ url: ['*://facebook.com/*', '*://*.facebook.com/*'] });
    
    for (const tab of tabs) {
      this.facebookTabs.set(tab.id, {
        id: tab.id,
        url: tab.url,
        isLoggedIn: false,
        created: Date.now()
      });
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
    });
  }

  updateIcon(status) {
    const iconPath = {
      'connected': 'icon-green.png',
      'disconnected': 'icon-gray.png',
      'error': 'icon-red.png'
    };
    
    chrome.action.setIcon({
      path: iconPath[status] || 'icon-gray.png'
    });
  }
}

// Inicializar extensão
const extension = new FacebookCommentExtension();

// Disponibilizar globalmente para funções injetadas
window.facebookCommentExtension = extension;