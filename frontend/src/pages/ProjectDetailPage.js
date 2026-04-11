import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    getProject,
    getShots,
    createShot,
    deleteShot,
    updateShot,
    getUsers,
    addTeamMember,
    removeTeamMember,
    getActivityLog,
    getDriveMapperUrl,
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
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import StatusBadge from '../components/StatusBadge';
import {
    ArrowLeft,
    Plus,
    Trash2,
    Users,
    Clapperboard,
    Calendar as CalendarIcon,
    Download,
    ExternalLink,
    Clock,
    Search,
    Filter,
    UserPlus,
    X,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

const statusOptions = [
    { value: 'not_started', label: 'Not Started' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'retake', label: 'Retake' },
    { value: 'approved', label: 'Approved' },
];

export default function ProjectDetailPage() {
    const { projectId } = useParams();
    const { isAdmin, isProductionManager, isSupervisor, user } = useAuth();
    const canManageProjects = isAdmin || isProductionManager;
    const canManageShots = isAdmin || isProductionManager || isSupervisor;
    const navigate = useNavigate();
    
    const [project, setProject] = useState(null);
    const [shots, setShots] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [activityLog, setActivityLog] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [createShotOpen, setCreateShotOpen] = useState(false);
    const [addMemberOpen, setAddMemberOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    
    const [shotForm, setShotForm] = useState({
        shot_id: '',
        description: '',
        frame_start: 1,
        frame_end: 100,
        deadline: null,
    });
    
    const [memberForm, setMemberForm] = useState({
        user_id: '',
        role: 'animator',
    });

    useEffect(() => {
        loadData();
    }, [projectId]);

    const loadData = async () => {
        try {
            const [projectRes, shotsRes] = await Promise.all([
                getProject(projectId),
                getShots(projectId),
            ]);
            setProject(projectRes.data);
            setShots(shotsRes.data);

            if (canManageProjects || isSupervisor) {
                const [usersRes, activityRes] = await Promise.all([
                    getUsers(),
                    getActivityLog(projectId),
                ]);
                setAllUsers(usersRes.data);
                setActivityLog(activityRes.data);
            }
        } catch (error) {
            toast.error('Failed to load project');
            navigate('/projects');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateShot = async (e) => {
        e.preventDefault();
        if (!shotForm.shot_id.trim()) {
            toast.error('Please enter a shot ID');
            return;
        }

        setCreating(true);
        try {
            await createShot(projectId, shotForm);
            toast.success('Shot created successfully');
            setCreateShotOpen(false);
            setShotForm({ shot_id: '', description: '', frame_start: 1, frame_end: 100, deadline: null });
            loadData();
        } catch (error) {
            toast.error('Failed to create shot');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteShot = async (shotId) => {
        if (!window.confirm('Are you sure you want to delete this shot?')) return;
        
        try {
            await deleteShot(projectId, shotId);
            toast.success('Shot deleted');
            loadData();
        } catch (error) {
            toast.error('Failed to delete shot');
        }
    };

    const handleAssignShot = async (shotId, userId) => {
        try {
            await updateShot(projectId, shotId, { assigned_to: userId || null });
            toast.success('Shot assignment updated');
            loadData();
        } catch (error) {
            toast.error('Failed to update assignment');
        }
    };

    const handleStatusChange = async (shotId, status) => {
        try {
            await updateShot(projectId, shotId, { status });
            toast.success('Status updated');
            loadData();
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

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
            setMemberForm({ user_id: '', role: 'animator' });
            loadData();
        } catch (error) {
            toast.error('Failed to add team member');
        }
    };

    const handleRemoveMember = async (userId) => {
        if (!window.confirm('Are you sure you want to remove this team member?')) return;
        
        try {
            await removeTeamMember(projectId, userId);
            toast.success('Team member removed');
            loadData();
        } catch (error) {
            toast.error('Failed to remove team member');
        }
    };

    const filteredShots = shots.filter((shot) => {
        const matchesSearch = shot.shot_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            shot.description?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || shot.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const teamAnimators = allUsers.filter(u => 
        project?.team_members?.some(m => m.user_id === u.id && m.role === 'animator')
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
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate('/projects')}
                    className="text-zinc-400 hover:text-zinc-100"
                    data-testid="back-button"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="flex-1">
                    <h1 className="text-3xl font-bold text-zinc-50 font-['Chivo']">{project.name}</h1>
                    <p className="text-zinc-400 mt-1">{project.description || 'No description'}</p>
                </div>
                <Button
                    variant="outline"
                    onClick={() => window.open(getDriveMapperUrl(projectId), '_blank')}
                    className="border-zinc-700 text-zinc-300"
                    data-testid="download-bat-button"
                >
                    <Download className="w-4 h-4 mr-2" />
                    Download .bat
                </Button>
            </div>

            {/* Drive Links */}
            {project.drive_links && project.drive_links.length > 0 && (
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex flex-wrap gap-2">
                            {project.drive_links.map((link, index) => (
                                <Button
                                    key={index}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.open(link.url, '_blank')}
                                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                                    data-testid={`drive-link-${index}`}
                                >
                                    <ExternalLink className="w-3 h-3 mr-2" />
                                    {link.name}
                                    <span className="ml-2 text-xs text-zinc-500 capitalize">
                                        ({link.link_type?.replace('_', ' ') || 'link'})
                                    </span>
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
                        Shots
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
                </TabsList>

                {/* Shots Tab */}
                <TabsContent value="shots" className="space-y-4">
                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <Input
                                placeholder="Search shots..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 bg-zinc-900 border-zinc-800 text-zinc-100"
                                data-testid="search-shots-input"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-40 bg-zinc-900 border-zinc-800" data-testid="status-filter">
                                <Filter className="w-4 h-4 mr-2" />
                                <SelectValue placeholder="Filter" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                                <SelectItem value="all">All Statuses</SelectItem>
                                {statusOptions.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {canManageShots && (
                            <Dialog open={createShotOpen} onOpenChange={setCreateShotOpen}>
                                <DialogTrigger asChild>
                                    <Button className="bg-blue-600 hover:bg-blue-500" data-testid="create-shot-button">
                                        <Plus className="w-4 h-4 mr-2" />
                                        New Shot
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-zinc-900 border-zinc-800">
                                    <DialogHeader>
                                        <DialogTitle className="text-zinc-100">Create New Shot</DialogTitle>
                                    </DialogHeader>
                                    <form onSubmit={handleCreateShot} className="space-y-4 mt-4">
                                        <div className="space-y-2">
                                            <Label className="text-zinc-300">Shot ID</Label>
                                            <Input
                                                value={shotForm.shot_id}
                                                onChange={(e) => setShotForm({ ...shotForm, shot_id: e.target.value })}
                                                placeholder="e.g., SC01_SH010"
                                                className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                                data-testid="shot-id-input"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-zinc-300">Description</Label>
                                            <Textarea
                                                value={shotForm.description}
                                                onChange={(e) => setShotForm({ ...shotForm, description: e.target.value })}
                                                placeholder="Describe the shot..."
                                                className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                                rows={2}
                                                data-testid="shot-description-input"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-zinc-300">Frame Start</Label>
                                                <Input
                                                    type="number"
                                                    value={shotForm.frame_start}
                                                    onChange={(e) => setShotForm({ ...shotForm, frame_start: parseInt(e.target.value) || 1 })}
                                                    className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                                    data-testid="frame-start-input"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-zinc-300">Frame End</Label>
                                                <Input
                                                    type="number"
                                                    value={shotForm.frame_end}
                                                    onChange={(e) => setShotForm({ ...shotForm, frame_end: parseInt(e.target.value) || 100 })}
                                                    className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                                    data-testid="frame-end-input"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-zinc-300">Deadline</Label>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        className={cn(
                                                            "w-full justify-start text-left font-normal bg-zinc-950 border-zinc-800",
                                                            !shotForm.deadline && "text-zinc-500"
                                                        )}
                                                        data-testid="deadline-picker"
                                                    >
                                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                                        {shotForm.deadline ? format(shotForm.deadline, "PPP") : "Pick a date"}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0 bg-zinc-900 border-zinc-800">
                                                    <Calendar
                                                        mode="single"
                                                        selected={shotForm.deadline}
                                                        onSelect={(date) => setShotForm({ ...shotForm, deadline: date })}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <div className="flex justify-end gap-3 pt-4">
                                            <Button type="button" variant="ghost" onClick={() => setCreateShotOpen(false)} className="text-zinc-400">
                                                Cancel
                                            </Button>
                                            <Button type="submit" disabled={creating} className="bg-blue-600 hover:bg-blue-500" data-testid="create-shot-submit">
                                                {creating ? 'Creating...' : 'Create Shot'}
                                            </Button>
                                        </div>
                                    </form>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>

                    {/* Shots Table */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardContent className="p-0">
                            {filteredShots.length === 0 ? (
                                <div className="py-16 text-center">
                                    <Clapperboard className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
                                    <p className="text-zinc-400">No shots found</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-zinc-800 hover:bg-transparent">
                                            <TableHead className="text-zinc-400">Shot ID</TableHead>
                                            <TableHead className="text-zinc-400">Frames</TableHead>
                                            <TableHead className="text-zinc-400">Assigned To</TableHead>
                                            <TableHead className="text-zinc-400">Deadline</TableHead>
                                            <TableHead className="text-zinc-400">Status</TableHead>
                                            <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredShots.map((shot) => (
                                            <TableRow
                                                key={shot.id}
                                                className="border-zinc-800 hover:bg-zinc-800/50 cursor-pointer"
                                                onClick={() => navigate(`/projects/${projectId}/shots/${shot.id}`)}
                                                data-testid={`shot-row-${shot.shot_id}`}
                                            >
                                                <TableCell className="font-medium text-zinc-100">{shot.shot_id}</TableCell>
                                                <TableCell className="text-zinc-400">{shot.frame_start} - {shot.frame_end}</TableCell>
                                                <TableCell onClick={(e) => e.stopPropagation()}>
                                                    {canManageShots ? (
                                                        <Select
                                                            value={shot.assigned_to || 'unassigned'}
                                                            onValueChange={(value) => handleAssignShot(shot.id, value === 'unassigned' ? null : value)}
                                                        >
                                                            <SelectTrigger className="w-36 h-8 bg-zinc-800 border-zinc-700 text-sm" data-testid={`assign-${shot.id}`}>
                                                                <SelectValue placeholder="Unassigned" />
                                                            </SelectTrigger>
                                                            <SelectContent className="bg-zinc-900 border-zinc-800">
                                                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                                                {teamAnimators.map((u) => (
                                                                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    ) : (
                                                        <span className="text-zinc-400">{shot.assigned_to_name || 'Unassigned'}</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-zinc-400">
                                                    {shot.deadline ? format(new Date(shot.deadline), 'MMM d, yyyy') : '-'}
                                                </TableCell>
                                                <TableCell onClick={(e) => e.stopPropagation()}>
                                                    {canManageShots ? (
                                                        <Select
                                                            value={shot.status}
                                                            onValueChange={(value) => handleStatusChange(shot.id, value)}
                                                        >
                                                            <SelectTrigger className="w-36 h-8 bg-transparent border-0 p-0" data-testid={`status-${shot.id}`}>
                                                                <StatusBadge status={shot.status} />
                                                            </SelectTrigger>
                                                            <SelectContent className="bg-zinc-900 border-zinc-800">
                                                                {statusOptions.map((opt) => (
                                                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    ) : (
                                                        <StatusBadge status={shot.status} />
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                                    {canManageShots && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleDeleteShot(shot.id)}
                                                            className="text-zinc-500 hover:text-red-400"
                                                            data-testid={`delete-shot-${shot.id}`}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Team Tab */}
                {(canManageProjects || isSupervisor) && (
                    <TabsContent value="team" className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-semibold text-zinc-100">Team Members</h2>
                            {canManageProjects && (
                                <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
                                    <DialogTrigger asChild>
                                        <Button className="bg-blue-600 hover:bg-blue-500" data-testid="add-member-button">
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
                                                    <SelectTrigger className="bg-zinc-950 border-zinc-800" data-testid="select-user">
                                                        <SelectValue placeholder="Select a user" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-zinc-900 border-zinc-800">
                                                        {allUsers
                                                            .filter(u => !project.team_members?.some(m => m.user_id === u.id))
                                                            .map((u) => (
                                                                <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                                                            ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-zinc-300">Role</Label>
                                                <Select value={memberForm.role} onValueChange={(v) => setMemberForm({ ...memberForm, role: v })}>
                                                    <SelectTrigger className="bg-zinc-950 border-zinc-800" data-testid="select-role">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-zinc-900 border-zinc-800">
                                                        <SelectItem value="production_manager">Production Manager</SelectItem>
                                                        <SelectItem value="supervisor">Supervisor</SelectItem>
                                                        <SelectItem value="animator">Animator</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex justify-end gap-3 pt-4">
                                                <Button type="button" variant="ghost" onClick={() => setAddMemberOpen(false)} className="text-zinc-400">
                                                    Cancel
                                                </Button>
                                                <Button type="submit" className="bg-blue-600 hover:bg-blue-500" data-testid="add-member-submit">
                                                    Add Member
                                                </Button>
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
                                                    <TableCell className="font-medium text-zinc-100">
                                                        {memberUser?.name || 'Unknown'}
                                                    </TableCell>
                                                    <TableCell className="text-zinc-400">{memberUser?.email}</TableCell>
                                                    <TableCell>
                                                        <span className="capitalize text-zinc-300">{member.role}</span>
                                                    </TableCell>
                                                    {canManageProjects && (
                                                        <TableCell className="text-right">
                                                            {member.role !== 'admin' && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => handleRemoveMember(member.user_id)}
                                                                    className="text-zinc-500 hover:text-red-400"
                                                                    data-testid={`remove-member-${member.user_id}`}
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </Button>
                                                            )}
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
            </Tabs>
        </div>
    );
}
