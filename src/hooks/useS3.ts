import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface S3File {
  key: string;
  size: number;
  lastModified: string;
}

export function useS3() {
  const [files, setFiles] = useState<S3File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const apiBase = import.meta.env.VITE_API_BASE_URL || window.location.origin;

  const getAuthHeaders = () => {
    const token = localStorage.getItem('auth_token');
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const listFiles = useCallback(async (prefix: string = '') => {
    setIsLoading(true);
    try {
      const headers = getAuthHeaders();
      const url = new URL('/api/files', apiBase);
      if (prefix) url.searchParams.set('prefix', prefix);

      const response = await fetch(url.toString(), { headers });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to list files');
      setFiles(data.files || []);
    } catch (error) {
      toast({
        title: 'Failed to list files',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const downloadFile = useCallback(async (key: string) => {
    try {
      const headers = getAuthHeaders();
      const url = new URL('/api/files/download', apiBase);
      url.searchParams.set('key', key);

      const response = await fetch(url.toString(), { headers });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to download file');

      window.open(data.url, '_blank');
    } catch (error) {
      toast({
        title: 'Failed to download file',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const uploadFile = useCallback(async (key: string, file: File) => {
    try {
      const headers = getAuthHeaders();
      const url = new URL('/api/files/upload', apiBase);
      url.searchParams.set('key', key);
      url.searchParams.set('contentType', file.type);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to upload file');

      toast({
        title: 'File uploaded',
        description: `${file.name} has been uploaded successfully`,
      });

      return true;
    } catch (error) {
      toast({
        title: 'Failed to upload file',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  const deleteFile = useCallback(async (key: string) => {
    try {
      const headers = getAuthHeaders();
      const url = new URL('/api/files', apiBase);
      url.searchParams.set('key', key);

      const response = await fetch(url.toString(), {
        method: 'DELETE',
        headers,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete file');

      toast({
        title: 'File deleted',
        description: 'The file has been deleted successfully',
      });

      return true;
    } catch (error) {
      toast({
        title: 'Failed to delete file',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  const copyFile = useCallback(async (sourceKey: string, destinationKey: string) => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(new URL('/api/files/copy', apiBase).toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify({ sourceKey, destinationKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to copy');

      toast({
        title: 'Copied',
        description: 'File copied successfully.',
      });
      return true;
    } catch (error) {
      toast({
        title: 'Copy failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  const createFolder = useCallback(async (key: string) => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(new URL('/api/folders', apiBase).toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify({ key }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create folder');

      toast({
        title: 'Folder created',
        description: 'Your folder is ready.',
      });

      return true;
    } catch (error) {
      toast({
        title: 'Failed to create folder',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  return {
    files,
    isLoading,
    listFiles,
    downloadFile,
    uploadFile,
    deleteFile,
    createFolder,
    copyFile,
  };
}
