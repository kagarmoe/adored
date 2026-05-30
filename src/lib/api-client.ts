import { ApiError } from "./api-error";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(path, {
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
      ...init,
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const error = await response.json();
        errorMessage = error.error || errorMessage;
      } catch {
        // If response is not JSON, use status message
      }
      throw new ApiError(response.status, errorMessage);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, error instanceof Error ? error.message : "Unknown error");
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, {
    method: "GET",
  });
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function apiDelete(path: string): Promise<void> {
  return apiFetch<void>(path, {
    method: "DELETE",
  });
}

export { ApiError };
