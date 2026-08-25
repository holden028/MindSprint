import axios from 'axios';

/**
 * Resolve API base URL for localhost and LAN IP access.
 * If the page is opened via http://192.168.x.x:5174 but VITE_API_URL
 * points at localhost, rewrite to the same host on the API port.
 * Preserve path prefixes like `/api` (do not return origin alone).
 */
function resolveApiUrl() {
  const configured = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
  if (typeof window === 'undefined') return configured;

  try {
    const api = new URL(configured);
    const pageHost = window.location.hostname;
    const isLocalApi = api.hostname === 'localhost' || api.hostname === '127.0.0.1';
    const isRemotePage = pageHost !== 'localhost' && pageHost !== '127.0.0.1';

    if (isLocalApi && isRemotePage) {
      api.hostname = pageHost;
    }

    const path = api.pathname.replace(/\/+$/, '');
    return path && path !== '/' ? `${api.origin}${path}` : api.origin;
  } catch {
    return configured;
  }
}

const API_URL = resolveApiUrl();

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only redirect if not already on login page
      if (window.location.pathname !== '/') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('isAdmin');
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
