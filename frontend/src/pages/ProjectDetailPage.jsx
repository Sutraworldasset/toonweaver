import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    getProject,
    getEpisodes,
    createEpisode,
    deleteEpisode,
    getShots,
    createShot,
    deleteShot,
    updateShot,
    getUsers,
    addTeamMember,
    removeTeamMember,
    getActivityLog,
    getDriveMapperUrl,
    updateProject,
} from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '../components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../components/ui/table';
import {
    ArrowLeft,
    Plus,
    Trash2,
    Users,
    Clapperboard,
    Download,
    ExternalLink,
    Clock,
    Search,
    Filter,
    UserPlus,
    X,
    ChevronDown,
    ChevronRight,
    Film,
    Settings,
    Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

// Default statuses — always available
const DEFAULT_STATUSES = [
    { value: 'yts', label: 'YTS', color: '#71717a' },
    { value: 'in_progress', label: 'In Progress', color: '#3b82f6' },
    { value: 'uploaded', label: 'Uploaded', color: '#a855f7' },
    { value: 'internal_review', label: 'Internal Review', color: '#f59e0b' },
    { value: 'retake', label: 'Retake', color: '#ef4444' },
    { value: 'hold', label: 'Hold', color: '#f97316' },
    { value: 'approved', label: 'Approved', color: '#22c55e' },
];

const COMPLEXITY_COLORS = { A: '#22c55e', B: '#f59e0b', C: '#ef4444' };

function StatusBadgeCustom({ status, statuses }) {
    const found = statuses.find(s => s.value === status);
    if (!found) return <span className="text-zinc-500 text-xs">{status}</span>;
    return (
        <span
            className="px-2 py-1 rounded text-xs font-medium"
            style={{ backgroundColor: found.color + '22', color: found.color, border: `1px solid ${found.color}44` }}
        >
            {found.label}
        </span>
    );
}

export default function ProjectDetailPage() {
    const { projectId } = useParams();
    const { isClient, isProductionManager, isSupervisor, canAssignShots, user } = useAuth();
    const canManageProjects = isClient || isProductionManager;
    const canManageShots = isClient || isProductionManager;
    const navigate = useNavigate();

    const [project, setProject] = useState(null);
    const [episodes, setEpisodes] = useState([]);
    const [expandedEpisodes, setExpandedEpisodes] = useState({});
    const [episodeShots, setEpisodeShots] = useState({});
    const [allUsers, setAllUsers] = useState([]);
    const [activityLog, setActivityLog] = useState([]);
    const [loading, setLoading] = useState(true);

    // Custom statuses per project
    const [customStatuses, setCustomStatuses] = useState([]);
    const allStatuses = [...DEFAULT_STATUSES, ...customStatuses];

    // Dialogs
    const [createEpisodeOpen, setCreateEpisodeOpen] = useState(false);
    const [createShotOpen, setCreateShotOpen] = useState(false);
    const [selectedEpisodeId, setSelectedEpisodeId] = useState(null);
    const [addMemberOpen, setAddMemberOpen] = useState(false);
    const [statusManagerOpen, setStatusManagerOpen] = useState(false);
    const [creating, setCreating] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const [episodeForm, setEpisodeForm] = useState({ episode_number: '', title: '', description: '' });
    const [shotForm, setShotForm] = useState({
        shot_number: '',
        description: '',
        complexity: '',
        frames: '',
        approved_layout_version: '',
        deadline: null,
    });
    const [memberForm, setMemberForm] = useState({ user_id: '', role: 'artist' });

    // New custom status form
    const [newStatus, setNewStatus] = useState({ label: '', color: '#6366f1' });

    useEffect(() => {
        loadData();
    }, [projectId]);

    const loadData = async () => {
        try {
            const [projectRes, episodesRes] = await Promise.all([
                getProject(projectId),
                getEpisodes(projectId),
            ]);
            setProject(projectRes.data);
            setEpisodes(episodesRes.data || []);

            // Load custom statuses from project settings
            if (projectRes.data?.custom_statuses) {
                setCustomStatuses(projectRes.data.custom_statuses);
            }

            if (canManageProjects || isSupervisor || canAssignShots) {
                const [usersRes, activityRes] = await Promise.all([
                    getUsers(),
                    getActivityLog(projectId),
                ]);
                setAllUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
                setActivityLog(Array.isArray(activityRes.data) ? activityRes.data : []);
            }
        } catch (error) {
            toast.error('Failed to load project');
            navigate('/projects');
        } finally {
            setLoading(false);
        }
    };

    const loadEpisodeShots = async (episodeId) => {
        try {
            const res = await getShots(projectId, episodeId);
            setEpisodeShots(prev => ({ ...prev, [episodeId]: Array.isArray(res.data) ? res.data : [] }));
        } catch {
            toast.error('Failed to load shots');
        }
    };

    const toggleEpisode = async (episodeId) => {
        const isExpanded = expandedEpisodes[episodeId];
        setExpandedEpisodes(prev => ({ ...prev, [episodeId]: !isExpanded }));
        if (!isExpanded && !episodeShots[episodeId]) {
            await loadEpisodeShots(episodeId);
        }
    };

    // ============ EPISODE HANDLERS ============
    const handleCreateEpisode = async (e) => {
        e.preventDefault();
        if (!episodeForm.episode_number) {
            toast.error('Please enter an episode number');
            return;
        }
        setCreating(true);
        try {
            await createEpisode(projectId, {
                episode_number: parseInt(episodeForm.episode_number),
                title: episodeForm.title,
                description: episodeForm.description,
            });
            toast.success('Episode created');
            setCreateEpisodeOpen(false);
            setEpisodeForm({ episode_number: '', title: '', description: '' });
            loadData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to create episode');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteEpisode = async (episodeId) => {
        if (!window.confirm('Delete this episode and all its shots?')) return;
        try {
            await deleteEpisode(projectId, episodeId);
            toast.success('Episode deleted');
            loadData();
        } catch {
            toast.error('Failed to delete episode');
        }
    };

    // ============ SHOT HANDLERS ============
    const handleOpenCreateShot = (episodeId) => {
        setSelectedEpisodeId(episodeId);
        setCreateShotOpen(true);
    };

    const handleCreateShot = async (e) => {
        e.preventDefault();
        if (!shotForm.shot_number.trim()) {
            toast.error('Please enter a shot number');
            return;
        }
        setCreating(true);
        try {
            await createShot(projectId, selectedEpisodeId, {
                shot_number: shotForm.shot_number,
                description: shotForm.description,
                complexity: shotForm.complexity || null,
                frames: shotForm.frames ? parseInt(shotForm.frames) : null,
                approved_layout_version: shotForm.approved_layout_version,
                deadline: shotForm.deadline,
            });
            toast.success('Shot created');
            setCreateShotOpen(false);
            setShotForm({ shot_number: '', description: '', complexity: '', frames: '', approved_layout_version: '', deadline: null });
            loadEpisodeShots(selectedEpisodeId);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to create shot');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteShot = async (episodeId, shotId) => {
        if (!window.confirm('Delete this shot?')) return;
        try {
            await deleteShot(projectId, episodeId, shotId);
            toast.success('Shot deleted');
            loadEpisodeShots(episodeId);
        } catch {
            toast.error('Failed to delete shot');
        }
    };

    const handleAssignShot = async (episodeId, shotId, userId) => {
        try {
            await updateShot(projectId, episodeId, shotId, { assigned_to: userId || null });
            toast.success('Assignment updated');
            loadEpisodeShots(episodeId);
        } catch {
            toast.error('Failed to update assignment');
        }
    };

    const handleStatusChange = async (episodeId, shotId, status) => {
        try {
            await updateShot(projectId, episodeId, shotId, { status });
            toast.success('Status updated');
            loadEpisodeShots(episodeId);
        } catch {
            toast.error('Failed to update status');
        }
    };

    // ============ TEAM HANDLERS ============
    const handleAddMember = async (e) => {
        e.preventDefault();
        if (!memberForm.user_id) {
            toast.error('Please select a user');
            return;
        }
        try {
            await addTeamMember(projectId, memberForm);
            toast.success('Team member added');
            setAddMemberOpen(false);
            setMemberForm({ user_id: '', role: 'artist' });
            loadData();
        } catch {
            toast.error('Failed to add team member');
        }
    };

    const handleRemoveMember = async (userId) => {
        if (!window.confirm('Remove this team member?')) return;
        try {
            await removeTeamMember(projectId, userId);
            toast.success('Team member removed');
            loadData();
        } catch {
            toast.error('Failed to remove team member');
        }
    };

    // ============ CUSTOM STATUS HANDLERS ============
    const handleAddCustomStatus = async () => {
        if (!newStatus.label.trim()) {
            toast.error('Please enter a status label');
            return;
        }
        const value = newStatus.label.toLowerCase().replace(/\s+/g, '_');
        if (allStatuses.find(s => s.value === value)) {
            toast.error('Status already exists');
            return;
        }
        const updated = [...customStatuses, { value, label: newStatus.label, color: newStatus.color }];
        setCustomStatuses(updated);
        setNewStatus({ label: '', color: '#6366f1' });
        await saveCustomStatuses(updated);
    };

    const handleRemoveCustomStatus = async (value) => {
        const updated = customStatuses.filter(s => s.value !== value);
        setCustomStatuses(updated);
        await saveCustomStatuses(updated);
    };

    const handleRemoveDefaultStatus = async (value) => {
        // Store removed defaults in project settings
        const removedDefaults = project?.removed_statuses || [];
        if (removedDefaults.includes(value)) return;
        const updated = [...removedDefaults, value];
        try {
            await updateProject(projectId, { removed_statuses: updated });
            setProject(prev => ({ ...prev, removed_statuses: updated }));
            toast.success('Status removed');
        } catch {
            toast.error('Failed to remove status');
        }
    };

    const saveCustomStatuses = async (statuses) => {
        try {
            await updateProject(projectId, { custom_statuses: statuses });
            toast.success('Statuses saved');
        } catch {
            toast.error('Failed to save statuses');
        }
    };

    // Filter out removed defaults
    const removedDefaults = project?.removed_statuses || [];
    const activeStatuses = allStatuses.filter(s => !removedDefaults.includes(s.value));

    // Artists on team
    const teamArtists = allUsers.filter(u =>
        project?.team_members?.some(m => m.user_id === u.id)
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!project) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/projects')} className="text-zinc-400 hover:text-zinc-100">
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold text-zinc-50 font-['Chivo']">{project.name}</h1>
                        <span className="px-2 py-1 rounded bg-zinc-800 text-zinc-400 text-xs flex items-center gap-1">
                            <Film className="w-3 h-3" />
                            {project.fps || 25} fps
                        </span>
                    </div>
                    <p className="text-zinc-400 mt-1">{project.description || 'No description'}</p>
                </div>
                <Button variant="outline" onClick={() => window.open(getDriveMapperUrl(projectId), '_blank')} className="border-zinc-700 text-zinc-300">
                    <Download className="w-4 h-4 mr-2" />
                    Download .bat
                </Button>
            </div>

            {/* Drive Links */}
            {project.drive_links?.length > 0 && (
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex flex-wrap gap-2">
                            {project.drive_links.map((link, index) => (
                                <Button key={index} variant="outline" size="sm"
                                    onClick={() => window.open(link.url, '_blank')}
                                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                                    <ExternalLink className="w-3 h-3 mr-2" />
                                    {link.name}
                                </Button>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Tabs */}
            <Tabs defaultValue="shots" className="space-y-6">
                <TabsList className="bg-zinc-900 border border-zinc-800">
                    <TabsTrigger value="shots" className="data-[state=active]:bg-zinc-800">
                        <Clapperboard className="w-4 h-4 mr-2" />
                        Episodes & Shots
                    </TabsTrigger>
                    {(canManageProjects || isSupervisor) && (
                        <>
                            <TabsTrigger value="team" className="data-[state=active]:bg-zinc-800">
                                <Users className="w-4 h-4 mr-2" />
                                Team
                            </TabsTrigger>
                            <TabsTrigger value="activity" className="data-[state=active]:bg-zinc-800">
                                <Clock className="w-4 h-4 mr-2" />
                                Activity
                            </TabsTrigger>
                        </>
                    )}
                    {isClient && (
                        <TabsTrigger value="settings" className="data-[state=active]:bg-zinc-800">
                            <Settings className="w-4 h-4 mr-2" />
                            Settings
                        </TabsTrigger>
                    )}
                </TabsList>

                {/* Episodes & Shots Tab */}
                <TabsContent value="shots" className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <Input
                                placeholder="Search shots..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 bg-zinc-900 border-zinc-800 text-zinc-100"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-44 bg-zinc-900 border-zinc-800">
                                <Filter className="w-4 h-4 mr-2" />
                                <SelectValue placeholder="Filter status" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                                <SelectItem value="all">All Statuses</SelectItem>
                                {activeStatuses.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {canManageProjects && (
                            <Dialog open={createEpisodeOpen} onOpenChange={setCreateEpisodeOpen}>
                                <DialogTrigger asChild>
                                    <Button className="bg-blue-600 hover:bg-blue-500">
                                        <Plus className="w-4 h-4 mr-2" />
                                        New Episode
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-zinc-900 border-zinc-800">
                                    <DialogHeader>
                                        <DialogTitle className="text-zinc-100">Create Episode</DialogTitle>
                                    </DialogHeader>
                                    <form onSubmit={handleCreateEpisode} className="space-y-4 mt-4">
                                        <div className="space-y-2">
                                            <Label className="text-zinc-300">Episode Number *</Label>
                                            <Input
                                                type="number"
                                                value={episodeForm.episode_number}
                                                onChange={(e) => setEpisodeForm({ ...episodeForm, episode_number: e.target.value })}
                                                placeholder="e.g. 1"
                                                className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                            />
                                            <p className="text-xs text-zinc-500">Will be formatted as ep001, ep002 etc.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-zinc-300">Title</Label>
                                            <Input
                                                value={episodeForm.title}
                                                onChange={(e) => setEpisodeForm({ ...episodeForm, title: e.target.value })}
                                                placeholder="Episode title (optional)"
                                                className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-zinc-300">Description</Label>
                                            <Textarea
                                                value={episodeForm.description}
                                                onChange={(e) => setEpisodeForm({ ...episodeForm, description: e.target.value })}
                                                placeholder="Episode description (optional)"
                                                className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                                rows={2}
                                            />
                                        </div>
                                        <div className="flex justify-end gap-3 pt-2">
                                            <Button type="button" variant="ghost" onClick={() => setCreateEpisodeOpen(false)} className="text-zinc-400">Cancel</Button>
                                            <Button type="submit" disabled={creating} className="bg-blue-600 hover:bg-blue-500">
                                                {creating ? 'Creating...' : 'Create Episode'}
                                            </Button>
                                        </div>
                                    </form>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>

                    {/* Episodes List */}
                    {episodes.length === 0 ? (
                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardContent className="py-16 text-center">
                                <Film className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
                                <p className="text-zinc-400">No episodes yet</p>
                                {canManageProjects && (
                                    <p className="text-zinc-500 text-sm mt-2">Create an episode to start adding shots</p>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {episodes.map((episode) => {
                                const isExpanded = expandedEpisodes[episode.id];
                                const shots = episodeShots[episode.id] || [];
                                const filteredShots = shots.filter(shot => {
                                    const matchesSearch = !searchQuery ||
                                        shot.shot_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        shot.description?.toLowerCase().includes(searchQuery.toLowerCase());
                                    const matchesStatus = statusFilter === 'all' || shot.status === statusFilter;
                                    return matchesSearch && matchesStatus;
                                });

                                return (
                                    <Card key={episode.id} className="bg-zinc-900 border-zinc-800">
                                        {/* Episode Header */}
                                        <div
                                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-800/50 rounded-t-lg"
                                            onClick={() => toggleEpisode(episode.id)}
                                        >
                                            <div className="flex items-center gap-3">
                                                {isExpanded ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-blue-400 font-semibold">{episode.episode_code}</span>
                                                        <span className="text-zinc-100 font-medium">{episode.title}</span>
                                                    </div>
                                                    {episode.description && (
                                                        <p className="text-xs text-zinc-500 mt-0.5">{episode.description}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-zinc-500">{episode.shot_count || 0} shots</span>
                                                {canManageProjects && (
                                                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                        <Button size="sm" variant="ghost"
                                                            onClick={() => handleOpenCreateShot(episode.id)}
                                                            className="text-zinc-400 hover:text-blue-400 h-7 text-xs">
                                                            <Plus className="w-3 h-3 mr-1" />
                                                            Add Shot
                                                        </Button>
                                                        <Button size="icon" variant="ghost"
                                                            onClick={() => handleDeleteEpisode(episode.id)}
                                                            className="text-zinc-500 hover:text-red-400 h-7 w-7">
                                                            <Trash2 className="w-3 h-3" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Shots Table */}
                                        {isExpanded && (
                                            <CardContent className="p-0 border-t border-zinc-800">
                                                {filteredShots.length === 0 ? (
                                                    <div className="py-8 text-center text-zinc-500 text-sm">
                                                        No shots yet.{canManageProjects && ' Click "Add Shot" to create one.'}
                                                    </div>
                                                ) : (
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow className="border-zinc-800 hover:bg-transparent">
                                                                <TableHead className="text-zinc-400 text-xs">Shot ID</TableHead>
                                                                <TableHead className="text-zinc-400 text-xs">Description</TableHead>
                                                                <TableHead className="text-zinc-400 text-xs">Complexity</TableHead>
                                                                <TableHead className="text-zinc-400 text-xs">Frames</TableHead>
                                                                <TableHead className="text-zinc-400 text-xs">Duration</TableHead>
                                                                <TableHead className="text-zinc-400 text-xs">Layout Ver.</TableHead>
                                                                <TableHead className="text-zinc-400 text-xs">Artist</TableHead>
                                                                <TableHead className="text-zinc-400 text-xs">Status</TableHead>
                                                                <TableHead className="text-zinc-400 text-xs">Feedback</TableHead>
                                                                {canManageShots && <TableHead className="text-zinc-400 text-xs text-right">Actions</TableHead>}
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {filteredShots.map((shot) => (
                                                                <TableRow
                                                                    key={shot.id}
                                                                    className="border-zinc-800 hover:bg-zinc-800/30 cursor-pointer"
                                                                    onClick={() => navigate(`/projects/${projectId}/episodes/${episode.id}/shots/${shot.id}`)}
                                                                >
                                                                    <TableCell className="font-mono text-blue-300 text-xs font-semibold">{shot.shot_id}</TableCell>
                                                                    <TableCell className="text-zinc-400 text-xs max-w-32 truncate">{shot.description || '-'}</TableCell>
                                                                    <TableCell onClick={e => e.stopPropagation()}>
                                                                        {shot.complexity ? (
                                                                            <span className="px-2 py-0.5 rounded text-xs font-bold"
                                                                                style={{ color: COMPLEXITY_COLORS[shot.complexity], border: `1px solid ${COMPLEXITY_COLORS[shot.complexity]}44`, background: COMPLEXITY_COLORS[shot.complexity] + '22' }}>
                                                                                {shot.complexity}
                                                                            </span>
                                                                        ) : '-'}
                                                                    </TableCell>
                                                                    <TableCell className="text-zinc-400 text-xs">{shot.frames || '-'}</TableCell>
                                                                    <TableCell className="text-zinc-400 text-xs">
                                                                        {shot.duration_seconds ? `${shot.duration_seconds}s` : '-'}
                                                                    </TableCell>
                                                                    <TableCell className="text-zinc-400 text-xs">{shot.approved_layout_version || '-'}</TableCell>
                                                                    <TableCell onClick={e => e.stopPropagation()}>
                                                                        {canAssignShots ? (
                                                                            <Select
                                                                                value={shot.assigned_to || 'unassigned'}
                                                                                onValueChange={(v) => handleAssignShot(episode.id, shot.id, v === 'unassigned' ? null : v)}
                                                                            >
                                                                                <SelectTrigger className="w-28 h-7 bg-zinc-800 border-zinc-700 text-xs">
                                                                                    <SelectValue placeholder="Unassigned" />
                                                                                </SelectTrigger>
                                                                                <SelectContent className="bg-zinc-900 border-zinc-800">
                                                                                    <SelectItem value="unassigned">Unassigned</SelectItem>
                                                                                    {teamArtists.map((u) => (
                                                                                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        ) : (
                                                                            <span className="text-zinc-400 text-xs">{shot.assigned_to_name || 'Unassigned'}</span>
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell onClick={e => e.stopPropagation()}>
                                                                        {canAssignShots ? (
                                                                            <Select
                                                                                value={shot.status}
                                                                                onValueChange={(v) => handleStatusChange(episode.id, shot.id, v)}
                                                                            >
                                                                                <SelectTrigger className="w-36 h-7 bg-transparent border-0 p-0">
                                                                                    <StatusBadgeCustom status={shot.status} statuses={activeStatuses} />
                                                                                </SelectTrigger>
                                                                                <SelectContent className="bg-zinc-900 border-zinc-800">
                                                                                    {activeStatuses.map((s) => (
                                                                                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        ) : (
                                                                            <StatusBadgeCustom status={shot.status} statuses={activeStatuses} />
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell onClick={e => e.stopPropagation()}>
                                                                        {shot.feedback_link ? (
                                                                            <a href={shot.feedback_link} target="_blank" rel="noreferrer"
                                                                                className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1">
                                                                                <ExternalLink className="w-3 h-3" />
                                                                                Link
                                                                            </a>
                                                                        ) : '-'}
                                                                    </TableCell>
                                                                    {canManageShots && (
                                                                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                                                            <Button variant="ghost" size="icon"
                                                                                onClick={() => handleDeleteShot(episode.id, shot.id)}
                                                                                className="text-zinc-500 hover:text-red-400 h-7 w-7">
                                                                                <Trash2 className="w-3 h-3" />
                                                                            </Button>
                                                                        </TableCell>
                                                                    )}
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                )}
                                            </CardContent>
                                        )}
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>

                {/* Team Tab */}
                {(canManageProjects || isSupervisor) && (
                    <TabsContent value="team" className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-semibold text-zinc-100">Team Members</h2>
                            {canManageProjects && (
                                <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
                                    <DialogTrigger asChild>
                                        <Button className="bg-blue-600 hover:bg-blue-500">
                                            <UserPlus className="w-4 h-4 mr-2" />
                                            Add Member
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="bg-zinc-900 border-zinc-800">
                                        <DialogHeader>
                                            <DialogTitle className="text-zinc-100">Add Team Member</DialogTitle>
                                        </DialogHeader>
                                        <form onSubmit={handleAddMember} className="space-y-4 mt-4">
                                            <div className="space-y-2">
                                                <Label className="text-zinc-300">Select User</Label>
                                                <Select value={memberForm.user_id} onValueChange={(v) => setMemberForm({ ...memberForm, user_id: v })}>
                                                    <SelectTrigger className="bg-zinc-950 border-zinc-800">
                                                        <SelectValue placeholder="Select a user" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-zinc-900 border-zinc-800">
                                                        {allUsers.filter(u => !project.team_members?.some(m => m.user_id === u.id)).map((u) => (
                                                            <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-zinc-300">Role</Label>
                                                <Select value={memberForm.role} onValueChange={(v) => setMemberForm({ ...memberForm, role: v })}>
                                                    <SelectTrigger className="bg-zinc-950 border-zinc-800">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-zinc-900 border-zinc-800">
                                                        <SelectItem value="production_manager">Production Manager</SelectItem>
                                                        <SelectItem value="supervisor">Supervisor</SelectItem>
                                                        <SelectItem value="artist">Artist</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex justify-end gap-3 pt-2">
                                                <Button type="button" variant="ghost" onClick={() => setAddMemberOpen(false)} className="text-zinc-400">Cancel</Button>
                                                <Button type="submit" className="bg-blue-600 hover:bg-blue-500">Add Member</Button>
                                            </div>
                                        </form>
                                    </DialogContent>
                                </Dialog>
                            )}
                        </div>
                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-zinc-800 hover:bg-transparent">
                                            <TableHead className="text-zinc-400">Name</TableHead>
                                            <TableHead className="text-zinc-400">Email</TableHead>
                                            <TableHead className="text-zinc-400">Role</TableHead>
                                            {canManageProjects && <TableHead className="text-zinc-400 text-right">Actions</TableHead>}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {project.team_members?.map((member) => {
                                            const memberUser = allUsers.find(u => u.id === member.user_id);
                                            return (
                                                <TableRow key={member.user_id} className="border-zinc-800">
                                                    <TableCell className="font-medium text-zinc-100">{memberUser?.name || 'Unknown'}</TableCell>
                                                    <TableCell className="text-zinc-400">{memberUser?.email}</TableCell>
                                                    <TableCell>
                                                        <span className="capitalize text-zinc-300">{member.role.replace('_', ' ')}</span>
                                                    </TableCell>
                                                    {canManageProjects && (
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="icon"
                                                                onClick={() => handleRemoveMember(member.user_id)}
                                                                className="text-zinc-500 hover:text-red-400">
                                                                <X className="w-4 h-4" />
                                                            </Button>
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {/* Activity Tab */}
                {(canManageProjects || isSupervisor) && (
                    <TabsContent value="activity" className="space-y-4">
                        <h2 className="text-xl font-semibold text-zinc-100">Activity Log</h2>
                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardContent className="p-4">
                                {activityLog.length === 0 ? (
                                    <p className="text-center text-zinc-500 py-8">No activity yet</p>
                                ) : (
                                    <div className="space-y-4">
                                        {activityLog.map((log) => (
                                            <div key={log.id} className="flex items-start gap-4 pb-4 border-b border-zinc-800 last:border-0">
                                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400">
                                                    {log.user_name?.charAt(0).toUpperCase() || '?'}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm text-zinc-200">
                                                        <span className="font-medium">{log.user_name}</span>{' '}
                                                        <span className="text-zinc-400">{log.action.replace(/_/g, ' ')}</span>
                                                    </p>
                                                    {log.details && <p className="text-xs text-zinc-500 mt-1">{log.details}</p>}
                                                </div>
                                                <span className="text-xs text-zinc-500">
                                                    {format(new Date(log.timestamp), 'MMM d, HH:mm')}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {/* Settings Tab — Client only */}
                {isClient && (
                    <TabsContent value="settings" className="space-y-6">
                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-zinc-100 flex items-center gap-2">
                                    <Tag className="w-5 h-5" />
                                    Shot Status Management
                                </CardTitle>
                                <p className="text-zinc-400 text-sm">Add custom statuses or remove ones you don't need for this project.</p>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {/* Default Statuses */}
                                <div>
                                    <Label className="text-zinc-300 mb-3 block">Default Statuses</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {DEFAULT_STATUSES.map((status) => {
                                            const isRemoved = removedDefaults.includes(status.value);
                                            return (
                                                <div key={status.value} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${isRemoved ? 'opacity-40 border-zinc-700' : 'border-zinc-600'}`}>
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: status.color }} />
                                                    <span className="text-sm text-zinc-200">{status.label}</span>
                                                    <button
                                                        onClick={() => isRemoved
                                                            ? updateProject(projectId, { removed_statuses: removedDefaults.filter(v => v !== status.value) }).then(() => setProject(prev => ({ ...prev, removed_statuses: removedDefaults.filter(v => v !== status.value) })))
                                                            : handleRemoveDefaultStatus(status.value)
                                                        }
                                                        className={`text-xs ml-1 ${isRemoved ? 'text-green-400 hover:text-green-300' : 'text-zinc-500 hover:text-red-400'}`}
                                                    >
                                                        {isRemoved ? '+ Restore' : '× Remove'}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Custom Statuses */}
                                <div>
                                    <Label className="text-zinc-300 mb-3 block">Custom Statuses</Label>
                                    {customStatuses.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {customStatuses.map((status) => (
                                                <div key={status.value} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-600">
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: status.color }} />
                                                    <span className="text-sm text-zinc-200">{status.label}</span>
                                                    <button onClick={() => handleRemoveCustomStatus(status.value)} className="text-xs text-zinc-500 hover:text-red-400 ml-1">× Remove</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add new custom status */}
                                    <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/30 border border-zinc-700">
                                        <input
                                            type="color"
                                            value={newStatus.color}
                                            onChange={(e) => setNewStatus({ ...newStatus, color: e.target.value })}
                                            className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                                        />
                                        <Input
                                            value={newStatus.label}
                                            onChange={(e) => setNewStatus({ ...newStatus, label: e.target.value })}
                                            placeholder="Status name (e.g. Client Retake)"
                                            className="flex-1 bg-zinc-900 border-zinc-700 text-zinc-100"
                                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCustomStatus())}
                                        />
                                        <Button onClick={handleAddCustomStatus} className="bg-blue-600 hover:bg-blue-500">
                                            <Plus className="w-4 h-4 mr-1" />
                                            Add
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}
            </Tabs>

            {/* Create Shot Dialog */}
            <Dialog open={createShotOpen} onOpenChange={setCreateShotOpen}>
                <DialogContent className="bg-zinc-900 border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="text-zinc-100">Add Shot</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateShot} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Shot Number *</Label>
                            <Input
                                value={shotForm.shot_number}
                                onChange={(e) => setShotForm({ ...shotForm, shot_number: e.target.value })}
                                placeholder="e.g. sh0102"
                                className="bg-zinc-950 border-zinc-800 text-zinc-100"
                            />
                            <p className="text-xs text-zinc-500">Will be combined with episode to create: ep001_sh0102</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Description</Label>
                            <Textarea
                                value={shotForm.description}
                                onChange={(e) => setShotForm({ ...shotForm, description: e.target.value })}
                                placeholder="Describe the shot..."
                                className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                rows={2}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Complexity</Label>
                                <Select value={shotForm.complexity} onValueChange={(v) => setShotForm({ ...shotForm, complexity: v })}>
                                    <SelectTrigger className="bg-zinc-950 border-zinc-800">
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800">
                                        <SelectItem value="A">A (Simple)</SelectItem>
                                        <SelectItem value="B">B (Medium)</SelectItem>
                                        <SelectItem value="C">C (Complex)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Frames</Label>
                                <Input
                                    type="number"
                                    value={shotForm.frames}
                                    onChange={(e) => setShotForm({ ...shotForm, frames: e.target.value })}
                                    placeholder={`e.g. 72 (@ ${project?.fps || 25}fps)`}
                                    className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Approved Layout Version</Label>
                            <Input
                                value={shotForm.approved_layout_version}
                                onChange={(e) => setShotForm({ ...shotForm, approved_layout_version: e.target.value })}
                                placeholder="e.g. V001, V002"
                                className="bg-zinc-950 border-zinc-800 text-zinc-100"
                            />
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <Button type="button" variant="ghost" onClick={() => setCreateShotOpen(false)} className="text-zinc-400">Cancel</Button>
                            <Button type="submit" disabled={creating} className="bg-blue-600 hover:bg-blue-500">
                                {creating ? 'Creating...' : 'Create Shot'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
