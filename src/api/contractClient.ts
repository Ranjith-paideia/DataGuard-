import { APIRequestContext } from '@playwright/test';

export interface RequestOptions {
  token?: string;
  data?: unknown;
  headers?: Record<string, string>;
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  latencyMs: number;
  headers: Record<string, string>;
}

/**
 * Reusable contract client wrapping Playwright's APIRequestContext.
 * Accurately measures response latency and safely parses JSON responses.
 */
export class ContractClient {
  constructor(private request: APIRequestContext) {}

  async send<T = any>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }

    const start = performance.now();
    const response = await this.request.fetch(path, {
      method,
      headers,
      data: options.data !== undefined ? options.data : undefined,
    });
    const latencyMs = performance.now() - start;

    let body: any;
    const text = await response.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    return {
      status: response.status(),
      body,
      latencyMs,
      headers: response.headers(),
    };
  }

  get<T = any>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.send<T>('GET', path, options);
  }

  post<T = any>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.send<T>('POST', path, options);
  }

  patch<T = any>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.send<T>('PATCH', path, options);
  }

  delete<T = any>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.send<T>('DELETE', path, options);
  }
}
