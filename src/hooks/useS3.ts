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

  const MULTIPART_THRESHOLD = 500 * 1024 * 1024; // 500 MB
  const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB per part
  const CONCURRENCY = 4; // parallel part uploads

  // Smoothly animates progress from current value up to `cap` while the upload is running.
  // Returns a stop function to call when the real upload finishes.
  const startProgressSimulation = (onProgress: (p: number) => void, cap: number) => {
    let current = 0;
    const id = setInterval(() => {
      // Eases in: fast at first, slows as it approaches cap
      const remaining = cap - current;
      const step = Math.max(1, Math.round(remaining * 0.06));
      current = Math.min(current + step, cap);
      onProgress(current);
    }, 300);
    return () => clearInterval(id);
  };

  const uploadFile = useCallback(async (key: string, file: File, onProgress?: (percent: number) => void) => {
    try {
      const token = localStorage.getItem('auth_token');
      const authHeader = { Authorization: `Bearer ${token}` } as Record<string, string>;

      if (file.size <= MULTIPART_THRESHOLD) {
        // Single upload — simulate progress since Express→S3 phase has no events
        const stopSim = onProgress ? startProgressSimulation(onProgress, 90) : null;

        const url = new URL('/api/files/upload', apiBase);
        url.searchParams.set('key', key);
        url.searchParams.set('contentType', file.type);

        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });

        stopSim?.();
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || 'Failed to upload file');
        onProgress?.(100);
      } else {
        // Multipart upload with parallel parts for files > 500 MB
        const totalParts = Math.ceil(file.size / CHUNK_SIZE);
        // Track simulated progress per part (0–100 each)
        const partProgress = new Array(totalParts).fill(0);

        const reportProgress = () => {
          const avg = partProgress.reduce((a, b) => a + b, 0) / totalParts;
          onProgress?.(Math.round(avg * 0.95)); // cap at 95 until complete
        };

        // 1. Init
        const initUrl = new URL('/api/files/multipart/init', apiBase);
        initUrl.searchParams.set('key', key);
        initUrl.searchParams.set('contentType', file.type);
        const initRes = await fetch(initUrl.toString(), { method: 'POST', headers: authHeader });
        const initData = await initRes.json() as { ok: boolean; uploadId?: string; error?: string };
        if (!initRes.ok) throw new Error(initData.error || 'Failed to initiate multipart upload');
        const { uploadId } = initData;

        const parts: { partNumber: number; etag: string }[] = [];

        try {
          // 2. Upload parts in parallel batches, each with its own progress simulation
          for (let batch = 0; batch < totalParts; batch += CONCURRENCY) {
            const batchIndices = Array.from(
              { length: Math.min(CONCURRENCY, totalParts - batch) },
              (_, j) => batch + j
            );

            const batchResults = await Promise.all(
              batchIndices.map(async (i) => {
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);

                const partUrl = new URL('/api/files/multipart/part', apiBase);
                partUrl.searchParams.set('key', key);
                partUrl.searchParams.set('uploadId', uploadId!);
                partUrl.searchParams.set('partNumber', String(i + 1));

                // Simulate this part's progress while it uploads
                const stopPartSim = startProgressSimulation((p) => {
                  partProgress[i] = p;
                  reportProgress();
                }, 90);

                const response = await fetch(partUrl.toString(), {
                  method: 'POST',
                  headers: { ...authHeader, 'Content-Type': 'application/octet-stream' },
                  body: chunk,
                });

                stopPartSim();
                partProgress[i] = 100;
                reportProgress();

                const partData = await response.json() as { ok: boolean; etag?: string; error?: string };
                if (!response.ok) throw new Error(partData.error || `Part ${i + 1} upload failed`);
                return { partNumber: i + 1, etag: partData.etag! };
              })
            );

            parts.push(...batchResults);
          }

          // Sort parts by partNumber before completing
          parts.sort((a, b) => a.partNumber - b.partNumber);

          // 3. Complete
          const completeRes = await fetch(new URL('/api/files/multipart/complete', apiBase).toString(), {
            method: 'POST',
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, uploadId, parts, size: file.size }),
          });
          const completeData = await completeRes.json() as { ok: boolean; error?: string };
          if (!completeRes.ok) throw new Error(completeData.error || 'Failed to complete multipart upload');
          onProgress?.(100);
        } catch (partError) {
          await fetch(new URL('/api/files/multipart/abort', apiBase).toString(), {
            method: 'POST',
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, uploadId }),
          });
          throw partError;
        }
      }

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

  const renameFile = useCallback(async (oldKey: string, newName: string): Promise<string | null> => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(new URL('/api/files/rename', apiBase).toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify({ oldKey, newName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Rename failed');
      toast({ title: 'Renamed', description: `File renamed to ${newName}` });
      return data.newKey as string;
    } catch (error) {
      toast({
        title: 'Rename failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  const getFileUrl = useCallback(async (key: string): Promise<string | null> => {
    try {
      const headers = getAuthHeaders();
      const url = new URL('/api/files/download', apiBase);
      url.searchParams.set('key', key);
      const response = await fetch(url.toString(), { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to get URL');
      return data.url as string;
    } catch {
      return null;
    }
  }, []);

  return {
    files,
    isLoading,
    listFiles,
    downloadFile,
    uploadFile,
    deleteFile,
    createFolder,
    copyFile,
    getFileUrl,
    renameFile,
  };
}
