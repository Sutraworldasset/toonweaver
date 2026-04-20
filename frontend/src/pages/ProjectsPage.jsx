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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
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
import { FolderKanban, Plus, Trash2, Users, Calendar, Link as LinkIcon, Image, X, Film } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const linkTypes = [
    { value: 'onedrive', label: 'OneDrive' },
    { value: 'google_drive', label: 'Google Drive' },
    { value: 'google_docs', label: 'Google Docs' },
    { value: 'dropbox', label: 'Dropbox' },
    { value: 'other', label: 'Other' },
];

const defaultThumbnail = "https://static.prod-images.emergentagent.com/jobs/cdb8553e-ccf0-471d-81ed-c93aeed5709b/images/06194f8a88f4c513f25bb55bb5f386baab8913a911355e65e70de5297ee0ce0a.png";

export default function ProjectsPage() {
    const { isClient, isProductionManager } = useAuth();
    const canManageProjects = isClient || isProductionManager;
    const navigate = useNavigate();
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        thumbnail_url: '',
        fps: 25,
        drive_links: [],
    });
    const [newLink, setNewLink] = useState({ name: '', url: '', link_type: 'google_drive' });

    useEffect(() => {
        loadProjects();
    }, []);

    const loadProjects = async () => {
        try {
            const { data } = await getProjects();
            setProjects(Array.isArray(data) ? data : []);
        } catch (error) {
            toast.error('Failed to load projects');
        } finally {
            setLoading(false);
        }
    };

    const handleAddLink = () => {
        if (!newLink.name.trim() || !newLink.url.trim()) {
            toast.error('Please enter link name and URL');
            return;
        }
        setFormData({ ...formData, drive_links: [...formData.drive_links, { ...newLink }] });
        setNewLink({ name: '', url: '', link_type: 'google_drive' });
    };

    const handleRemoveLink = (index) => {
        setFormData({ ...formData, drive_links: formData.drive_links.filter((_, i) => i !== index) });
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            toast.error('Please enter a project name');
            return;
        }
        setCreating(true);
        try {
            await createProject({ ...formData, fps: parseInt(formData.fps) });
            toast.success('Project created successfully');
            setCreateOpen(false);
            setFormData({ name: '', description: '', thumbnail_url: '', fps: 25, drive_links: [] });
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
                {canManageProjects && (
                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-blue-600 hover:bg-blue-500 text-white">
                                <Plus className="w-4 h-4 mr-2" />
                                New Project
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle className="text-zinc-100">Create New Project</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleCreate} className="space-y-4 mt-4">
                                <div className="space-y-2">
                                    <Label className="text-zinc-300">Project Name *</Label>
                                    <Input
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Enter project name"
                                        className="bg-zinc-950 border-zinc-800 text-zinc-100"
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
                                    />
                                </div>

                                {/* FPS Setting */}
                                <div className="space-y-2">
                                    <Label className="text-zinc-300 flex items-center gap-2">
                                        <Film className="w-4 h-4" />
                                        Frame Rate (FPS)
                                    </Label>
                                    <Select
                                        value={String(formData.fps)}
                                        onValueChange={(v) => setFormData({ ...formData, fps: parseInt(v) })}
                                    >
                                        <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-100">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            <SelectItem value="24">24 fps (Cinema)</SelectItem>
                                            <SelectItem value="25">25 fps (PAL / Europe)</SelectItem>
                                            <SelectItem value="30">30 fps (NTSC / Web)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-zinc-500">
                                        This setting is used to calculate shot durations. Cannot be changed after shots are created.
                                    </p>
                                </div>

                                {/* Thumbnail */}
                                <div className="space-y-2">
                                    <Label className="text-zinc-300 flex items-center gap-2">
                                        <Image className="w-4 h-4" />
                                        Thumbnail URL
                                    </Label>
                                    <Input
                                        value={formData.thumbnail_url}
                                        onChange={(e) => setFormData({ ...formData, thumbnail_url: e.target.value })}
                                        placeholder="https://example.com/image.jpg"
                                        className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                    />
                                    {formData.thumbnail_url && (
                                        <div className="mt-2 rounded-lg overflow-hidden border border-zinc-800 h-32">
                                            <img
                                                src={formData.thumbnail_url}
                                                alt="Preview"
                                                className="w-full h-full object-cover"
                                                onError={(e) => e.target.src = defaultThumbnail}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Drive Links */}
                                <div className="space-y-3">
                                    <Label className="text-zinc-300 flex items-center gap-2">
                                        <LinkIcon className="w-4 h-4" />
                                        Project Drive Links
                                    </Label>
                                    {formData.drive_links.length > 0 && (
                                        <div className="space-y-2">
                                            {formData.drive_links.map((link, index) => (
                                                <div key={index} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-zinc-200 truncate">{link.name}</p>
                                                        <p className="text-xs text-zinc-500 truncate">{link.url}</p>
                                                    </div>
                                                    <span className="text-xs px-2 py-1 rounded bg-zinc-700 text-zinc-300 capitalize">
                                                        {link.link_type.replace('_', ' ')}
                                                    </span>
                                                    <Button type="button" variant="ghost" size="icon"
                                                        onClick={() => handleRemoveLink(index)}
                                                        className="text-zinc-500 hover:text-red-400 h-8 w-8">
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-700 space-y-3">
                                        <div className="grid grid-cols-2 gap-2">
                                            <Input
                                                value={newLink.name}
                                                onChange={(e) => setNewLink({ ...newLink, name: e.target.value })}
                                                placeholder="Link name"
                                                className="bg-zinc-900 border-zinc-700 text-zinc-100 text-sm"
                                            />
                                            <Select value={newLink.link_type} onValueChange={(v) => setNewLink({ ...newLink, link_type: v })}>
                                                <SelectTrigger className="bg-zinc-900 border-zinc-700">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-zinc-900 border-zinc-800">
                                                    {linkTypes.map((type) => (
                                                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex gap-2">
                                            <Input
                                                value={newLink.url}
                                                onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                                                placeholder="https://drive.google.com/..."
                                                className="flex-1 bg-zinc-900 border-zinc-700 text-zinc-100 text-sm"
                                            />
                                            <Button type="button" onClick={handleAddLink} variant="secondary" className="bg-zinc-700 hover:bg-zinc-600">
                                                <Plus className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 pt-4">
                                    <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} className="text-zinc-400">
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={creating} className="bg-blue-600 hover:bg-blue-500">
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
                            {canManageProjects ? 'Create your first project to get started' : 'You have not been assigned to any projects'}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {projects.map((project) => (
                        <Card
                            key={project.id}
                            className="bg-zinc-900 border-zinc-800 hover:bg-zinc-800/50 cursor-pointer transition-colors group"
                            onClick={() => navigate(`/projects/${project.id}`)}
                        >
                            <CardContent className="p-0">
                                <div className="aspect-video bg-zinc-800 overflow-hidden">
                                    <img
                                        src={project.thumbnail_url || defaultThumbnail}
                                        alt={project.name}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                        onError={(e) => e.target.src = defaultThumbnail}
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
                                        {canManageProjects && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon"
                                                        className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 ml-2"
                                                        onClick={(e) => e.stopPropagation()}>
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent className="bg-zinc-900 border-zinc-800" onClick={(e) => e.stopPropagation()}>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle className="text-zinc-100">Delete Project</AlertDialogTitle>
                                                        <AlertDialogDescription className="text-zinc-400">
                                                            Are you sure you want to delete "{project.name}"? This will also delete all episodes, shots and feedback. This action cannot be undone.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel className="bg-zinc-800 text-zinc-300 border-zinc-700">Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDelete(project.id)} className="bg-red-600 hover:bg-red-500">
                                                            Delete
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4 mt-4 text-xs text-zinc-500">
                                        <div className="flex items-center gap-1">
                                            <Film className="w-3 h-3" />
                                            {project.fps || 25} fps
                                        </div>
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
