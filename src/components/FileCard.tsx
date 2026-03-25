import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FileIcon, FolderIcon, MoreVertical, Download, Trash2, FileText, Image, Video, Music, Archive, Copy, FolderInput, Play, Pencil, ZoomIn } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDistanceToNow } from 'date-fns';

interface FileCardProps {
  file: {
    key: string;
    size: number;
    lastModified: string;
  };
  onDownload: (key: string) => void;
  onDelete: (key: string) => Promise<boolean>;
  onCopyUrl?: (key: string) => void;
  onOpen?: (key: string) => void;
  onCopyTo?: (key: string) => void;
  onPreview?: (key: string) => void;
  onRename?: (key: string, newName: string) => Promise<void>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) {
    return <Image className="h-8 w-8 text-accent" />;
  }
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext || '')) {
    return <Video className="h-8 w-8 text-purple-500" />;
  }
  if (['mp3', 'wav', 'ogg', 'flac'].includes(ext || '')) {
    return <Music className="h-8 w-8 text-pink-500" />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
    return <Archive className="h-8 w-8 text-yellow-500" />;
  }
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext || '')) {
    return <FileText className="h-8 w-8 text-primary" />;
  }
  
  return <FileIcon className="h-8 w-8 text-muted-foreground" />;
}

const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'];
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
const DOC_EXTS   = ['pdf', 'txt', 'md', 'doc', 'docx'];

function getExt(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

function isVideoFile(fileName: string)    { return VIDEO_EXTS.includes(getExt(fileName)); }
function isImageFile(fileName: string)    { return IMAGE_EXTS.includes(getExt(fileName)); }
function isDocumentFile(fileName: string) { return DOC_EXTS.includes(getExt(fileName)); }

export function FileCard({ file, onDownload, onDelete, onCopyUrl, onOpen, onCopyTo, onPreview, onRename }: FileCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const isFolder = file.key.endsWith('/');
  const fileKeyTrimmed = isFolder ? file.key.replace(/\/$/, '') : file.key;
  const fileName = fileKeyTrimmed.split('/').pop() || fileKeyTrimmed;
  const isVideo    = !isFolder && isVideoFile(fileName);
  const isImage    = !isFolder && isImageFile(fileName);
  const isDocument = !isFolder && isDocumentFile(fileName);

  const handleDelete = async () => {
    setIsDeleting(true);
    const success = await onDelete(file.key);
    setIsDeleting(false);
    if (success) setShowDeleteDialog(false);
  };

  const openRename = () => {
    setRenameValue(fileName);
    setShowRenameDialog(true);
  };

  const handleRename = async () => {
    if (!renameValue.trim() || !onRename) return;
    setIsRenaming(true);
    await onRename(file.key, renameValue.trim());
    setIsRenaming(false);
    setShowRenameDialog(false);
  };

  return (
    <>
      <Card
        className="hover:shadow-md transition-shadow cursor-pointer group"
        onClick={() => {
          if (isFolder && onOpen) onOpen(file.key);
          else if ((isVideo || isImage || isDocument) && onPreview) onPreview(file.key);
        }}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 relative">
              {isFolder ? (
                <FolderIcon className="h-8 w-8 text-primary" />
              ) : (
                getFileIcon(fileName)
              )}
              {isVideo && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-black/60 rounded-full p-0.5">
                    <Play className="h-4 w-4 text-white fill-white" />
                  </div>
                </div>
              )}
              {isImage && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-black/60 rounded-full p-0.5">
                    <ZoomIn className="h-4 w-4 text-white" />
                  </div>
                </div>
              )}
              {isDocument && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-primary/80 rounded-full p-0.5">
                    <ZoomIn className="h-4 w-4 text-white" />
                  </div>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate" title={fileName}>
                {fileName}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <span>{formatBytes(file.size)}</span>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(file.lastModified), { addSuffix: true })}</span>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {(isVideo || isImage || isDocument) && onPreview && (
                  <DropdownMenuItem onClick={() => onPreview(file.key)}>
                    {isVideo ? <Play className="mr-2 h-4 w-4" /> : <ZoomIn className="mr-2 h-4 w-4" />}
                    Preview
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onDownload(file.key)}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </DropdownMenuItem>
                {onCopyUrl && (
                  <DropdownMenuItem onClick={() => onCopyUrl(file.key)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy URL
                  </DropdownMenuItem>
                )}
                {onCopyTo && (
                  <DropdownMenuItem onClick={() => onCopyTo(file.key)}>
                    <FolderInput className="mr-2 h-4 w-4" />
                    Copy to...
                  </DropdownMenuItem>
                )}
                {!isFolder && onRename && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openRename(); }}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
            <DialogDescription>Enter a new name for "{fileName}"</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-input">New name</Label>
            <Input
              id="rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)} disabled={isRenaming}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!renameValue.trim() || isRenaming}>
              {isRenaming ? 'Renaming...' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{fileName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
