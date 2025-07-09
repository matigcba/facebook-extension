// ===== CONTENT.JS - Script para páginas do Facebook =====
console.log('📄 Facebook Comment Tool - Content Script carregado');

// Responder a pings de la aplicación
window.addEventListener('facebook-tool-ping', () => {
  console.log('🏓 Ping recibido, enviando pong...');
  window.dispatchEvent(new CustomEvent('facebook-tool-pong'));
});

// Notificar que el content script está listo
window.dispatchEvent(new CustomEvent('facebook-tool-ready'));

window.addEventListener('facebook-tool-token', async (event) => {
  console.log('🔐 Token recibido en content script');
  console.log('📦 Event detail:', event.detail);

  const { token } = event.detail;

  if (token) {
    try {
      console.log('💾 Guardando token en storage...');
      await chrome.storage.local.set({ userToken: token });
      console.log('✅ Token guardado en storage');

      console.log('📤 Enviando token al background script...');
      chrome.runtime.sendMessage({
        action: 'setToken',
        token: token
      }, (response) => {
        console.log('📨 Respuesta del background:', response);

        if (chrome.runtime.lastError) {
          console.error('❌ Error comunicando con background:', chrome.runtime.lastError);
          window.dispatchEvent(new CustomEvent('facebook-tool-token-received', {
            detail: { success: false, error: chrome.runtime.lastError.message }
          }));
          return;
        }

        if (response && response.success) {
          console.log('✅ Token registrado exitosamente');
          console.log('👤 Usuario ID:', response.userId);

          window.dispatchEvent(new CustomEvent('facebook-tool-token-received', {
            detail: {
              success: true,
              userId: response.userId
            }
          }));
        } else {
          console.error('❌ Error registrando token:', response);
          window.dispatchEvent(new CustomEvent('facebook-tool-token-received', {
            detail: { success: false, error: 'Error al registrar token' }
          }));
        }
      });
    } catch (error) {
      console.error('❌ Error guardando token:', error);
    }
  } else {
    console.error('❌ No se recibió token en el evento');
  }
});

// Escuchar evento de logout
window.addEventListener('facebook-tool-logout', async (event) => {
  console.log('🚪 Logout solicitado');

  try {
    // Limpiar token del storage
    await chrome.storage.local.remove(['userToken']);

    // Notificar al background script
    chrome.runtime.sendMessage({
      action: 'logout'
    }, (response) => {
      if (response && response.success) {
        console.log('✅ Logout exitoso');
      }
    });
  } catch (error) {
    console.error('❌ Error durante logout:', error);
  }
});

// Verificar si ya hay un token guardado al cargar la página
(async () => {
  try {
    const stored = await chrome.storage.local.get(['userToken']);
    if (stored.userToken) {
      console.log('🔑 Token encontrado en storage, verificando estado...');
      
      // Primero verificar si ya estamos registrados
      chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
        if (response && response.registered && response.userId) {
          console.log('✅ Ya registrado como usuario:', response.userId);
          // No re-enviar el token si ya estamos registrados
        } else {
          console.log('⚠️ No registrado, enviando token...');
          chrome.runtime.sendMessage({
            action: 'setToken',
            token: stored.userToken
          }, (response) => {
            if (response && response.success) {
              console.log('✅ Extensión registrada automáticamente');
              console.log('👤 Usuario ID:', response.userId);
            }
          });
        }
      });
    } else {
      console.log('⚠️ No hay token guardado, esperando autenticación...');
    }
  } catch (error) {
    console.error('Error verificando token:', error);
  }
})();

// Adicionar estilos para indicador visual
const style = document.createElement('style');
style.textContent = `
  .facebook-comment-tool-indicator {
    position: fixed;
    top: 10px;
    right: 10px;
    background: #4267B2;
    color: white;
    padding: 5px 10px;
    border-radius: 5px;
    font-size: 12px;
    z-index: 9999;
    font-family: Arial, sans-serif;
    cursor: pointer;
    transition: all 0.3s ease;
  }
  
  .facebook-comment-tool-indicator:hover {
    background: #365899;
    transform: scale(1.05);
  }
  
  .facebook-comment-tool-indicator.authenticated {
    background: #42b983;
  }
  
  .facebook-comment-tool-indicator.error {
    background: #f44336;
  }
`;
document.head.appendChild(style);

// Crear indicador visual mejorado
let indicator = null;

function createIndicator(status = 'loading', userId = null) {
  if (indicator) {
    indicator.remove();
  }

  indicator = document.createElement('div');
  indicator.className = 'facebook-comment-tool-indicator';

  switch (status) {
    case 'authenticated':
      indicator.textContent = `🤖 Tool Ativo - User: ${userId}`;
      indicator.classList.add('authenticated');
      break;
    case 'waiting':
      indicator.textContent = '🤖 Aguardando autenticação...';
      break;
    case 'error':
      indicator.textContent = '❌ Erro de conexão';
      indicator.classList.add('error');
      break;
    default:
      indicator.textContent = '🤖 Comment Tool';
  }

  // Click para verificar status
  indicator.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
      if (response) {
        console.log('📊 Status da extensão:', response);
        alert(`Facebook Comment Tool Status:
- Conectado: ${response.connected ? 'Sim' : 'Não'}
- Registrado: ${response.registered ? 'Sim' : 'Não'}
- Usuario ID: ${response.userId || 'N/A'}
- Tabs ativas: ${response.facebookTabs || 0}`);
      }
    });
  });

  document.body.appendChild(indicator);
}

// Verificar status inicial
chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
  if (response && response.registered) {
    createIndicator('authenticated', response.userId);
  } else {
    createIndicator('waiting');
  }
});

// Remover indicador após 10 segundos
setTimeout(() => {
  if (indicator && indicator.parentNode) {
    indicator.style.opacity = '0.3';
    indicator.style.fontSize = '10px';
    indicator.style.padding = '3px 6px';
  }
}, 10000);

// Listener para mensajes del background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateStatus') {
    if (request.registered) {
      createIndicator('authenticated', request.userId);
    } else {
      createIndicator('waiting');
    }
  }
  return true;
});

console.log('✅ Content script carregado e pronto para receber comandos');