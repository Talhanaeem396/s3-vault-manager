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
import { FileIcon, FolderIcon, MoreVertical, Download, Trash2, FileText, Image, Video, Music, Archive, Copy, FolderInput } from 'lucide-react';
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

export function FileCard({ file, onDownload, onDelete, onCopyUrl, onOpen, onCopyTo }: FileCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const isFolder = file.key.endsWith('/');
  const fileKeyTrimmed = isFolder ? file.key.replace(/\/$/, '') : file.key;
  const fileName = fileKeyTrimmed.split('/').pop() || fileKeyTrimmed;

  const handleDelete = async () => {
    setIsDeleting(true);
    const success = await onDelete(file.key);
    setIsDeleting(false);
    if (success) {
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <Card
        className="hover:shadow-md transition-shadow cursor-pointer group"
        onClick={() => {
          if (isFolder && onOpen) {
            onOpen(file.key);
          }
        }}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              {isFolder ? (
                <FolderIcon className="h-8 w-8 text-primary" />
              ) : (
                getFileIcon(fileName)
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
              <DropdownMenuContent align="end">
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
