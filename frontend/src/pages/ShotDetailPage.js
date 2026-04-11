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
import StatusBadge from '../components/StatusBadge';
import {
    ArrowLeft,
    Send,
    Link as LinkIcon,
    Paperclip,
    FileVideo,
    FileText,
    Calendar,
    User,
    Clock,
    ExternalLink,
    Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const statusOptions = [
    { value: 'not_started', label: 'Not Started' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'retake', label: 'Retake' },
    { value: 'approved', label: 'Approved' },
];

export default function ShotDetailPage() {
    const { projectId, shotId } = useParams();
    const { user, isAdmin, isProductionManager, isSupervisor, isAnimator } = useAuth();
    const canManageShots = isAdmin || isProductionManager || isSupervisor;
    const navigate = useNavigate();

    const [shot, setShot] = useState(null);
    const [feedback, setFeedback] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [commentText, setCommentText] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [newFile, setNewFile] = useState({ name: '', url: '', file_type: '' });
    const [showAddFile, setShowAddFile] = useState(false);

    useEffect(() => {
        loadData();
    }, [projectId, shotId]);

    const loadData = async () => {
        try {
            const [shotRes, feedbackRes] = await Promise.all([
                getShot(projectId, shotId),
                getFeedback(projectId, shotId),
            ]);
            setShot(shotRes.data);
            setFeedback(feedbackRes.data);
        } catch (error) {
            toast.error('Failed to load shot details');
            navigate(`/projects/${projectId}`);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (status) => {
        try {
            await updateShot(projectId, shotId, { status });
            toast.success('Status updated');
            loadData();
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    const handleSubmitFeedback = async (e) => {
        e.preventDefault();
        if (!commentText.trim()) {
            toast.error('Please enter a comment');
            return;
        }

        setSubmitting(true);
        try {
            await createFeedback(projectId, shotId, {
                comment: commentText,
                attachments: attachments,
            });
            toast.success('Feedback submitted');
            setCommentText('');
            setAttachments([]);
            loadData();
        } catch (error) {
            toast.error('Failed to submit feedback');
        } finally {
            setSubmitting(false);
        }
    };

    const handleAddAttachment = () => {
        if (!newFile.name || !newFile.url) {
            toast.error('Please fill in file name and URL');
            return;
        }
        setAttachments([...attachments, { ...newFile }]);
        setNewFile({ name: '', url: '', file_type: '' });
    };

    const handleAddFileLink = async () => {
        if (!newFile.name || !newFile.url) {
            toast.error('Please fill in file name and URL');
            return;
        }

        try {
            await addFileLink(projectId, shotId, newFile);
            toast.success('File link added');
            setNewFile({ name: '', url: '', file_type: '' });
            setShowAddFile(false);
            loadData();
        } catch (error) {
            toast.error('Failed to add file link');
        }
    };

    const getFileIcon = (fileType) => {
        if (fileType?.includes('video') || fileType?.includes('mov')) {
            return <FileVideo className="w-4 h-4 text-purple-400" />;
        }
        return <FileText className="w-4 h-4 text-blue-400" />;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!shot) return null;

    const canChangeStatus = canManageShots || (isAnimator && shot.assigned_to === user?.id);
    const animatorStatusOptions = statusOptions.filter(s => ['in_progress', 'submitted'].includes(s.value));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate(`/projects/${projectId}`)}
                    className="text-zinc-400 hover:text-zinc-100"
                    data-testid="back-button"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="flex-1">
                    <h1 className="text-3xl font-bold text-zinc-50 font-['Chivo']">{shot.shot_id}</h1>
                    <p className="text-zinc-400 mt-1">{shot.description || 'No description'}</p>
                </div>
                {canChangeStatus && (
                    <Select value={shot.status} onValueChange={handleStatusChange}>
                        <SelectTrigger className="w-40" data-testid="status-select">
                            <StatusBadge status={shot.status} />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800">
                            {(isAnimator ? animatorStatusOptions : statusOptions).map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Shot Details */}
                <div className="space-y-6">
                    {/* Shot Info */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-zinc-100">Shot Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 rounded-lg bg-zinc-800/50">
                                    <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1">
                                        <Clock className="w-3 h-3" />
                                        Frame Range
                                    </div>
                                    <p className="text-zinc-100 font-medium">{shot.frame_start} - {shot.frame_end}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-zinc-800/50">
                                    <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1">
                                        <Calendar className="w-3 h-3" />
                                        Deadline
                                    </div>
                                    <p className="text-zinc-100 font-medium">
                                        {shot.deadline ? format(new Date(shot.deadline), 'MMM d, yyyy') : 'Not set'}
                                    </p>
                                </div>
                                <div className="p-3 rounded-lg bg-zinc-800/50">
                                    <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1">
                                        <User className="w-3 h-3" />
                                        Assigned To
                                    </div>
                                    <p className="text-zinc-100 font-medium">{shot.assigned_to_name || 'Unassigned'}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-zinc-800/50">
                                    <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1">
                                        Status
                                    </div>
                                    <StatusBadge status={shot.status} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* File Links */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-zinc-100">File Links</CardTitle>
                            {(canManageShots || (isAnimator && shot.assigned_to === user?.id)) && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowAddFile(!showAddFile)}
                                    className="text-blue-400"
                                    data-testid="add-file-button"
                                >
                                    <Plus className="w-4 h-4 mr-1" />
                                    Add File
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {showAddFile && (
                                <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 space-y-3">
                                    <Input
                                        placeholder="File name (e.g., animation_v1.mov)"
                                        value={newFile.name}
                                        onChange={(e) => setNewFile({ ...newFile, name: e.target.value })}
                                        className="bg-zinc-900 border-zinc-700"
                                        data-testid="file-name-input"
                                    />
                                    <Input
                                        placeholder="OneDrive URL"
                                        value={newFile.url}
                                        onChange={(e) => setNewFile({ ...newFile, url: e.target.value })}
                                        className="bg-zinc-900 border-zinc-700"
                                        data-testid="file-url-input"
                                    />
                                    <Select
                                        value={newFile.file_type}
                                        onValueChange={(v) => setNewFile({ ...newFile, file_type: v })}
                                    >
                                        <SelectTrigger className="bg-zinc-900 border-zinc-700" data-testid="file-type-select">
                                            <SelectValue placeholder="File type" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            <SelectItem value="video">Video (.mov, .mp4)</SelectItem>
                                            <SelectItem value="project">Project File</SelectItem>
                                            <SelectItem value="image">Image</SelectItem>
                                            <SelectItem value="other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        onClick={handleAddFileLink}
                                        className="w-full bg-blue-600 hover:bg-blue-500"
                                        data-testid="submit-file-button"
                                    >
                                        Add File Link
                                    </Button>
                                </div>
                            )}

                            {shot.file_links?.length === 0 ? (
                                <div className="dropzone">
                                    <LinkIcon className="w-8 h-8 text-zinc-600 mb-2" />
                                    <p className="text-zinc-500">No files uploaded yet</p>
                                    <p className="text-zinc-600 text-xs mt-1">Add OneDrive links to share files</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {shot.file_links.map((file, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-800"
                                        >
                                            <div className="flex items-center gap-3">
                                                {getFileIcon(file.file_type)}
                                                <div>
                                                    <p className="text-sm font-medium text-zinc-100">{file.name}</p>
                                                    <p className="text-xs text-zinc-500">
                                                        by {file.uploaded_by_name} • {format(new Date(file.uploaded_at), 'MMM d, HH:mm')}
                                                    </p>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => window.open(file.url, '_blank')}
                                                className="text-blue-400"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column - Feedback */}
                <Card className="bg-zinc-900 border-zinc-800 flex flex-col h-fit max-h-[calc(100vh-200px)]">
                    <CardHeader>
                        <CardTitle className="text-zinc-100">Feedback Thread</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col min-h-0">
                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
                            {feedback.length === 0 ? (
                                <div className="text-center py-8 text-zinc-500">
                                    <p>No feedback yet</p>
                                    <p className="text-xs mt-1">Start the conversation</p>
                                </div>
                            ) : (
                                feedback.map((item) => (
                                    <div
                                        key={item.id}
                                        className={`chat-bubble ${item.user_id === user?.id ? 'ml-8' : 'mr-8'}`}
                                        data-testid={`feedback-${item.id}`}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300">
                                                {item.user_name?.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-xs font-medium text-zinc-200">{item.user_name}</span>
                                            <span className="text-xs text-zinc-500 capitalize">({item.user_role})</span>
                                            <span className="text-xs text-zinc-600 ml-auto">
                                                {format(new Date(item.created_at), 'MMM d, HH:mm')}
                                            </span>
                                        </div>
                                        <p className="text-sm text-zinc-300">{item.comment}</p>
                                        {item.attachments?.length > 0 && (
                                            <div className="mt-2 space-y-1">
                                                {item.attachments.map((att, i) => (
                                                    <a
                                                        key={i}
                                                        href={att.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-2 text-xs text-blue-400 hover:underline"
                                                    >
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

                        {/* Input */}
                        <form onSubmit={handleSubmitFeedback} className="space-y-3 border-t border-zinc-800 pt-4">
                            {attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {attachments.map((att, i) => (
                                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-300">
                                            <Paperclip className="w-3 h-3" />
                                            {att.name}
                                            <button
                                                type="button"
                                                onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))}
                                                className="ml-1 text-zinc-500 hover:text-zinc-300"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700">
                                <Input
                                    placeholder="Add attachment URL"
                                    value={newFile.name ? `${newFile.name}: ${newFile.url}` : ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val.includes(':')) {
                                            const [name, url] = val.split(':').map(s => s.trim());
                                            setNewFile({ name, url, file_type: '' });
                                        }
                                    }}
                                    className="flex-1 bg-transparent border-0 focus-visible:ring-0 text-sm"
                                    data-testid="attachment-input"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleAddAttachment}
                                    className="text-zinc-400"
                                    data-testid="add-attachment-button"
                                >
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
                                    data-testid="feedback-input"
                                />
                                <Button
                                    type="submit"
                                    disabled={submitting || !commentText.trim()}
                                    className="bg-blue-600 hover:bg-blue-500 self-end"
                                    data-testid="submit-feedback-button"
                                >
                                    <Send className="w-4 h-4" />
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
