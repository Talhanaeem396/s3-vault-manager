import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useS3 } from '@/hooks/useS3';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileCard } from '@/components/FileCard';
import { UploadDialog } from '@/components/UploadDialog';
import {
  FolderOpen,
  FolderPlus,
  Upload,
  Search,
  RefreshCw,
  LogOut,
  Settings,
  Home,
  ChevronRight,
  Loader2,
  ArrowUpDown,
  CalendarDays,
  X,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

export default function Dashboard() {
  const { user, signOut, isLoading: authLoading } = useAuth();
  const { files, isLoading, listFiles, downloadFile, uploadFile, deleteFile, createFolder, copyFile, getFileUrl, renameFile } = useS3();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPath, setCurrentPath] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copySourceKey, setCopySourceKey] = useState('');
  const [copyDestination, setCopyDestination] = useState('');
  const [isCopying, setIsCopying] = useState(false);
  const [sortBy, setSortBy] = useState('date-desc');
  const [filterDate, setFilterDate] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');
  const [previewText, setPreviewText] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const publicBaseUrl = import.meta.env.VITE_S3_PUBLIC_BASE_URL;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      listFiles(currentPath);
    }
  }, [user, currentPath, listFiles]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleUpload = async (key: string, file: File) => {
    const success = await uploadFile(key, file);
    if (success) {
      await listFiles(currentPath);
    }
    return success;
  };

  const handleDelete = async (key: string) => {
    const success = await deleteFile(key);
    if (success) {
      await listFiles(currentPath);
    }
    return success;
  };

  const handleCopyTo = (key: string) => {
    setCopySourceKey(key);
    setCopyDestination(currentPath || '');
    setShowCopyDialog(true);
  };

  const handleCopyConfirm = async () => {
    if (!copySourceKey || !copyDestination.trim()) return;
    setIsCopying(true);

    const isFolder = copySourceKey.endsWith('/');
    const safeDestination = copyDestination.trim();
    const sourceName = copySourceKey.split('/').filter(Boolean).pop() || copySourceKey;
    const destinationKey = safeDestination.endsWith('/')
      ? `${safeDestination}${sourceName}${isFolder ? '/' : ''}`
      : `${safeDestination}/${sourceName}${isFolder ? '/' : ''}`;

    const success = await copyFile(copySourceKey, destinationKey);
    setIsCopying(false);

    if (success) {
      setShowCopyDialog(false);
      setCopySourceKey('');
      await listFiles(currentPath);
    }
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    setIsCreatingFolder(true);
    const safeName = folderName.trim().replace(/\/+/g, '-');
    const key = currentPath ? `${currentPath}${safeName}/` : `${safeName}/`;
    const success = await createFolder(key);
    setIsCreatingFolder(false);

    if (success) {
      setFolderName('');
      setShowCreateFolder(false);
      await listFiles(currentPath);
    }
  };

  const navigateToFolder = (path: string) => {
    setCurrentPath(path);
  };

  const handleOpenFolder = (key: string) => {
    setCurrentPath(key);
  };

  const pathParts = currentPath.split('/').filter(Boolean);

  const filteredFiles = files
    .filter((file) => {
      if (!file.key.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterDate) {
        const fileDate = new Date(file.lastModified).toISOString().slice(0, 10);
        if (fileDate !== filterDate) return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date-desc': return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
        case 'date-asc':  return new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
        case 'name-asc':  return a.key.localeCompare(b.key);
        case 'name-desc': return b.key.localeCompare(a.key);
        case 'size-desc': return (b.size ?? 0) - (a.size ?? 0);
        case 'size-asc':  return (a.size ?? 0) - (b.size ?? 0);
        default:          return 0;
      }
    });

  const buildPublicUrl = (key: string) => {
    if (!publicBaseUrl) return '';
    const sanitizedBase = publicBaseUrl.replace(/\/+$/, '');
    const encodedPath = key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${sanitizedBase}/${encodedPath}`;
  };

  const handleRename = async (key: string, newName: string) => {
    const newKey = await renameFile(key, newName);
    if (newKey) await listFiles(currentPath);
  };

  const handlePreview = async (key: string) => {
    const name = key.split('/').pop() || key;
    const ext = name.split('.').pop()?.toLowerCase() || '';
    setPreviewName(name);
    setPreviewText(null);
    setPreviewUrl('loading');
    const url = await getFileUrl(key);
    if (!url) { setPreviewUrl(null); return; }
    if (ext === 'txt' || ext === 'md') {
      try {
        const res = await fetch(url);
        const text = await res.text();
        setPreviewText(text);
      } catch {
        setPreviewText('Failed to load file content.');
      }
      setPreviewUrl(url);
    } else {
      setPreviewUrl(url);
    }
  };

  const handleCopyUrl = async (key: string) => {
    const url = buildPublicUrl(key);
    if (!url) {
      toast({
        title: 'Public URL not configured',
        description: 'Set VITE_S3_PUBLIC_BASE_URL in .env to enable copy.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Copied', description: 'Object URL copied to clipboard.' });
    } catch (error) {
      toast({
        title: 'Copy failed',
        description: error instanceof Error ? error.message : 'Unable to copy URL',
        variant: 'destructive',
      });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center">
              <img src="/logo.svg" alt="Logo" className="h-8 w-auto" />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowUpload(true)}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {user?.email?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.email}</p>
                  <p className="text-xs text-muted-foreground">Administrator</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/admin')}>
                  <Settings className="mr-2 h-4 w-4" />
                  Admin Panel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your Files</h1>
            <p className="text-sm text-muted-foreground">
              Manage uploads, share object URLs, and keep everything organized.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => listFiles(currentPath)}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" onClick={() => setShowCreateFolder(true)}>
              <FolderPlus className="mr-2 h-4 w-4" />
              New Folder
            </Button>
            <Button onClick={() => setShowUpload(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Upload File
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 mb-6 shadow-sm">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Sort */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-48">
                <ArrowUpDown className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Date — Newest first</SelectItem>
                <SelectItem value="date-asc">Date — Oldest first</SelectItem>
                <SelectItem value="name-asc">Name — A to Z</SelectItem>
                <SelectItem value="name-desc">Name — Z to A</SelectItem>
                <SelectItem value="size-desc">Size — Largest first</SelectItem>
                <SelectItem value="size-asc">Size — Smallest first</SelectItem>
              </SelectContent>
            </Select>

            {/* Date filter */}
            <div className="relative w-full sm:w-48">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="pl-10 pr-8"
              />
              {filterDate && (
                <button
                  onClick={() => setFilterDate('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 mt-4 text-sm">
            {pathParts.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => navigateToFolder('')}
              >
                All Files
              </Button>
            )}
            {pathParts.map((part, index) => (
              <div key={index} className="flex items-center">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() =>
                    navigateToFolder(pathParts.slice(0, index + 1).join('/') + '/')
                  }
                >
                  {part}
                </Button>
              </div>
            ))}
          </nav>
        </div>

        {/* Files Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-16 border rounded-xl bg-muted/20">
            <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No files found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || filterDate
                ? 'Try a different search term or clear the date filter'
                : 'Upload your first file to get started'}
            </p>
            {!searchQuery && (
              <Button onClick={() => setShowUpload(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Upload File
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredFiles.map((file) => (
              <FileCard
                key={file.key}
                file={file}
                onDownload={downloadFile}
                onDelete={handleDelete}
                onCopyUrl={handleCopyUrl}
                onOpen={handleOpenFolder}
                onCopyTo={handleCopyTo}
                onPreview={handlePreview}
                onRename={handleRename}
              />
            ))}
          </div>
        )}
      </main>

      {/* Upload Dialog */}
      <UploadDialog
        open={showUpload}
        onOpenChange={setShowUpload}
        onUpload={handleUpload}
        currentPath={currentPath}
      />

      <Dialog open={showCreateFolder} onOpenChange={setShowCreateFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>
              Create a new folder in {currentPath || 'the root folder'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="folder-name">Folder name</Label>
            <Input
              id="folder-name"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="New folder"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateFolder(false)} disabled={isCreatingFolder}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!folderName.trim() || isCreatingFolder}>
              {isCreatingFolder ? 'Creating...' : 'Create Folder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Media & Document Preview Dialog */}
      {(() => {
        const ext = previewName.split('.').pop()?.toLowerCase() || '';
        const isImg  = /^(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/.test(ext);
        const isVid  = /^(mp4|webm|mov|avi|mkv|m4v)$/.test(ext);
        const isPdf  = ext === 'pdf';
        const isText = ext === 'txt' || ext === 'md';
        const isOffice = ext === 'doc' || ext === 'docx';

        return (
          <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) { setPreviewUrl(null); setPreviewText(null); } }}>
            <DialogContent className={`w-full p-0 overflow-hidden ${isText || isPdf || isOffice ? 'max-w-4xl' : 'max-w-4xl'}`}>
              <DialogHeader className="px-4 pt-4 pb-2 border-b">
                <DialogTitle className="truncate text-sm font-medium">{previewName}</DialogTitle>
                <DialogDescription className="sr-only">Preview for {previewName}</DialogDescription>
              </DialogHeader>

              {previewUrl === 'loading' ? (
                <div className="flex items-center justify-center min-h-[300px] bg-black">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
              ) : previewUrl ? (
                <>
                  {isImg && (
                    <div className="bg-black flex items-center justify-center min-h-[300px]">
                      <img src={previewUrl} alt={previewName} className="max-w-full max-h-[75vh] object-contain" />
                    </div>
                  )}
                  {isVid && (
                    <div className="bg-black">
                      <video key={previewUrl} src={previewUrl} controls autoPlay className="w-full max-h-[70vh]" />
                    </div>
                  )}
                  {isPdf && (
                    <iframe
                      key={previewUrl}
                      src={previewUrl}
                      className="w-full"
                      style={{ height: '75vh' }}
                      title={previewName}
                    />
                  )}
                  {isOffice && (
                    <iframe
                      key={previewUrl}
                      src={`https://docs.google.com/gview?url=${encodeURIComponent(previewUrl)}&embedded=true`}
                      className="w-full"
                      style={{ height: '75vh' }}
                      title={previewName}
                    />
                  )}
                  {isText && (
                    <div className="overflow-auto" style={{ maxHeight: '75vh' }}>
                      <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words leading-relaxed">
                        {previewText ?? 'Loading...'}
                      </pre>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center min-h-[200px]">
                  <p className="text-muted-foreground text-sm">Failed to load preview</p>
                </div>
              )}
            </DialogContent>
          </Dialog>
        );
      })()}


      <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy to Folder</DialogTitle>
            <DialogDescription>
              Choose a destination folder for this item.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="copy-destination">Destination path</Label>
            <Input
              id="copy-destination"
              value={copyDestination}
              onChange={(event) => setCopyDestination(event.target.value)}
              placeholder="e.g. Test/ or Project/Subfolder"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCopyDialog(false)} disabled={isCopying}>
              Cancel
            </Button>
            <Button onClick={handleCopyConfirm} disabled={!copyDestination.trim() || isCopying}>
              {isCopying ? 'Copying...' : 'Copy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
