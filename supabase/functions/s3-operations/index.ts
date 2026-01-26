import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
}

async function getS3Config(): Promise<S3Config> {
  return {
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID') || '',
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY') || '',
    bucket: Deno.env.get('AWS_S3_BUCKET') || '',
    region: Deno.env.get('AWS_REGION') || 'us-east-1',
  };
}

async function signRequest(
  method: string,
  url: URL,
  headers: Headers,
  body: Uint8Array | null,
  config: S3Config
): Promise<Headers> {
  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  
  headers.set('x-amz-date', amzDate);
  headers.set('host', url.host);
  
  const payloadHash = body 
    ? await crypto.subtle.digest('SHA-256', new Uint8Array(body)).then(h => 
        Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''))
    : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  
  headers.set('x-amz-content-sha256', payloadHash);
  
  const signedHeaders = [...headers.keys()].sort().join(';');
  const canonicalHeaders = [...headers.keys()].sort()
    .map(k => `${k}:${headers.get(k)}\n`).join('');
  
  const canonicalRequest = [
    method,
    url.pathname,
    url.search.slice(1),
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  
  const canonicalRequestHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest))
    .then(h => Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''));
  
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;
  
  const encoder = new TextEncoder();
  const kDate = await crypto.subtle.importKey('raw', encoder.encode(`AWS4${config.secretAccessKey}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(key => crypto.subtle.sign('HMAC', key, encoder.encode(dateStamp)));
  const kRegion = await crypto.subtle.importKey('raw', kDate, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(key => crypto.subtle.sign('HMAC', key, encoder.encode(config.region)));
  const kService = await crypto.subtle.importKey('raw', kRegion, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(key => crypto.subtle.sign('HMAC', key, encoder.encode('s3')));
  const kSigning = await crypto.subtle.importKey('raw', kService, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(key => crypto.subtle.sign('HMAC', key, encoder.encode('aws4_request')));
  
  const signature = await crypto.subtle.importKey('raw', kSigning, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(key => crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign)))
    .then(sig => Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join(''));
  
  headers.set('Authorization', 
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`);
  
  return headers;
}

async function listObjects(config: S3Config, prefix: string = ''): Promise<any[]> {
  const url = new URL(`https://${config.bucket}.s3.${config.region}.amazonaws.com/`);
  url.searchParams.set('list-type', '2');
  if (prefix) url.searchParams.set('prefix', prefix);
  
  const headers = await signRequest('GET', url, new Headers(), null, config);
  const response = await fetch(url.toString(), { headers });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list objects: ${error}`);
  }
  
  const xml = await response.text();
  const files: any[] = [];
  
  const contentMatches = xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g);
  for (const match of contentMatches) {
    const content = match[1];
    const key = content.match(/<Key>(.*?)<\/Key>/)?.[1] || '';
    const size = parseInt(content.match(/<Size>(.*?)<\/Size>/)?.[1] || '0');
    const lastModified = content.match(/<LastModified>(.*?)<\/LastModified>/)?.[1] || '';
    
    files.push({ key, size, lastModified });
  }
  
  return files;
}

async function getSignedUrl(config: S3Config, key: string, expiresIn: number = 3600): Promise<string> {
  const url = new URL(`https://${config.bucket}.s3.${config.region}.amazonaws.com/${encodeURIComponent(key)}`);
  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  
  url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  url.searchParams.set('X-Amz-Credential', `${config.accessKeyId}/${credentialScope}`);
  url.searchParams.set('X-Amz-Date', amzDate);
  url.searchParams.set('X-Amz-Expires', expiresIn.toString());
  url.searchParams.set('X-Amz-SignedHeaders', 'host');
  
  const canonicalRequest = [
    'GET',
    `/${encodeURIComponent(key)}`,
    url.searchParams.toString(),
    `host:${config.bucket}.s3.${config.region}.amazonaws.com\n`,
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n');
  
  const canonicalRequestHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest))
    .then(h => Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''));
  
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;
  
  const encoder = new TextEncoder();
  const kDate = await crypto.subtle.importKey('raw', encoder.encode(`AWS4${config.secretAccessKey}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(key => crypto.subtle.sign('HMAC', key, encoder.encode(dateStamp)));
  const kRegion = await crypto.subtle.importKey('raw', kDate, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(key => crypto.subtle.sign('HMAC', key, encoder.encode(config.region)));
  const kService = await crypto.subtle.importKey('raw', kRegion, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(key => crypto.subtle.sign('HMAC', key, encoder.encode('s3')));
  const kSigning = await crypto.subtle.importKey('raw', kService, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(key => crypto.subtle.sign('HMAC', key, encoder.encode('aws4_request')));
  
  const signature = await crypto.subtle.importKey('raw', kSigning, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(key => crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign)))
    .then(sig => Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join(''));
  
  url.searchParams.set('X-Amz-Signature', signature);
  return url.toString();
}

async function uploadObject(config: S3Config, key: string, content: Uint8Array, contentType: string): Promise<void> {
  const url = new URL(`https://${config.bucket}.s3.${config.region}.amazonaws.com/${encodeURIComponent(key)}`);
  const headers = new Headers();
  headers.set('content-type', contentType);
  headers.set('content-length', content.length.toString());
  
  const signedHeaders = await signRequest('PUT', url, headers, content, config);
  const bodyBuffer = new ArrayBuffer(content.length);
  new Uint8Array(bodyBuffer).set(content);
  const response = await fetch(url.toString(), {
    method: 'PUT',
    headers: signedHeaders,
    body: bodyBuffer
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload: ${error}`);
  }
}

async function deleteObject(config: S3Config, key: string): Promise<void> {
  const url = new URL(`https://${config.bucket}.s3.${config.region}.amazonaws.com/${encodeURIComponent(key)}`);
  const headers = await signRequest('DELETE', url, new Headers(), null, config);
  
  const response = await fetch(url.toString(), {
    method: 'DELETE',
    headers
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete: ${error}`);
  }
}

async function logActivity(supabase: any, userId: string, action: string, filePath: string, fileName?: string, details?: any) {
  await supabase.from('file_activity_logs').insert({
    user_id: userId,
    action,
    file_path: filePath,
    file_name: fileName,
    details
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const config = await getS3Config();
    if (!config.accessKeyId || !config.secretAccessKey || !config.bucket) {
      return new Response(JSON.stringify({ error: 'S3 not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    switch (action) {
      case 'list': {
        const prefix = url.searchParams.get('prefix') || '';
        const files = await listObjects(config, prefix);
        await logActivity(supabase, user.id, 'list', prefix || '/', undefined, { count: files.length });
        return new Response(JSON.stringify({ files }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'download': {
        const key = url.searchParams.get('key');
        if (!key) {
          return new Response(JSON.stringify({ error: 'Key required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        const signedUrl = await getSignedUrl(config, key);
        await logActivity(supabase, user.id, 'download', key, key.split('/').pop());
        return new Response(JSON.stringify({ url: signedUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'upload': {
        const body = await req.json();
        const { key, content, contentType } = body;
        if (!key || !content) {
          return new Response(JSON.stringify({ error: 'Key and content required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        const bytes = Uint8Array.from(atob(content), c => c.charCodeAt(0));
        await uploadObject(config, key, bytes, contentType || 'application/octet-stream');
        await logActivity(supabase, user.id, 'upload', key, key.split('/').pop(), { size: bytes.length });
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'delete': {
        const key = url.searchParams.get('key');
        if (!key) {
          return new Response(JSON.stringify({ error: 'Key required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        await deleteObject(config, key);
        await logActivity(supabase, user.id, 'delete', key, key.split('/').pop());
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
