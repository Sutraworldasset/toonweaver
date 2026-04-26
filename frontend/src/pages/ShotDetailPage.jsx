import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getShot, getFeedback, createFeedback, updateShot } from '../lib/api';
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
    ArrowLeft, Send, Paperclip, FileVideo, FileText,
    Calendar, User, Clock, ExternalLink, Plus, Play,
    Download, Edit, X, Film, Tag, Pencil, Square,
    ArrowRight, Minus, RotateCcw, Camera, Check,
    ZoomIn, Circle, Type, Eraser,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

// ============ DRIVE UTILS ============
function extractDriveFileId(url) {
    if (!url) return null;
    const patterns = [/\/file\/d\/([a-zA-Z0-9_-]+)/, /id=([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/];
    for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
    return null;
}
function getDriveThumbnail(url) { const id = extractDriveFileId(url); return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w400` : null; }
function getDriveEmbed(url) { const id = extractDriveFileId(url); return id ? `https://drive.google.com/file/d/${id}/preview` : null; }
function getDriveDownload(url) { const id = extractDriveFileId(url); return id ? `https://drive.google.com/uc?export=download&id=${id}` : null; }

// ============ CONSTANTS ============
const COMPLEXITY_COLORS = { A: '#22c55e', B: '#f59e0b', C: '#ef4444' };
const DEFAULT_STATUSES = [
    { value: 'yts', label: 'YTS', color: '#71717a' },
    { value: 'in_progress', label: 'In Progress', color: '#3b82f6' },
    { value: 'for_review', label: 'For Review', color: '#a855f7' },
    { value: 'internal_review', label: 'Internal Review', color: '#f59e0b' },
    { value: 'retake', label: 'Retake', color: '#ef4444' },
    { value: 'hold', label: 'Hold', color: '#f97316' },
    { value: 'approved', label: 'Approved', color: '#22c55e' },
];
const DRAW_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ffffff', '#000000'];
const DRAW_TOOLS = [
    { id: 'pen', icon: Pencil, label: 'Pen' },
    { id: 'arrow', icon: ArrowRight, label: 'Arrow' },
    { id: 'rect', icon: Square, label: 'Rectangle' },
    { id: 'circle', icon: Circle, label: 'Circle' },
    { id: 'line', icon: Minus, label: 'Line' },
    { id: 'eraser', icon: Eraser, label: 'Eraser' },
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

// ============ ANNOTATION CANVAS COMPONENT ============
function AnnotationCanvas({ imageData, onSave, onCancel, fps = 25, frameNumber = 0 }) {
    const canvasRef = useRef(null);
    const [tool, setTool] = useState('pen');
    const [color, setColor] = useState('#ef4444');
    const [brushSize, setBrushSize] = useState(3);
    const [drawing, setDrawing] = useState(false);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [history, setHistory] = useState([]);
    const [currentPath, setCurrentPath] = useState([]);
    const imgRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !imageData) return;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            imgRef.current = img;
            setHistory([ctx.getImageData(0, 0, canvas.width, canvas.height)]);
        };
        img.src = imageData;
    }, [imageData]);

    const getPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    };

    const redrawBase = (ctx) => {
        if (imgRef.current) ctx.drawImage(imgRef.current, 0, 0);
    };

    const drawShape = (ctx, tool, start, end, color, size, path) => {
        ctx.strokeStyle = tool === 'eraser' ? '#000' : color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
        else ctx.globalCompositeOperation = 'source-over';

        ctx.beginPath();
        if (tool === 'pen' || tool === 'eraser') {
            if (path.length < 2) return;
            ctx.moveTo(path[0].x, path[0].y);
            path.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.stroke();
        } else if (tool === 'line') {
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        } else if (tool === 'rect') {
            ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
        } else if (tool === 'circle') {
            const rx = Math.abs(end.x - start.x) / 2;
            const ry = Math.abs(end.y - start.y) / 2;
            const cx = start.x + (end.x - start.x) / 2;
            const cy = start.y + (end.y - start.y) / 2;
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (tool === 'arrow') {
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            // Arrowhead
            const angle = Math.atan2(end.y - start.y, end.x - start.x);
            const headLen = 15 + size * 2;
            ctx.beginPath();
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(end.x - headLen * Math.cos(angle - 0.4), end.y - headLen * Math.sin(angle - 0.4));
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(end.x - headLen * Math.cos(angle + 0.4), end.y - headLen * Math.sin(angle + 0.4));
            ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
    };

    const handleMouseDown = (e) => {
        e.preventDefault();
        const pos = getPos(e);
        setDrawing(true);
        setStartPos(pos);
        setCurrentPath([pos]);
    };

    const handleMouseMove = (e) => {
        e.preventDefault();
        if (!drawing) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const pos = getPos(e);
        const newPath = [...currentPath, pos];
        setCurrentPath(newPath);

        if (tool === 'pen' || tool === 'eraser') {
            // Restore last saved state
            if (history.length > 0) ctx.putImageData(history[history.length - 1], 0, 0);
            drawShape(ctx, tool, startPos, pos, color, brushSize, newPath);
        } else {
            // For shapes, restore base + redraw shape preview
            if (history.length > 0) ctx.putImageData(history[history.length - 1], 0, 0);
            drawShape(ctx, tool, startPos, pos, color, brushSize, newPath);
        }
    };

    const handleMouseUp = (e) => {
        e.preventDefault();
        if (!drawing) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const pos = getPos(e);
        drawShape(ctx, tool, startPos, pos, color, brushSize, currentPath);
        setHistory(prev => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
        setDrawing(false);
        setCurrentPath([]);
    };

    const handleUndo = () => {
        if (history.length <= 1) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const newHistory = history.slice(0, -1);
        setHistory(newHistory);
        ctx.putImageData(newHistory[newHistory.length - 1], 0, 0);
    };

    const handleSave = () => {
        const canvas = canvasRef.current;
        // Compress to reasonable size
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        onSave(dataUrl);
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap p-2 rounded-lg bg-zinc-800 border border-zinc-700">
                {/* Tools */}
                <div className="flex items-center gap-1">
                    {DRAW_TOOLS.map(t => (
                        <button key={t.id} title={t.label}
                            onClick={() => setTool(t.id)}
                            className={`p-1.5 rounded transition-colors ${tool === t.id ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700'}`}>
                            <t.icon className="w-4 h-4" />
                        </button>
                    ))}
                </div>

                <div className="w-px h-6 bg-zinc-700" />

                {/* Colors */}
                <div className="flex items-center gap-1">
                    {DRAW_COLORS.map(c => (
                        <button key={c} onClick={() => setColor(c)}
                            className={`w-5 h-5 rounded-full border-2 transition-transform ${color === c ? 'border-white scale-125' : 'border-transparent'}`}
                            style={{ backgroundColor: c }} />
                    ))}
                    <input type="color" value={color} onChange={e => setColor(e.target.value)}
                        className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent" title="Custom color" />
                </div>

                <div className="w-px h-6 bg-zinc-700" />

                {/* Brush size */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">Size</span>
                    <input type="range" min="1" max="20" value={brushSize}
                        onChange={e => setBrushSize(parseInt(e.target.value))}
                        className="w-16 accent-blue-500" />
                    <span className="text-xs text-zinc-400 w-4">{brushSize}</span>
                </div>

                <div className="w-px h-6 bg-zinc-700" />

                <button onClick={handleUndo} className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700" title="Undo">
                    <RotateCcw className="w-4 h-4" />
                </button>
            </div>

            {/* Canvas */}
            <div className="relative rounded-lg overflow-hidden bg-black border border-zinc-700 cursor-crosshair">
                <canvas
                    ref={canvasRef}
                    className="w-full block"
                    style={{ touchAction: 'none' }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleMouseDown}
                    onTouchMove={handleMouseMove}
                    onTouchEnd={handleMouseUp}
                />
                {/* Frame number badge */}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-xs text-yellow-400 font-mono">
                    Frame {frameNumber} — {(frameNumber / fps).toFixed(2)}s
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={onCancel} className="text-zinc-400">Cancel</Button>
                <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-500">
                    <Check className="w-4 h-4 mr-2" />
                    Use Annotation
                </Button>
            </div>
        </div>
    );
}

// ============ MAIN COMPONENT ============
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

    // Video + annotation
    const [reviewOpen, setReviewOpen] = useState(false);
    const [annotateMode, setAnnotateMode] = useState(false);
    const [capturedFrame, setCapturedFrame] = useState(null);
    const [annotation, setAnnotation] = useState(null); // base64 annotated image
    const [currentFrame, setCurrentFrame] = useState(0);
    const iframeRef = useRef(null);

    // Simple video player state
    const [videoOpen, setVideoOpen] = useState(false);
    const [videoUrl, setVideoUrl] = useState('');

    // Edit
    const [editOpen, setEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({ description: '', complexity: '', frames: '', approved_layout_version: '', feedback_link: '', playblast_link: '', scene_link: '' });

    // Feedback
    const [commentText, setCommentText] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [newAttachment, setNewAttachment] = useState({ name: '', url: '' });

    // Enlarged annotation view
    const [enlargedImage, setEnlargedImage] = useState(null);

    useEffect(() => { loadData(); }, [projectId, episodeId, shotId]);

    const loadData = async () => {
        try {
            const [shotRes, feedbackRes] = await Promise.all([
                getShot(projectId, episodeId, shotId),
                getFeedback(projectId, episodeId, shotId),
            ]);
            setShot(shotRes.data);
            setFeedback(Array.isArray(feedbackRes.data) ? feedbackRes.data : []);
            const s = shotRes.data;
            setEditForm({ description: s.description || '', complexity: s.complexity || '', frames: s.frames || '', approved_layout_version: s.approved_layout_version || '', feedback_link: s.feedback_link || '', playblast_link: s.playblast_link || '', scene_link: s.scene_link || '' });
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
        } catch { toast.error('Failed to update status'); }
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
        } catch { toast.error('Failed to update shot'); }
        finally { setSaving(false); }
    };

    // Capture current frame from iframe using html2canvas fallback
    // Since Google Drive iframe blocks direct canvas capture, we capture the thumbnail
    // and let supervisor annotate on it, noting the frame number manually
    const handleCaptureFrame = () => {
        // Use the playblast thumbnail as base for annotation
        // Supervisor types in the frame number they want to annotate
        const thumb = getDriveThumbnail(shot.playblast_link);
        if (!thumb) {
            toast.error('No playblast available to annotate');
            return;
        }

        // Load thumbnail into a canvas for annotation
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width || 640;
            canvas.height = img.height || 360;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            setCapturedFrame(dataUrl);
            setAnnotateMode(true);
        };
        img.onerror = () => {
            // If thumbnail can't be loaded cross-origin, create a blank slate with shot info
            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 720;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#18181b';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#3f3f46';
            ctx.fillRect(0, 0, canvas.width, 2);
            ctx.fillRect(0, canvas.height - 2, canvas.width, 2);
            ctx.font = 'bold 32px monospace';
            ctx.fillStyle = '#71717a';
            ctx.textAlign = 'center';
            ctx.fillText(shot.shot_id, canvas.width / 2, canvas.height / 2 - 20);
            ctx.font = '18px monospace';
            ctx.fillStyle = '#52525b';
            ctx.fillText(`Frame ${currentFrame} — Annotation`, canvas.width / 2, canvas.height / 2 + 20);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            setCapturedFrame(dataUrl);
            setAnnotateMode(true);
        };
        img.src = thumb;
    };

    const handleAnnotationSave = (annotatedDataUrl) => {
        setAnnotation(annotatedDataUrl);
        setAnnotateMode(false);
        toast.success('Annotation ready — add your comment and submit');
    };

    const handleSubmitFeedback = async (e) => {
        e.preventDefault();
        if (!commentText.trim() && !annotation) { toast.error('Please enter a comment or add an annotation'); return; }
        setSubmitting(true);
        try {
            const feedbackAttachments = [...attachments];
            if (annotation) {
                feedbackAttachments.push({
                    name: `annotation_frame${currentFrame}_${shot.shot_id}`,
                    url: annotation,         // base64 stored directly
                    file_type: 'annotation',
                    frame: currentFrame,
                    is_annotation: true,
                });
            }
            await createFeedback(projectId, episodeId, shotId, {
                comment: commentText || `[Annotation — Frame ${currentFrame}]`,
                attachments: feedbackAttachments,
                frame_number: annotation ? currentFrame : null,
            });
            toast.success('Feedback submitted');
            setCommentText('');
            setAttachments([]);
            setAnnotation(null);
            setCapturedFrame(null);
            loadData();
        } catch { toast.error('Failed to submit feedback'); }
        finally { setSubmitting(false); }
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
    const canAnnotate = isClient || isSupervisor; // Only supervisors and client annotate

    const playblastThumb = getDriveThumbnail(shot.playblast_link);
    const sceneDownload = getDriveDownload(shot.scene_link);
    const allStatuses = DEFAULT_STATUSES;
    const artistStatuses = allStatuses.filter(s => ['in_progress', 'for_review'].includes(s.value));
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
                                {statusOptions.map(opt => (
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

                    {/* Playblast */}
                    {shot.playblast_link && (
                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-zinc-100 flex items-center gap-2">
                                    <Film className="w-5 h-5 text-purple-400" />
                                    Playblast
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="relative rounded-lg overflow-hidden bg-zinc-800 cursor-pointer group"
                                    onClick={() => { setVideoUrl(getDriveEmbed(shot.playblast_link)); setVideoOpen(true); }}>
                                    {playblastThumb ? (
                                        <img src={playblastThumb} alt={shot.shot_id}
                                            className="w-full aspect-video object-cover group-hover:opacity-80 transition-opacity"
                                            onError={e => { e.target.style.display = 'none'; }} />
                                    ) : (
                                        <div className="w-full aspect-video flex items-center justify-center bg-zinc-800">
                                            <FileVideo className="w-16 h-16 text-zinc-600" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center group-hover:bg-black/80 transition-colors">
                                            <Play className="w-6 h-6 text-white ml-1" />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Button onClick={() => { setVideoUrl(getDriveEmbed(shot.playblast_link)); setVideoOpen(true); }}
                                        className="flex-1 bg-purple-600 hover:bg-purple-500">
                                        <Play className="w-4 h-4 mr-2" />
                                        Play
                                    </Button>
                                    {canAnnotate && (
                                        <Button onClick={() => { setReviewOpen(true); }}
                                            variant="outline" className="border-amber-600/50 text-amber-400 hover:bg-amber-500/10">
                                            <Pencil className="w-4 h-4 mr-2" />
                                            Annotate
                                        </Button>
                                    )}
                                    <Button variant="outline" onClick={() => window.open(shot.playblast_link, '_blank')}
                                        className="border-zinc-700 text-zinc-300">
                                        <ExternalLink className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Shot Details */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader><CardTitle className="text-zinc-100">Shot Details</CardTitle></CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { icon: Clock, label: 'Frames', value: shot.frames || '-' },
                                    { label: 'Duration', value: shot.duration_seconds ? `${shot.duration_seconds}s` : '-' },
                                    { icon: Tag, label: 'Layout Ver.', value: shot.approved_layout_version || '-' },
                                    { icon: Calendar, label: 'Deadline', value: shot.deadline ? format(new Date(shot.deadline), 'MMM d, yyyy') : 'Not set' },
                                    { icon: User, label: 'Artist', value: shot.assigned_to_name || 'Unassigned' },
                                    { label: 'FPS', value: shot.fps || 25 },
                                ].map((item, i) => (
                                    <div key={i} className="p-3 rounded-lg bg-zinc-800/50">
                                        <p className="text-zinc-500 text-xs mb-1">{item.label}</p>
                                        <p className="text-zinc-100 font-medium">{item.value}</p>
                                    </div>
                                ))}
                            </div>

                            {shot.scene_link && (canManage || isAssignedArtist) && (
                                <div className="mt-4 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                                    <p className="text-zinc-500 text-xs mb-2">Scene File</p>
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-amber-400" />
                                        <span className="text-zinc-300 text-sm flex-1 truncate">{shot.shot_id} scene</span>
                                        {sceneDownload && (
                                            <Button size="sm" onClick={() => window.open(sceneDownload, '_blank')}
                                                className="bg-amber-600 hover:bg-amber-500">
                                                <Download className="w-3 h-3 mr-1" />
                                                Download
                                            </Button>
                                        )}
                                        {canManage && (
                                            <Button size="sm" variant="outline" onClick={() => window.open(shot.scene_link, '_blank')} className="border-zinc-700 text-zinc-300">
                                                <ExternalLink className="w-3 h-3" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
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
                                feedback.map((item) => {
                                    const annotationAtt = item.attachments?.find(a => a.is_annotation);
                                    const otherAtts = item.attachments?.filter(a => !a.is_annotation) || [];
                                    return (
                                        <div key={item.id}
                                            className={`p-3 rounded-lg ${item.user_id === user?.id ? 'bg-blue-600/10 border border-blue-500/20 ml-4' : 'bg-zinc-800/50 border border-zinc-700 mr-4'}`}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300">
                                                    {item.user_name?.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="text-xs font-medium text-zinc-200">{item.user_name}</span>
                                                <span className="text-xs text-zinc-500 capitalize">({item.user_role?.replace('_', ' ')})</span>
                                                {item.frame_number != null && (
                                                    <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-xs font-mono">
                                                        F{item.frame_number}
                                                    </span>
                                                )}
                                                <span className="text-xs text-zinc-600 ml-auto">
                                                    {format(new Date(item.created_at), 'MMM d, HH:mm')}
                                                </span>
                                            </div>
                                            <p className="text-sm text-zinc-300">{item.comment}</p>

                                            {/* Annotation thumbnail */}
                                            {annotationAtt && (
                                                <div className="mt-2">
                                                    <img
                                                        src={annotationAtt.url}
                                                        alt="Annotation"
                                                        className="w-full rounded-lg border border-zinc-600 cursor-pointer hover:opacity-90 transition-opacity"
                                                        onClick={() => setEnlargedImage(annotationAtt.url)}
                                                    />
                                                    <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
                                                        <Camera className="w-3 h-3" />
                                                        Click to enlarge · Frame {annotationAtt.frame}
                                                    </p>
                                                </div>
                                            )}

                                            {/* Other attachments */}
                                            {otherAtts.length > 0 && (
                                                <div className="mt-2 space-y-1">
                                                    {otherAtts.map((att, i) => (
                                                        <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                                                            className="flex items-center gap-2 text-xs text-blue-400 hover:underline">
                                                            <Paperclip className="w-3 h-3" />
                                                            {att.name}
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Annotation preview before submit */}
                        {annotation && (
                            <div className="mb-3 p-2 rounded-lg border border-amber-500/40 bg-amber-500/10">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-amber-400 flex items-center gap-1">
                                        <Camera className="w-3 h-3" />
                                        Annotation attached (Frame {currentFrame})
                                    </span>
                                    <button onClick={() => setAnnotation(null)} className="text-zinc-500 hover:text-zinc-300">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <img src={annotation} alt="Annotation preview" className="w-full rounded border border-zinc-700 cursor-pointer"
                                    onClick={() => setEnlargedImage(annotation)} />
                            </div>
                        )}

                        {/* Feedback input */}
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
                                <Input placeholder="Attachment name" value={newAttachment.name}
                                    onChange={e => setNewAttachment({ ...newAttachment, name: e.target.value })}
                                    className="flex-1 bg-zinc-800/50 border-zinc-700 text-sm" />
                                <Input placeholder="URL" value={newAttachment.url}
                                    onChange={e => setNewAttachment({ ...newAttachment, url: e.target.value })}
                                    className="flex-1 bg-zinc-800/50 border-zinc-700 text-sm" />
                                <Button type="button" variant="ghost" size="icon" onClick={handleAddAttachment} className="text-zinc-400">
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </div>
                            <div className="flex gap-2">
                                <Textarea
                                    placeholder={annotation ? "Add a comment about this annotation..." : "Type your feedback..."}
                                    value={commentText}
                                    onChange={e => setCommentText(e.target.value)}
                                    className="flex-1 bg-zinc-800/50 border-zinc-700 resize-none"
                                    rows={2}
                                />
                                <Button type="submit" disabled={submitting || (!commentText.trim() && !annotation)}
                                    className="bg-blue-600 hover:bg-blue-500 self-end">
                                    <Send className="w-4 h-4" />
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>

            {/* Simple Video Player Modal */}
            <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
                <DialogContent className="bg-zinc-900 border-zinc-800 max-w-4xl w-full p-0">
                    <DialogHeader className="p-4 pb-0">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-zinc-100 font-mono">{shot.shot_id}</DialogTitle>
                            <Button variant="ghost" size="icon" onClick={() => setVideoOpen(false)} className="text-zinc-400">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </DialogHeader>
                    <div className="p-4 pt-2">
                        <div className="relative w-full bg-black rounded-lg overflow-hidden" style={{ paddingTop: '56.25%' }}>
                            <iframe src={videoUrl} className="absolute inset-0 w-full h-full"
                                allow="autoplay" allowFullScreen title={shot.shot_id} />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Annotation Review Modal */}
            <Dialog open={reviewOpen} onOpenChange={(open) => { setReviewOpen(open); if (!open) { setAnnotateMode(false); setCapturedFrame(null); } }}>
                <DialogContent className="bg-zinc-900 border-zinc-800 max-w-5xl w-full max-h-[95vh] overflow-y-auto">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-zinc-100 flex items-center gap-2">
                                <Pencil className="w-5 h-5 text-amber-400" />
                                Annotate — {shot.shot_id}
                            </DialogTitle>
                            <Button variant="ghost" size="icon" onClick={() => setReviewOpen(false)} className="text-zinc-400">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </DialogHeader>

                    <div className="space-y-4 mt-2">
                        {!annotateMode ? (
                            /* Step 1 — Watch playblast, set frame number, capture */
                            <div className="space-y-4">
                                <p className="text-sm text-zinc-400">
                                    Watch the playblast, note the frame you want to annotate, enter it below, then click Capture Frame.
                                </p>

                                {/* Embedded player */}
                                <div className="relative w-full bg-black rounded-lg overflow-hidden" style={{ paddingTop: '56.25%' }}>
                                    <iframe
                                        ref={iframeRef}
                                        src={getDriveEmbed(shot.playblast_link)}
                                        className="absolute inset-0 w-full h-full"
                                        allow="autoplay"
                                        allowFullScreen
                                        title={shot.shot_id}
                                    />
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <Label className="text-zinc-300 whitespace-nowrap">Frame Number</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            max={shot.frames || 9999}
                                            value={currentFrame}
                                            onChange={e => setCurrentFrame(parseInt(e.target.value) || 0)}
                                            className="w-24 bg-zinc-800 border-zinc-700 text-zinc-100"
                                        />
                                        <span className="text-zinc-500 text-sm">
                                            = {(currentFrame / (shot.fps || 25)).toFixed(2)}s
                                        </span>
                                    </div>
                                    <Button onClick={handleCaptureFrame} className="bg-amber-600 hover:bg-amber-500">
                                        <Camera className="w-4 h-4 mr-2" />
                                        Capture & Annotate
                                    </Button>
                                </div>

                                <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700 text-xs text-zinc-400 space-y-1">
                                    <p>💡 <strong className="text-zinc-300">How to annotate:</strong></p>
                                    <p>1. Play the video and pause at the frame you want to review</p>
                                    <p>2. Note the frame number (visible in the player or count manually)</p>
                                    <p>3. Enter the frame number above and click "Capture & Annotate"</p>
                                    <p>4. Draw your notes on the captured frame</p>
                                    <p>5. Add a comment and submit — the artist will see your annotation</p>
                                </div>
                            </div>
                        ) : (
                            /* Step 2 — Draw on captured frame */
                            <AnnotationCanvas
                                imageData={capturedFrame}
                                fps={shot.fps || 25}
                                frameNumber={currentFrame}
                                onSave={(dataUrl) => {
                                    handleAnnotationSave(dataUrl);
                                    setReviewOpen(false);
                                }}
                                onCancel={() => setAnnotateMode(false)}
                            />
                        )}
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
                            <Textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                placeholder="Describe the shot..." className="bg-zinc-950 border-zinc-800 text-zinc-100" rows={2} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Complexity</Label>
                                <Select value={editForm.complexity} onValueChange={v => setEditForm({ ...editForm, complexity: v })}>
                                    <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800">
                                        <SelectItem value="A">A (Simple)</SelectItem>
                                        <SelectItem value="B">B (Medium)</SelectItem>
                                        <SelectItem value="C">C (Complex)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Frames</Label>
                                <Input type="number" value={editForm.frames} onChange={e => setEditForm({ ...editForm, frames: e.target.value })}
                                    className="bg-zinc-950 border-zinc-800 text-zinc-100" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Approved Layout Version</Label>
                            <Input value={editForm.approved_layout_version} onChange={e => setEditForm({ ...editForm, approved_layout_version: e.target.value })}
                                placeholder="e.g. V001" className="bg-zinc-950 border-zinc-800 text-zinc-100" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300 flex items-center gap-2"><Film className="w-4 h-4 text-purple-400" />Playblast Link</Label>
                            <Input value={editForm.playblast_link} onChange={e => setEditForm({ ...editForm, playblast_link: e.target.value })}
                                placeholder="https://drive.google.com/file/d/..." className="bg-zinc-950 border-zinc-800 text-zinc-100" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300 flex items-center gap-2"><FileText className="w-4 h-4 text-amber-400" />Scene File Link</Label>
                            <Input value={editForm.scene_link} onChange={e => setEditForm({ ...editForm, scene_link: e.target.value })}
                                placeholder="https://drive.google.com/file/d/..." className="bg-zinc-950 border-zinc-800 text-zinc-100" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Feedback Reference Link</Label>
                            <Input value={editForm.feedback_link} onChange={e => setEditForm({ ...editForm, feedback_link: e.target.value })}
                                placeholder="https://..." className="bg-zinc-950 border-zinc-800 text-zinc-100" />
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

            {/* Enlarged annotation image */}
            {enlargedImage && (
                <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
                    onClick={() => setEnlargedImage(null)}>
                    <div className="relative max-w-5xl w-full">
                        <img src={enlargedImage} alt="Annotation" className="w-full rounded-lg" />
                        <button onClick={() => setEnlargedImage(null)}
                            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
