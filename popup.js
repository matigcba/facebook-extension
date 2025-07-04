// ===== POPUP.JS =====
document.addEventListener('DOMContentLoaded', () => {
  checkStatus();
});

async function checkStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
    
    document.getElementById('connection-status').textContent = 
      response.connected ? 'Conectado' : 'Desconectado';
    document.getElementById('connection-status').className = 
      response.connected ? 'connected' : 'disconnected';
    
    document.getElementById('tab-count').textContent = response.facebookTabs;
    document.getElementById('server-status').textContent = 
      response.connected ? 'Conectado' : 'Desconectado';
      
  } catch (error) {
    console.error('Erro verificando status:', error);
  }
}

async function openFacebook() {
  try {
    await chrome.tabs.create({ url: 'https://facebook.com' });
    setTimeout(checkStatus, 1000);
  } catch (error) {
    console.error('Erro abrindo Facebook:', error);
  }
}