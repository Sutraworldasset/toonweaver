import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getDashboardStats, getAssignedShots, getProjects, getDriveMapperUrl } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import StatusBadge from '../components/StatusBadge';
import {
    FolderKanban,
    Clapperboard,
    Users,
    CheckCircle,
    Clock,
    AlertTriangle,
    Send,
    Pause,
    Terminal,
    Download,
    ArrowRight,
    Calendar,
} from 'lucide-react';
import { format } from 'date-fns';

export default function DashboardPage() {
    const { user, isAdmin, isProductionManager, isAnimator } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [assignedShots, setAssignedShots] = useState([]);
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [statsRes, projectsRes] = await Promise.all([
                getDashboardStats(),
                getProjects(),
            ]);
            setStats(statsRes.data);
            setProjects(projectsRes.data);

            if (isAnimator) {
                const shotsRes = await getAssignedShots();
                setAssignedShots(shotsRes.data);
            }
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadBat = (projectId) => {
        window.open(getDriveMapperUrl(projectId), '_blank');
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const statCards = [
        {
            label: 'Total Projects',
            value: stats?.total_projects || 0,
            icon: FolderKanban,
            color: 'text-blue-500',
            bgColor: 'bg-blue-500/10',
        },
        {
            label: 'Total Shots',
            value: stats?.total_shots || 0,
            icon: Clapperboard,
            color: 'text-purple-500',
            bgColor: 'bg-purple-500/10',
        },
        ...((isAdmin || isProductionManager)
            ? [
                  {
                      label: 'Total Users',
                      value: stats?.total_users || 0,
                      icon: Users,
                      color: 'text-emerald-500',
                      bgColor: 'bg-emerald-500/10',
                  },
              ]
            : []),
    ];

    const statusCards = [
        {
            label: 'Approved',
            value: stats?.status_counts?.approved || 0,
            icon: CheckCircle,
            color: 'text-emerald-500',
        },
        {
            label: 'In Progress',
            value: stats?.status_counts?.in_progress || 0,
            icon: Clock,
            color: 'text-amber-400',
        },
        {
            label: 'Submitted',
            value: stats?.status_counts?.submitted || 0,
            icon: Send,
            color: 'text-blue-400',
        },
        {
            label: 'Retake',
            value: stats?.status_counts?.retake || 0,
            icon: AlertTriangle,
            color: 'text-red-400',
        },
        {
            label: 'Not Started',
            value: stats?.status_counts?.not_started || 0,
            icon: Pause,
            color: 'text-zinc-400',
        },
    ];

    return (
        <div className="space-y-6">
            {/* Welcome Header */}
            <div>
                <h1 className="text-3xl font-bold text-zinc-50 font-['Chivo']">
                    Welcome back, {user?.name}
                </h1>
                <p className="text-zinc-400 mt-1">
                    Here's an overview of your animation pipeline
                </p>
            </div>

            {/* Drive Mapper Card for Animators */}
            {isAnimator && projects.length > 0 && (
                <Card className="terminal-card bg-zinc-900 border-zinc-800" data-testid="drive-mapper-card">
                    <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                    <Terminal className="w-6 h-6 text-emerald-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-zinc-50">
                                        Download M: Drive Mapper
                                    </h3>
                                    <p className="text-sm text-zinc-400 mt-1">
                                        Map your network drive to access project files directly
                                    </p>
                                </div>
                            </div>
                            <Button
                                onClick={() => handleDownloadBat(projects[0].id)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white"
                                data-testid="download-bat-btn"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Download .bat
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {statCards.map((stat, index) => (
                    <Card key={index} className="bg-zinc-900 border-zinc-800 card-hover">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                        {stat.label}
                                    </p>
                                    <p className="text-3xl font-bold text-zinc-50 mt-2">{stat.value}</p>
                                </div>
                                <div className={`w-12 h-12 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Status Overview */}
            <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                    <CardTitle className="text-zinc-100">Shot Status Overview</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {statusCards.map((status, index) => (
                            <div
                                key={index}
                                className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-800"
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <status.icon className={`w-4 h-4 ${status.color}`} />
                                    <span className="text-xs font-medium text-zinc-400">{status.label}</span>
                                </div>
                                <p className="text-2xl font-bold text-zinc-50">{status.value}</p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Assigned Shots for Animators */}
            {isAnimator && assignedShots.length > 0 && (
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-zinc-100">My Assigned Shots</CardTitle>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate('/projects')}
                            className="text-blue-400 hover:text-blue-300"
                        >
                            View All <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {assignedShots.slice(0, 5).map((shot) => (
                                <div
                                    key={shot.id}
                                    onClick={() => navigate(`/projects/${shot.project_id}/shots/${shot.id}`)}
                                    className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/50 border border-zinc-800 hover:bg-zinc-800 cursor-pointer transition-colors"
                                    data-testid={`shot-card-${shot.shot_id}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded bg-zinc-700 flex items-center justify-center">
                                            <Clapperboard className="w-5 h-5 text-zinc-400" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-zinc-100">{shot.shot_id}</p>
                                            <p className="text-xs text-zinc-500">{shot.project_name}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {shot.deadline && (
                                            <div className="flex items-center gap-1 text-xs text-zinc-500">
                                                <Calendar className="w-3 h-3" />
                                                {format(new Date(shot.deadline), 'MMM d')}
                                            </div>
                                        )}
                                        <StatusBadge status={shot.status} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Recent Projects */}
            <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-zinc-100">Recent Projects</CardTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate('/projects')}
                        className="text-blue-400 hover:text-blue-300"
                    >
                        View All <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                </CardHeader>
                <CardContent>
                    {projects.length === 0 ? (
                        <div className="text-center py-8 text-zinc-500">
                            <FolderKanban className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>No projects yet</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {projects.slice(0, 6).map((project) => (
                                <div
                                    key={project.id}
                                    onClick={() => navigate(`/projects/${project.id}`)}
                                    className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-800 hover:bg-zinc-800 cursor-pointer transition-colors card-hover"
                                    data-testid={`project-card-${project.id}`}
                                >
                                    <div className="aspect-video rounded-md bg-zinc-700 mb-3 overflow-hidden">
                                        <img
                                            src="https://static.prod-images.emergentagent.com/jobs/cdb8553e-ccf0-471d-81ed-c93aeed5709b/images/06194f8a88f4c513f25bb55bb5f386baab8913a911355e65e70de5297ee0ce0a.png"
                                            alt={project.name}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <h3 className="font-medium text-zinc-100 truncate">{project.name}</h3>
                                    <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                                        {project.description || 'No description'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
