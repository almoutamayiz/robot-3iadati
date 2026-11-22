export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export interface AppNotificationItem {
  id: string;
  title: string;
  body: string;
  category: 'waiting' | 'message' | 'alert' | 'system';
  timestamp: string;
}

let swRegistration: ServiceWorkerRegistration | null = null;

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    return swRegistration;
  } catch {
    return null;
  }
}

export async function requestAppNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  await registerNotificationServiceWorker();
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export function playNotificationChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    };

    playTone(587.33, now, 0.14); // D5
    playTone(880.0, now + 0.12, 0.22); // A5
  } catch {
    // Ignore autoplay restriction errors
  }
}

export async function dispatchSystemNotification(options: {
  title: string;
  body: string;
  tag?: string;
  playSound?: boolean;
}): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }

  if (options.playSound !== false) {
    playNotificationChime();
  }

  const notifOptions: NotificationOptions = {
    body: options.body,
    tag: options.tag || `3iadati_${Date.now()}`,
    dir: 'rtl',
    lang: 'ar',
    renotify: true,
  } as NotificationOptions;

  try {
    const reg =
      swRegistration ||
      (navigator.serviceWorker ? await navigator.serviceWorker.getRegistration('/sw.js') : null);
    if (reg && typeof reg.showNotification === 'function') {
      await reg.showNotification(options.title, notifOptions);
      return true;
    }
  } catch {
    // Fallback to direct Notification constructor
  }

  try {
    const n = new Notification(options.title, notifOptions);
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
