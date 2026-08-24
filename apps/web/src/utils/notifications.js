export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

export function ensureNotificationPermission() {
  try {
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    if (Notification.permission === 'denied') return Promise.resolve('denied');
    return Notification.requestPermission();
  } catch {
    return Promise.resolve('unsupported');
  }
}

export function showLocalNotification(title, options = {}) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification(title, {
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      ...options
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (err) {
    // Safari sometimes requires service worker showNotification
    if (navigator.serviceWorker?.ready) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          icon: '/icons/icon-192.svg',
          badge: '/icons/icon-192.svg',
          ...options
        }).catch(() => {});
      }).catch(() => {});
    }
  }
}
