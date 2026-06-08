import axios from 'axios';
import { API_BASE_URL } from "@/lib/config";

export const api = axios.create({
  baseURL: API_BASE_URL,
});

// Interceptor for JWT later on when Auth is enabled again
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
