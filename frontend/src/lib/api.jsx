import axios from 'axios';

const API = `${import.meta.env.VITE_BACKEND_URL}/api`;

const api = axios.create({
    baseURL: API,
    withCredentials: true,
});

// Projects
export const getProjects = () => api.get('/projects');
export const getProject = (id) => api.get(`/projects/${id}`);
export const createProject = (data) => api.post('/projects', data);
export const updateProject = (id, data) => api.put(`/projects/${id}`, data);
export const deleteProject = (id) => api.delete(`/projects/${id}`);
export const addTeamMember = (projectId, data) => api.post(`/projects/${projectId}/team`, data);
export const removeTeamMember = (projectId, memberId) => api.delete(`/projects/${projectId}/team/${memberId}`);

// Shots
export const getShots = (projectId, status) => api.get(`/projects/${projectId}/shots`, { params: { status } });
export const getShot = (projectId, shotId) => api.get(`/projects/${projectId}/shots/${shotId}`);
export const createShot = (projectId, data) => api.post(`/projects/${projectId}/shots`, data);
export const updateShot = (projectId, shotId, data) => api.put(`/projects/${projectId}/shots/${shotId}`, data);
export const deleteShot = (projectId, shotId) => api.delete(`/projects/${projectId}/shots/${shotId}`);
export const addFileLink = (projectId, shotId, data) => api.post(`/projects/${projectId}/shots/${shotId}/files`, data);
export const getAssignedShots = () => api.get('/shots/assigned');

// Feedback
export const getFeedback = (projectId, shotId) => api.get(`/projects/${projectId}/shots/${shotId}/feedback`);
export const createFeedback = (projectId, shotId, data) => api.post(`/projects/${projectId}/shots/${shotId}/feedback`, data);

// Users
export const getUsers = () => api.get('/users');
export const getUser = (id) => api.get(`/users/${id}`);
export const updateUserRole = (id, role) => api.put(`/users/${id}/role`, null, { params: { role } });

// Notifications
export const getNotifications = () => api.get('/notifications');
export const markNotificationRead = (id) => api.put(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.put('/notifications/read-all');

// Activity
export const getActivityLog = (projectId) => api.get(`/projects/${projectId}/activity`);

// Stats
export const getDashboardStats = () => api.get('/stats/dashboard');

// Drive mapper
export const getDriveMapperUrl = (projectId) => `${API}/projects/${projectId}/drive-mapper`;

export default api;
