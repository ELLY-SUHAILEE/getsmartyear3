document.addEventListener('DOMContentLoaded', () => {
  // If already logged in, redirect straight to dashboard
  if (sessionStorage.getItem('seqs_logged_in') === 'true') {
    window.location.href = 'dashboard.html';
    return;
  }

  const loginForm = document.getElementById('loginForm');
  const loginCard = document.querySelector('.login-card');

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();

    if (user === 'admin' && pass === 'admin123') {
      showToast('Login successful! Redirecting...', 'success');
      sessionStorage.setItem('seqs_logged_in', 'true');
      sessionStorage.setItem('seqs_user', user);
      
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1000);
    } else {
      showToast('Invalid Username or Password', 'error');
      loginCard.classList.remove('shake');
      void loginCard.offsetWidth; // Trigger reflow
      loginCard.classList.add('shake');
    }
  });

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconClass = 'fa-circle-info';
    if (type === 'error') iconClass = 'fa-circle-exclamation';
    if (type === 'success') iconClass = 'fa-circle-check';

    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
});