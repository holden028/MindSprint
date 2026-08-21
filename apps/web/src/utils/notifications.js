export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

export async function ensureNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export function showLocalNotification(title, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
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
        });
      });
    }
  }
}
