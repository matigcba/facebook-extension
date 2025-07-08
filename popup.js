document.addEventListener('DOMContentLoaded', () => {
  checkStatus();
});

async function checkStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
    
    // Actualizar estado de conexión
    document.getElementById('connection-status').textContent = 
      response.connected ? 'Conectado' : 'Desconectado';
    document.getElementById('connection-status').className = 
      response.connected ? 'connected' : 'disconnected';
    
    // Mostrar lista de tabs
    const tabsList = document.getElementById('tabs-list');
    tabsList.innerHTML = '';
    
    if (response.tabs && response.tabs.length > 0) {
      response.tabs.forEach(tab => {
        const item = document.createElement('div');
        item.className = `tab-list-item ${tab.isLoggedIn ? 'logged-in' : ''}`;
        item.innerHTML = `
          <span>Tab ${tab.id} - ${tab.profile}</span>
          <span>${tab.isLoggedIn ? '✅' : '❌'}</span>
        `;
        tabsList.appendChild(item);
      });
    } else {
      tabsList.innerHTML = '<p>Nenhuma aba ativa</p>';
    }
    
  } catch (error) {
    console.error('Erro verificando status:', error);
  }
}