import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getShot, getFeedback, createFeedback, addFileLink, updateShot } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../components/ui/dialog';
import {
    ArrowLeft,
    Send,
    Paperclip,
    FileVideo,
    FileText,
    Calendar,
    User,
    Clock,
    ExternalLink,
    Plus,
    Play,
    Download,
    Edit,
    X,
    Film,
    Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

// Extract Google Drive FILE_ID from various link formats
function extractDriveFileId(url) {
    if (!url) return null;
    const patterns = [
        /\/file\/d\/([a-zA-Z0-9_-]+)/,
        /id=([a-zA-Z0-9_-]+)/,
        /\/d\/([a-zA-Z0-9_-]+)/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function getDriveThumbnail(url) {
    const id = extractDriveFileId(url);
    return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w400` : null;
}

function getDriveEmbed(url) {
    const id = extractDriveFileId(url);
    return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

function getDriveDownload(url) {
    const id = extractDriveFileId(url);
    return id ? `https://drive.google.com/uc?export=download&id=${id}` : null;
}

const COMPLEXITY_COLORS = { A: '#22c55e', B: '#f59e0b', C: '#ef4444' };

const DEFAULT_STATUSES = [
    { value: 'yts', label: 'YTS', color: '#71717a' },
    { value: 'in_progress', label: 'In Progress', color: '#3b82f6' },
    { value: 'uploaded', label: 'Uploaded', color: '#a855f7' },
    { value: 'internal_review', label: 'Internal Review', color: '#f59e0b' },
    { value: 'retake', label: 'Retake', color: '#ef4444' },
    { value: 'hold', label: 'Hold', color: '#f97316' },
    { value: 'approved', label: 'Approved', color: '#22c55e' },
];

function StatusBadgeCustom({ status, statuses }) {
    const found = statuses.find(s => s.value === status);
    if (!found) return <span className="text-zinc-500 text-xs">{status}</span>;
    return (
        <span className="px-2 py-1 rounded text-xs font-medium"
            style={{ backgroundColor: found.color + '22', color: found.color, border: `1px solid ${found.color}44` }}>
            {found.label}
        </span>
    );
}

export default function ShotDetailPage() {
    const { projectId, episodeId, shotId } = useParams();
    const { user, isClient, isProductionManager, isSupervisor, isArtist } = useAuth();
    const canManage = isClient || isProductionManager || isSupervisor;
    const navigate = useNavigate();

    const [shot, setShot] = useState(null);
    const [feedback, setFeedback] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [saving, setSaving] = useState(false);

    // Video player modal
    const [videoOpen, setVideoOpen] = useState(false);
    const [videoUrl, setVideoUrl] = useState('');
    const [videoTitle, setVideoTitle] = useState('');

    // Edit shot modal
    const [editOpen, setEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({
        description: '',
        complexity: '',
        frames: '',
        approved_layout_version: '',
        feedback_link: '',
        playblast_link: '',
        scene_link: '',
    });

    // Feedback
    const [commentText, setCommentText] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [newAttachment, setNewAttachment] = useState({ name: '', url: '' });

    useEffect(() => {
        loadData();
    }, [projectId, episodeId, shotId]);

    const loadData = async () => {
        try {
            const [shotRes, feedbackRes] = await Promise.all([
                getShot(projectId, episodeId, shotId),
                getFeedback(projectId, episodeId, shotId),
            ]);
            setShot(shotRes.data);
            setFeedback(Array.isArray(feedbackRes.data) ? feedbackRes.data : []);
            // Pre-fill edit form
            const s = shotRes.data;
            setEditForm({
                description: s.description || '',
                complexity: s.complexity || '',
                frames: s.frames || '',
                approved_layout_version: s.approved_layout_version || '',
                feedback_link: s.feedback_link || '',
                playblast_link: s.playblast_link || '',
                scene_link: s.scene_link || '',
            });
        } catch {
            toast.error('Failed to load shot details');
            navigate(`/projects/${projectId}`);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (status) => {
        try {
            await updateShot(projectId, episodeId, shotId, { status });
            toast.success('Status updated');
            loadData();
        } catch {
            toast.error('Failed to update status');
        }
    };

    const handleSaveEdit = async () => {
        setSaving(true);
        try {
            await updateShot(projectId, episodeId, shotId, {
                description: editForm.description,
                complexity: editForm.complexity || null,
                frames: editForm.frames ? parseInt(editForm.frames) : null,
                approved_layout_version: editForm.approved_layout_version,
                feedback_link: editForm.feedback_link,
                playblast_link: editForm.playblast_link,
                scene_link: editForm.scene_link,
            });
            toast.success('Shot updated');
            setEditOpen(false);
            loadData();
        } catch {
            toast.error('Failed to update shot');
        } finally {
            setSaving(false);
        }
    };

    const handlePlayVideo = (url, title) => {
        const embedUrl = getDriveEmbed(url);
        if (!embedUrl) {
            window.open(url, '_blank');
            return;
        }
        setVideoUrl(embedUrl);
        setVideoTitle(title);
        setVideoOpen(true);
    };

    const handleSubmitFeedback = async (e) => {
        e.preventDefault();
        if (!commentText.trim()) { toast.error('Please enter a comment'); return; }
        setSubmitting(true);
        try {
            await createFeedback(projectId, episodeId, shotId, {
                comment: commentText,
                attachments,
            });
            toast.success('Feedback submitted');
            setCommentText('');
            setAttachments([]);
            loadData();
        } catch {
            toast.error('Failed to submit feedback');
        } finally {
            setSubmitting(false);
        }
    };

    const handleAddAttachment = () => {
        if (!newAttachment.name || !newAttachment.url) { toast.error('Enter name and URL'); return; }
        setAttachments([...attachments, { ...newAttachment, file_type: 'link' }]);
        setNewAttachment({ name: '', url: '' });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!shot) return null;

    const isAssignedArtist = isArtist && shot.assigned_to === user?.id;
    const canChangeStatus = canManage || isAssignedArtist;
    const canEdit = isClient || isProductionManager || isSupervisor;

    const playblastThumb = getDriveThumbnail(shot.playblast_link);
    const playblastEmbed = getDriveEmbed(shot.playblast_link);
    const sceneDownload = getDriveDownload(shot.scene_link);

    const allStatuses = DEFAULT_STATUSES;
    const artistStatuses = allStatuses.filter(s => ['in_progress', 'uploaded'].includes(s.value));
    const statusOptions = isArtist ? artistStatuses : allStatuses;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate(`/projects/${projectId}`)} className="text-zinc-400 hover:text-zinc-100">
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold text-zinc-50 font-['Chivo'] font-mono">{shot.shot_id}</h1>
                        {shot.complexity && (
                            <span className="px-2 py-1 rounded text-xs font-bold"
                                style={{ color: COMPLEXITY_COLORS[shot.complexity], border: `1px solid ${COMPLEXITY_COLORS[shot.complexity]}44`, background: COMPLEXITY_COLORS[shot.complexity] + '22' }}>
                                {shot.complexity}
                            </span>
                        )}
                    </div>
                    <p className="text-zinc-400 mt-1">{shot.description || 'No description'}</p>
                </div>
                <div className="flex items-center gap-2">
                    {canEdit && (
                        <Button variant="outline" onClick={() => setEditOpen(true)} className="border-zinc-700 text-zinc-300">
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Shot
                        </Button>
                    )}
                    {canChangeStatus && (
                        <Select value={shot.status} onValueChange={handleStatusChange}>
                            <SelectTrigger className="w-44 bg-zinc-900 border-zinc-700">
                                <StatusBadgeCustom status={shot.status} statuses={allStatuses} />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                                {statusOptions.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-6">

                    {/* Playblast Preview */}
                    {shot.playblast_link && (
                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-zinc-100 flex items-center gap-2">
                                    <Film className="w-5 h-5 text-purple-400" />
                                    Playblast
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div
                                    className="relative rounded-lg overflow-hidden bg-zinc-800 cursor-pointer group"
                                    onClick={() => handlePlayVideo(shot.playblast_link, shot.shot_id)}
                                >
                                    {playblastThumb ? (
                                        <img
                                            src={playblastThumb}
                                            alt={shot.shot_id}
                                            className="w-full aspect-video object-cover group-hover:opacity-80 transition-opacity"
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                                e.target.nextSibling.style.display = 'flex';
                                            }}
                                        />
                                    ) : null}
                                    <div className={`${playblastThumb ? 'hidden' : 'flex'} w-full aspect-video items-center justify-center bg-zinc-800`}>
                                        <FileVideo className="w-16 h-16 text-zinc-600" />
                                    </div>
                                    {/* Play overlay */}
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center group-hover:bg-black/80 transition-colors">
                                            <Play className="w-6 h-6 text-white ml-1" />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <Button
                                        onClick={() => handlePlayVideo(shot.playblast_link, shot.shot_id)}
                                        className="flex-1 bg-purple-600 hover:bg-purple-500"
                                    >
                                        <Play className="w-4 h-4 mr-2" />
                                        Play Playblast
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => window.open(shot.playblast_link, '_blank')}
                                        className="border-zinc-700 text-zinc-300"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Shot Details */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-zinc-100">Shot Details</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 rounded-lg bg-zinc-800/50">
                                    <p className="text-zinc-500 text-xs mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Frames</p>
                                    <p className="text-zinc-100 font-medium">{shot.frames || '-'}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-zinc-800/50">
                                    <p className="text-zinc-500 text-xs mb-1">Duration</p>
                                    <p className="text-zinc-100 font-medium">{shot.duration_seconds ? `${shot.duration_seconds}s` : '-'}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-zinc-800/50">
                                    <p className="text-zinc-500 text-xs mb-1 flex items-center gap-1"><Tag className="w-3 h-3" /> Layout Ver.</p>
                                    <p className="text-zinc-100 font-medium">{shot.approved_layout_version || '-'}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-zinc-800/50">
                                    <p className="text-zinc-500 text-xs mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Deadline</p>
                                    <p className="text-zinc-100 font-medium">
                                        {shot.deadline ? format(new Date(shot.deadline), 'MMM d, yyyy') : 'Not set'}
                                    </p>
                                </div>
                                <div className="p-3 rounded-lg bg-zinc-800/50">
                                    <p className="text-zinc-500 text-xs mb-1 flex items-center gap-1"><User className="w-3 h-3" /> Artist</p>
                                    <p className="text-zinc-100 font-medium">{shot.assigned_to_name || 'Unassigned'}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-zinc-800/50">
                                    <p className="text-zinc-500 text-xs mb-1">FPS</p>
                                    <p className="text-zinc-100 font-medium">{shot.fps || 25}</p>
                                </div>
                            </div>

                            {/* Scene File — only shown to assigned artist or managers */}
                            {shot.scene_link && (canManage || isAssignedArtist) && (
                                <div className="mt-4 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                                    <p className="text-zinc-500 text-xs mb-2">Scene File</p>
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-amber-400" />
                                        <span className="text-zinc-300 text-sm flex-1 truncate">{shot.shot_id} scene</span>
                                        {/* Artists can only download their own scene file */}
                                        {(canManage || isAssignedArtist) && sceneDownload && (
                                            <Button
                                                size="sm"
                                                onClick={() => window.open(sceneDownload, '_blank')}
                                                className="bg-amber-600 hover:bg-amber-500 text-white"
                                            >
                                                <Download className="w-3 h-3 mr-1" />
                                                Download
                                            </Button>
                                        )}
                                        {canManage && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => window.open(shot.scene_link, '_blank')}
                                                className="border-zinc-700 text-zinc-300"
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Feedback link */}
                            {shot.feedback_link && (
                                <div className="mt-3">
                                    <a href={shot.feedback_link} target="_blank" rel="noreferrer"
                                        className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm">
                                        <ExternalLink className="w-4 h-4" />
                                        View Feedback Reference
                                    </a>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column - Feedback */}
                <Card className="bg-zinc-900 border-zinc-800 flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                    <CardHeader>
                        <CardTitle className="text-zinc-100">Feedback Thread</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
                            {feedback.length === 0 ? (
                                <div className="text-center py-8 text-zinc-500">
                                    <p>No feedback yet</p>
                                    <p className="text-xs mt-1">Start the conversation</p>
                                </div>
                            ) : (
                                feedback.map((item) => (
                                    <div key={item.id} className={`p-3 rounded-lg ${item.user_id === user?.id ? 'bg-blue-600/10 border border-blue-500/20 ml-4' : 'bg-zinc-800/50 border border-zinc-700 mr-4'}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300">
                                                {item.user_name?.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-xs font-medium text-zinc-200">{item.user_name}</span>
                                            <span className="text-xs text-zinc-500 capitalize">({item.user_role?.replace('_', ' ')})</span>
                                            <span className="text-xs text-zinc-600 ml-auto">
                                                {format(new Date(item.created_at), 'MMM d, HH:mm')}
                                            </span>
                                        </div>
                                        <p className="text-sm text-zinc-300">{item.comment}</p>
                                        {item.attachments?.length > 0 && (
                                            <div className="mt-2 space-y-1">
                                                {item.attachments.map((att, i) => (
                                                    <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                                                        className="flex items-center gap-2 text-xs text-blue-400 hover:underline">
                                                        <Paperclip className="w-3 h-3" />
                                                        {att.name}
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Feedback input — all roles can comment */}
                        <form onSubmit={handleSubmitFeedback} className="space-y-3 border-t border-zinc-800 pt-4">
                            {attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {attachments.map((att, i) => (
                                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-300">
                                            <Paperclip className="w-3 h-3" />
                                            {att.name}
                                            <button type="button" onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} className="ml-1 text-zinc-500 hover:text-zinc-300">×</button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Attachment name"
                                    value={newAttachment.name}
                                    onChange={(e) => setNewAttachment({ ...newAttachment, name: e.target.value })}
                                    className="flex-1 bg-zinc-800/50 border-zinc-700 text-sm"
                                />
                                <Input
                                    placeholder="URL"
                                    value={newAttachment.url}
                                    onChange={(e) => setNewAttachment({ ...newAttachment, url: e.target.value })}
                                    className="flex-1 bg-zinc-800/50 border-zinc-700 text-sm"
                                />
                                <Button type="button" variant="ghost" size="icon" onClick={handleAddAttachment} className="text-zinc-400">
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </div>
                            <div className="flex gap-2">
                                <Textarea
                                    placeholder="Type your feedback..."
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    className="flex-1 bg-zinc-800/50 border-zinc-700 resize-none"
                                    rows={2}
                                />
                                <Button type="submit" disabled={submitting || !commentText.trim()} className="bg-blue-600 hover:bg-blue-500 self-end">
                                    <Send className="w-4 h-4" />
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>

            {/* Video Player Modal */}
            <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
                <DialogContent className="bg-zinc-900 border-zinc-800 max-w-4xl w-full p-0">
                    <DialogHeader className="p-4 pb-0">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-zinc-100 font-mono">{videoTitle}</DialogTitle>
                            <Button variant="ghost" size="icon" onClick={() => setVideoOpen(false)} className="text-zinc-400">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </DialogHeader>
                    <div className="p-4 pt-2">
                        <div className="relative w-full bg-black rounded-lg overflow-hidden" style={{ paddingTop: '56.25%' }}>
                            <iframe
                                src={videoUrl}
                                className="absolute inset-0 w-full h-full"
                                allow="autoplay"
                                allowFullScreen
                                title={videoTitle}
                            />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Shot Modal */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-zinc-100">Edit Shot — {shot.shot_id}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Description</Label>
                            <Textarea
                                value={editForm.description}
                                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                placeholder="Describe the shot..."
                                className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                rows={2}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Complexity</Label>
                                <Select value={editForm.complexity} onValueChange={(v) => setEditForm({ ...editForm, complexity: v })}>
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
                                    value={editForm.frames}
                                    onChange={(e) => setEditForm({ ...editForm, frames: e.target.value })}
                                    className="bg-zinc-950 border-zinc-800 text-zinc-100"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Approved Layout Version</Label>
                            <Input
                                value={editForm.approved_layout_version}
                                onChange={(e) => setEditForm({ ...editForm, approved_layout_version: e.target.value })}
                                placeholder="e.g. V001"
                                className="bg-zinc-950 border-zinc-800 text-zinc-100"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300 flex items-center gap-2">
                                <Film className="w-4 h-4 text-purple-400" />
                                Playblast Link (Google Drive)
                            </Label>
                            <Input
                                value={editForm.playblast_link}
                                onChange={(e) => setEditForm({ ...editForm, playblast_link: e.target.value })}
                                placeholder="https://drive.google.com/file/d/..."
                                className="bg-zinc-950 border-zinc-800 text-zinc-100"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-amber-400" />
                                Scene File Link (Google Drive)
                            </Label>
                            <Input
                                value={editForm.scene_link}
                                onChange={(e) => setEditForm({ ...editForm, scene_link: e.target.value })}
                                placeholder="https://drive.google.com/file/d/..."
                                className="bg-zinc-950 border-zinc-800 text-zinc-100"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Feedback Reference Link</Label>
                            <Input
                                value={editForm.feedback_link}
                                onChange={(e) => setEditForm({ ...editForm, feedback_link: e.target.value })}
                                placeholder="https://..."
                                className="bg-zinc-950 border-zinc-800 text-zinc-100"
                            />
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <Button variant="ghost" onClick={() => setEditOpen(false)} className="text-zinc-400">Cancel</Button>
                            <Button onClick={handleSaveEdit} disabled={saving} className="bg-blue-600 hover:bg-blue-500">
                                {saving ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
