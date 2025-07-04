// ===== CONTENT.JS =====
// Script que roda nas páginas do Facebook
console.log('📄 Facebook Comment Tool - Content Script carregado');

// Adicionar estilos para indicar que a extensão está ativa
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
  }
`;
document.head.appendChild(style);

// Adicionar indicador visual
const indicator = document.createElement('div');
indicator.className = 'facebook-comment-tool-indicator';
indicator.textContent = '🤖 Comment Tool Ativo';
document.body.appendChild(indicator);

// Remover indicador após alguns segundos
setTimeout(() => {
  if (indicator.parentNode) {
    indicator.parentNode.removeChild(indicator);
  }
}, 3000);