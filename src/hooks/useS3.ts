import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Authorization': `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    };
  };

  const listFiles = useCallback(async (prefix: string = '') => {
    setIsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-operations`);
      url.searchParams.set('action', 'list');
      if (prefix) url.searchParams.set('prefix', prefix);

      const response = await fetch(url.toString(), { headers });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error);
      setFiles(data.files);
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
      const headers = await getAuthHeaders();
      const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-operations`);
      url.searchParams.set('action', 'download');
      url.searchParams.set('key', key);

      const response = await fetch(url.toString(), { headers });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error);
      
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
      const headers = await getAuthHeaders();
      const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-operations`);
      url.searchParams.set('action', 'upload');

      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

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
      if (!response.ok) throw new Error(data.error);

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
      const headers = await getAuthHeaders();
      const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-operations`);
      url.searchParams.set('action', 'delete');
      url.searchParams.set('key', key);

      const response = await fetch(url.toString(), {
        method: 'DELETE',
        headers,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

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

  return {
    files,
    isLoading,
    listFiles,
    downloadFile,
    uploadFile,
    deleteFile,
  };
}
