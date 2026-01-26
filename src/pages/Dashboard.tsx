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
  Upload,
  Search,
  RefreshCw,
  LogOut,
  Settings,
  Home,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function Dashboard() {
  const { user, isAdmin, signOut, isLoading: authLoading } = useAuth();
  const { files, isLoading, listFiles, downloadFile, uploadFile, deleteFile } = useS3();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPath, setCurrentPath] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const navigate = useNavigate();

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

  const navigateToFolder = (path: string) => {
    setCurrentPath(path);
  };

  const pathParts = currentPath.split('/').filter(Boolean);

  const filteredFiles = files.filter((file) =>
    file.key.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <FolderOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">File Manager</span>
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
                  <p className="text-xs text-muted-foreground">
                    {isAdmin ? 'Administrator' : 'User'}
                  </p>
                </div>
                <DropdownMenuSeparator />
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate('/admin')}>
                    <Settings className="mr-2 h-4 w-4" />
                    Admin Panel
                  </DropdownMenuItem>
                )}
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
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => listFiles(currentPath)}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 mb-6 text-sm">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => navigateToFolder('')}
          >
            <Home className="h-4 w-4" />
          </Button>
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

        {/* Files Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12">
            <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No files found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery
                ? 'Try a different search term'
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredFiles.map((file) => (
              <FileCard
                key={file.key}
                file={file}
                onDownload={downloadFile}
                onDelete={handleDelete}
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
    </div>
  );
}
