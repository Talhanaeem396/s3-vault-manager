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

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';

    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    return btoa(binary);
  };

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
      const url = new URL('/api/files', window.location.origin);
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
      const url = new URL('/api/files/download', window.location.origin);
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
      const url = new URL('/api/files/upload', window.location.origin);

      const arrayBuffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          key,
          content: base64,
          contentType: file.type,
        }),
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
      const url = new URL('/api/files', window.location.origin);
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
      const response = await fetch('/api/files/copy', {
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
      const response = await fetch('/api/folders', {
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
