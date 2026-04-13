import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:8000/api/',
});

// Interceptor for JWT later on when Auth is enabled again
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
