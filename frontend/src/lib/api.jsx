import axios from 'axios';

const API = 'https://api.toonweaver.space/api';
const api = axios.create({
    baseURL: API,
    withCredentials: true,
});

// ============== PROJECTS ==============
export const getProjects = () => api.get('/projects');
export const getProject = (id) => api.get(`/projects/${id}`);
export const createProject = (data) => api.post('/projects', data);
export const updateProject = (id, data) => api.put(`/projects/${id}`, data);
export const deleteProject = (id) => api.delete(`/projects/${id}`);
export const addTeamMember = (projectId, data) => api.post(`/projects/${projectId}/team`, data);
export const removeTeamMember = (projectId, memberId) => api.delete(`/projects/${projectId}/team/${memberId}`);

// ============== EPISODES ==============
export const getEpisodes = (projectId) => api.get(`/projects/${projectId}/episodes`);
export const getEpisode = (projectId, episodeId) => api.get(`/projects/${projectId}/episodes/${episodeId}`);
export const createEpisode = (projectId, data) => api.post(`/projects/${projectId}/episodes`, data);
export const updateEpisode = (projectId, episodeId, data) => api.put(`/projects/${projectId}/episodes/${episodeId}`, data);
export const deleteEpisode = (projectId, episodeId) => api.delete(`/projects/${projectId}/episodes/${episodeId}`);

// ============== SHOTS ==============
// Shots under episodes
export const getShots = (projectId, episodeId, status) =>
    api.get(`/projects/${projectId}/episodes/${episodeId}/shots`, { params: { status } });
export const getShot = (projectId, episodeId, shotId) =>
    api.get(`/projects/${projectId}/episodes/${episodeId}/shots/${shotId}`);
export const createShot = (projectId, episodeId, data) =>
    api.post(`/projects/${projectId}/episodes/${episodeId}/shots`, data);
export const updateShot = (projectId, episodeId, shotId, data) =>
    api.put(`/projects/${projectId}/episodes/${episodeId}/shots/${shotId}`, data);
export const deleteShot = (projectId, episodeId, shotId) =>
    api.delete(`/projects/${projectId}/episodes/${episodeId}/shots/${shotId}`);
export const addFileLink = (projectId, episodeId, shotId, data) =>
    api.post(`/projects/${projectId}/episodes/${episodeId}/shots/${shotId}/files`, data);

// All shots for a project (across all episodes)
export const getAllProjectShots = (projectId, status) =>
    api.get(`/projects/${projectId}/shots`, { params: { status } });

// Shots assigned to current user
export const getAssignedShots = () => api.get('/shots/assigned');

// ============== FEEDBACK ==============
export const getFeedback = (projectId, episodeId, shotId) =>
    api.get(`/projects/${projectId}/episodes/${episodeId}/shots/${shotId}/feedback`);
export const createFeedback = (projectId, episodeId, shotId, data) =>
    api.post(`/projects/${projectId}/episodes/${episodeId}/shots/${shotId}/feedback`, data);

// ============== USERS ==============
export const getUsers = () => api.get('/users');
export const getUser = (id) => api.get(`/users/${id}`);
export const createUser = (data) => api.post('/auth/register', data);
export const updateUserRole = (id, role) => api.put(`/users/${id}/role`, null, { params: { role } });
export const deleteUser = (id) => api.delete(`/users/${id}`);

// ============== NOTIFICATIONS ==============
export const getNotifications = () => api.get('/notifications');
export const markNotificationRead = (id) => api.put(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.put('/notifications/read-all');

// ============== ACTIVITY ==============
export const getActivityLog = (projectId) => api.get(`/projects/${projectId}/activity`);

// ============== STATS ==============
export const getDashboardStats = () => api.get('/stats/dashboard');

// ============== DRIVE MAPPER ==============
export const getDriveMapperUrl = (projectId) => `${API}/projects/${projectId}/drive-mapper`;

export default api;
