import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getProjects, createProject, deleteProject } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '../components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import { FolderKanban, Plus, Trash2, Users, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function ProjectsPage() {
    const { isAdmin } = useAuth();
    const navigate = useNavigate();
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        onedrive_link: '',
    });

    useEffect(() => {
        loadProjects();
    }, []);

    const loadProjects = async () => {
        try {
            const { data } = await getProjects();
            setProjects(data);
        } catch (error) {
            toast.error('Failed to load projects');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            toast.error('Please enter a project name');
            return;
        }

        setCreating(true);
        try {
            await createProject(formData);
            toast.success('Project created successfully');
            setCreateOpen(false);
            setFormData({ name: '', description: '', onedrive_link: '' });
            loadProjects();
        } catch (error) {
            toast.error('Failed to create project');
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (projectId) => {
        try {
            await deleteProject(projectId);
            toast.success('Project deleted');
            loadProjects();
        } catch (error) {
            toast.error('Failed to delete project');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-50 font-['Chivo']">Projects</h1>
                    <p className="text-zinc-400 mt-1">Manage your animation projects</p>
                </div>
                {isAdmin && (
                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                        <DialogTrigger asChild>
                            <Button
                                className="bg-blue-600 hover:bg-blue-500 text-white"
                                data-testid="create-project-button"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                New Project
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-zinc-900 border-zinc-800">
                            <DialogHeader>
                                <DialogTitle className="text-zinc-100">Create New Project</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleCreate} className="space-y-4 mt-4">
                                <div className="space-y-2">
                                    <Label className="text-zinc-300">Project Name</Label>
                                    <Input
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Enter project name"
                                        className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                        data-testid="project-name-input"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-zinc-300">Description</Label>
                                    <Textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Enter project description"
                                        className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                        rows={3}
                                        data-testid="project-description-input"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-zinc-300">OneDrive Folder Link</Label>
                                    <Input
                                        value={formData.onedrive_link}
                                        onChange={(e) => setFormData({ ...formData, onedrive_link: e.target.value })}
                                        placeholder="https://onedrive.live.com/..."
                                        className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                        data-testid="project-onedrive-input"
                                    />
                                </div>
                                <div className="flex justify-end gap-3 pt-4">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setCreateOpen(false)}
                                        className="text-zinc-400"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={creating}
                                        className="bg-blue-600 hover:bg-blue-500"
                                        data-testid="create-project-submit"
                                    >
                                        {creating ? 'Creating...' : 'Create Project'}
                                    </Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            {/* Projects Grid */}
            {projects.length === 0 ? (
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="py-16 text-center">
                        <FolderKanban className="w-16 h-16 mx-auto mb-4 text-zinc-600" />
                        <h3 className="text-lg font-medium text-zinc-300 mb-2">No projects yet</h3>
                        <p className="text-zinc-500 mb-4">
                            {isAdmin ? 'Create your first project to get started' : 'You have not been assigned to any projects'}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {projects.map((project) => (
                        <Card
                            key={project.id}
                            className="bg-zinc-900 border-zinc-800 hover:bg-zinc-800/50 cursor-pointer transition-colors card-hover group"
                            onClick={() => navigate(`/projects/${project.id}`)}
                            data-testid={`project-card-${project.id}`}
                        >
                            <CardContent className="p-0">
                                <div className="aspect-video bg-zinc-800 overflow-hidden">
                                    <img
                                        src="https://static.prod-images.emergentagent.com/jobs/cdb8553e-ccf0-471d-81ed-c93aeed5709b/images/06194f8a88f4c513f25bb55bb5f386baab8913a911355e65e70de5297ee0ce0a.png"
                                        alt={project.name}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                </div>
                                <div className="p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-zinc-100 truncate">{project.name}</h3>
                                            <p className="text-sm text-zinc-500 mt-1 line-clamp-2">
                                                {project.description || 'No description'}
                                            </p>
                                        </div>
                                        {isAdmin && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 ml-2"
                                                        onClick={(e) => e.stopPropagation()}
                                                        data-testid={`delete-project-${project.id}`}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent className="bg-zinc-900 border-zinc-800" onClick={(e) => e.stopPropagation()}>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle className="text-zinc-100">Delete Project</AlertDialogTitle>
                                                        <AlertDialogDescription className="text-zinc-400">
                                                            Are you sure you want to delete "{project.name}"? This will also delete all shots and feedback. This action cannot be undone.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel className="bg-zinc-800 text-zinc-300 border-zinc-700">Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            onClick={() => handleDelete(project.id)}
                                                            className="bg-red-600 hover:bg-red-500"
                                                        >
                                                            Delete
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4 mt-4 text-xs text-zinc-500">
                                        <div className="flex items-center gap-1">
                                            <Users className="w-3 h-3" />
                                            {project.team_members?.length || 0} members
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {format(new Date(project.created_at), 'MMM d, yyyy')}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
